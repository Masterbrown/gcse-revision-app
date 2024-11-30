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
        let currentQuestion = null;
        let currentMarkScheme = '';
        let isInMarkScheme = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for question start
            const questionMatch = line.match(/^(?:Question\s+)?(\d+)[\s\.]+(.*)/i);
            
            if (questionMatch) {
                // Save previous question if exists
                if (currentQuestion && currentMarkScheme) {
                    questions.push({
                        question: currentQuestion.trim(),
                        markScheme: currentMarkScheme.trim()
                    });
                }
                
                // Start new question
                currentQuestion = questionMatch[2];
                currentMarkScheme = '';
                isInMarkScheme = false;
                
                // Look ahead for marks
                const nextLine = lines[i + 1] || '';
                const marksMatch = (currentQuestion + ' ' + nextLine).match(/\[(\d+)\s*marks?\]/i);
                if (marksMatch) {
                    currentQuestion += ` [${marksMatch[1]} marks]`;
                }
                
                continue;
            }
            
            // Check for mark scheme start
            if (line.match(/^(?:Mark|Marking)\s+[Ss]cheme:?/) || 
                line.match(/^(?:Mark|Marking)\s+[Pp]oints:?/)) {
                isInMarkScheme = true;
                continue;
            }
            
            // Add content to current section
            if (isInMarkScheme) {
                if (line.match(/^\d+[\s\.]|[•\-\*]\s/)) {
                    currentMarkScheme += '\n' + line;
                } else {
                    currentMarkScheme += ' ' + line;
                }
            } else if (currentQuestion) {
                currentQuestion += ' ' + line;
            }
        }
        
        // Add the last question
        if (currentQuestion && currentMarkScheme) {
            questions.push({
                question: currentQuestion.trim(),
                markScheme: currentMarkScheme.trim()
            });
        }
        
        // Filter out invalid questions and clean up
        return questions.filter(q => 
            q.question && 
            q.markScheme && 
            q.question.length > 10 && 
            q.markScheme.length > 10
        ).map(q => ({
            question: q.question.replace(/\s+/g, ' '),
            markScheme: q.markScheme.replace(/\s+/g, ' ')
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
