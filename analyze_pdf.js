const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

async function extractQuestionsFromPDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    
    try {
        const data = await pdf(dataBuffer);
        const content = data.text;
        
        // Extract questions and their mark schemes
        const sections = content.split(/Question \d+/g).slice(1); // Skip first split which is before first question
        
        const questions = sections.map(section => {
            // Find mark allocation if present [X marks]
            const markAllocation = section.match(/\[(\d+)\s*marks?\]/i);
            const marks = markAllocation ? markAllocation[1] : '';
            
            // Split into question and mark scheme if possible
            const [questionPart, markSchemePart] = section.split(/Mark scheme/i);
            
            return {
                question: questionPart ? `Question${questionPart}${marks ? ` [${marks} marks]` : ''}` : '',
                markScheme: markSchemePart ? `Mark scheme${markSchemePart}` : ''
            };
        }).filter(q => q.question && q.markScheme); // Only keep complete question-mark scheme pairs
        
        return questions;
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
