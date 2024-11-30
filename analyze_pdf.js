const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

async function extractQuestionsFromPDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    
    try {
        const data = await pdf(dataBuffer);
        const content = data.text;

        // Split content into lines and clean them
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const questions = [];
        let currentQuestion = '';
        let currentMarkScheme = '';
        let currentMarks = '';
        let isInQuestion = false;
        let questionNumber = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Look for question numbers (e.g., "1." or just numbered lines)
            const questionStart = line.match(/^(\d+)\./);
            if (questionStart) {
                // Save previous question if exists
                if (currentQuestion && currentMarks) {
                    questions.push({
                        question: currentQuestion.trim(),
                        markScheme: currentMarkScheme.trim() || 'Mark scheme not found',
                        marks: currentMarks
                    });
                }
                
                // Start new question
                questionNumber = questionStart[1];
                currentQuestion = line.substring(line.indexOf('.') + 1).trim();
                currentMarkScheme = '';
                currentMarks = '';
                isInQuestion = true;
                continue;
            }

            // Look for mark allocations
            const marksMatch = line.match(/\(?Total\s+(\d+)\s*marks?\)?/i);
            if (marksMatch) {
                currentMarks = marksMatch[1];
                continue;
            }

            // Look for mark scheme indicators
            if (line.match(/^Mark scheme:/i) || line.match(/^Marking scheme:/i)) {
                isInQuestion = false;
                continue;
            }

            // Add content to current section
            if (isInQuestion) {
                // Don't add page numbers or headers
                if (!line.match(/Page \d+ of \d+/) && !line.match(/Calday Grange Grammar School/)) {
                    currentQuestion += ' ' + line;
                }
            } else {
                // Only add mark scheme lines that look like marking points
                if (line.match(/^[•\-\*]|\d+[\s\.]|[A-Z]\)/) || 
                    line.match(/award|accept|allow|credit/i)) {
                    currentMarkScheme += '\n' + line;
                }
            }
        }

        // Add the last question
        if (currentQuestion && currentMarks) {
            questions.push({
                question: currentQuestion.trim(),
                markScheme: currentMarkScheme.trim() || 'Mark scheme not found',
                marks: currentMarks
            });
        }

        // Clean up and validate questions
        return questions
            .filter(q => 
                q.question && 
                q.marks && 
                q.question.length > 10
            )
            .map(q => ({
                question: `${q.question} [${q.marks} marks]`,
                markScheme: q.markScheme || 'Mark scheme not found'
            }));

    } catch (error) {
        console.error(`Error parsing PDF ${filePath}:`, error);
        return [];
    }
}

async function analyzeAllPDFs() {
    const pdfDir = './PDF_files';
    const unitContent = {};
    
    try {
        const files = fs.readdirSync(pdfDir);
        
        for (const file of files) {
            if (file.toLowerCase().endsWith('.pdf')) {
                const unitMatch = file.match(/Unit(\d+)/i);
                if (unitMatch) {
                    const unitNumber = unitMatch[1];
                    const questions = await extractQuestionsFromPDF(path.join(pdfDir, file));
                    unitContent[`3.${unitNumber}`] = questions;
                }
            }
        }
        
        // Save the extracted content to a JSON file
        fs.writeFileSync(
            './public/extracted_questions.json',
            JSON.stringify(unitContent, null, 2)
        );
        
        console.log('Successfully extracted questions from all PDFs');
        return unitContent;
    } catch (error) {
        console.error('Error processing PDFs:', error);
        return {};
    }
}

// Run the analysis if this file is run directly
if (require.main === module) {
    analyzeAllPDFs();
}

module.exports = { analyzeAllPDFs };
