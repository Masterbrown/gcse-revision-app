const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

async function extractQuestionsFromPDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    
    try {
        const data = await pdf(dataBuffer);
        const content = data.text;
        
        // Improved question extraction
        // First split by "Question" followed by a number
        const sections = content.split(/Question\s+\d+\.?\s*/g).slice(1);
        
        const questions = sections.map(section => {
            // Find mark allocation
            const markAllocation = section.match(/\[(\d+)\s*marks?\]/i);
            const marks = markAllocation ? markAllocation[1] : '';
            
            // Split into question and mark scheme, handling multiple possible formats
            let questionPart, markSchemePart;
            
            // Try different mark scheme markers
            const markSchemeMarkers = [
                /Mark scheme:/i,
                /Marking scheme:/i,
                /Mark points:/i,
                /Marking points:/i
            ];
            
            for (const marker of markSchemeMarkers) {
                const parts = section.split(marker);
                if (parts.length > 1) {
                    [questionPart, markSchemePart] = parts;
                    break;
                }
            }
            
            // If no explicit mark scheme found, try to find it by structure
            if (!markSchemePart && questionPart) {
                // Look for bullet points or numbered items after the question
                const bulletMatch = questionPart.match(/(.*?)(\s*[•\-\*]\s.*$)/s);
                if (bulletMatch) {
                    [, questionPart, markSchemePart] = bulletMatch;
                }
            }
            
            // Clean up the text
            const cleanText = (text) => {
                if (!text) return '';
                return text
                    .replace(/\s+/g, ' ')
                    .replace(/\n+/g, '\n')
                    .trim();
            };
            
            // Only include questions that have both a question and a mark scheme
            if (questionPart && (markSchemePart || marks)) {
                return {
                    question: cleanText(`Question: ${questionPart}${marks ? ` [${marks} marks]` : ''}`),
                    markScheme: cleanText(markSchemePart ? `Mark scheme:\n${markSchemePart}` : '')
                };
            }
            
            return null;
        }).filter(q => q !== null); // Remove any null entries
        
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
