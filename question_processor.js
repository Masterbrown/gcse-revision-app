const fs = require('fs');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');
const pdfExtract = new PDFExtract();
const { ExampleQuestion } = require('./question_schema');

// Configuration for different question types and patterns
const CONFIG = {
    // Patterns to identify different parts of questions
    patterns: {
        questionStart: /^(\d+)\./,
        partLabel: /^\(?([a-z])\)/i,
        marks: /\((\d+)\s*marks?\)/i,
        multipleChoice: /^[A-D][)\s]/,
        codeBlock: /^(function|def|class|public|private|void)\s/,
        tableHeader: /^\|[\s\-|]+\|$/,
        markScheme: /^Mark scheme:/i
    },
    
    // Keywords to identify question types
    keywords: {
        calculation: ['calculate', 'compute', 'work out', 'how many'],
        multipleChoice: ['which', 'select', 'choose', 'shade'],
        codeCompletion: ['complete', 'fill in', 'write the missing'],
        explanation: ['explain', 'describe', 'discuss', 'give a reason'],
        definition: ['define', 'what is', 'state what'],
        tableCompletion: ['complete the table', 'fill in the table']
    }
};

/**
 * Analyzes text to determine the type of question
 * @param {string} text - Question text to analyze
 * @returns {string} Question type
 */
function determineQuestionType(text) {
    const textLower = text.toLowerCase();
    
    for (const [type, keywords] of Object.entries(CONFIG.keywords)) {
        if (keywords.some(keyword => textLower.includes(keyword.toLowerCase()))) {
            return type;
        }
    }
    
    return 'written';
}

/**
 * Processes a block of text to identify code segments
 * @param {string} text - Text to process
 * @returns {Object} Processed text and any code segments found
 */
function processCodeSegments(text) {
    const lines = text.split('\n');
    const codeSegments = [];
    let currentSegment = null;
    const processedLines = [];
    
    for (const line of lines) {
        if (CONFIG.patterns.codeBlock.test(line)) {
            if (currentSegment) {
                codeSegments.push(currentSegment);
            }
            currentSegment = {
                type: 'code_reference',
                content: line
            };
        } else if (currentSegment) {
            if (line.trim().length === 0) {
                codeSegments.push(currentSegment);
                currentSegment = null;
            } else {
                currentSegment.content += '\n' + line;
            }
        } else {
            processedLines.push(line);
        }
    }
    
    if (currentSegment) {
        codeSegments.push(currentSegment);
    }
    
    return {
        text: processedLines.join('\n'),
        codeSegments
    };
}

/**
 * Processes a question part to extract marks and content
 * @param {string} text - Part text to process
 * @returns {Object} Processed part information
 */
function processQuestionPart(text) {
    const marksMatch = text.match(CONFIG.patterns.marks);
    const marks = marksMatch ? parseInt(marksMatch[1]) : 0;
    
    // Remove marks from text
    let cleanText = text.replace(CONFIG.patterns.marks, '').trim();
    
    // Process any code segments
    const { text: finalText, codeSegments } = processCodeSegments(cleanText);
    
    // Determine question type
    const type = determineQuestionType(finalText);
    
    // Extract multiple choice options if applicable
    let options = [];
    if (type === 'multipleChoice') {
        options = finalText.split('\n')
            .filter(line => CONFIG.patterns.multipleChoice.test(line))
            .map(line => line.replace(/^[A-D][)\s]/, '').trim());
    }
    
    return {
        text: finalText,
        marks,
        type,
        options,
        codeSegments
    };
}

/**
 * Processes a PDF file and converts questions to structured format
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<Array>} Array of structured questions
 */
async function processPDFToStructured(pdfPath) {
    try {
        const data = await pdfExtract.extract(pdfPath, {});
        const questions = [];
        let currentQuestion = null;
        let currentPart = null;
        let inMarkScheme = false;
        
        // Process each page
        for (const page of data.pages) {
            const lines = page.content
                .sort((a, b) => Math.abs(a.y - b.y) < 5 ? a.x - b.x : a.y - b.y)
                .map(item => item.str.trim())
                .filter(line => line.length > 0);
            
            for (const line of lines) {
                // Check for new question
                const questionMatch = line.match(CONFIG.patterns.questionStart);
                if (questionMatch) {
                    if (currentQuestion) {
                        questions.push(currentQuestion);
                    }
                    
                    currentQuestion = {
                        id: questionMatch[1],
                        unit: path.basename(pdfPath, '.pdf').replace('Unit', ''),
                        type: 'multi-part',
                        context: {
                            text: line.substring(questionMatch[0].length).trim(),
                            applies_to: [],
                            references: []
                        },
                        parts: [],
                        supplementary: []
                    };
                    continue;
                }
                
                // Check for question parts
                const partMatch = line.match(CONFIG.patterns.partLabel);
                if (partMatch && currentQuestion) {
                    if (currentPart) {
                        const processed = processQuestionPart(currentPart.text);
                        currentQuestion.parts.push({
                            ...currentPart,
                            ...processed
                        });
                    }
                    
                    currentPart = {
                        id: partMatch[1].toLowerCase(),
                        text: line.substring(partMatch[0].length).trim()
                    };
                    currentQuestion.context.applies_to.push(partMatch[1].toLowerCase());
                    continue;
                }
                
                // Check for mark scheme
                if (CONFIG.patterns.markScheme.test(line)) {
                    inMarkScheme = true;
                    continue;
                }
                
                // Add content to current part or mark scheme
                if (currentPart && !inMarkScheme) {
                    currentPart.text += ' ' + line;
                } else if (currentQuestion && inMarkScheme) {
                    if (!currentQuestion.mark_scheme) {
                        currentQuestion.mark_scheme = { points: [] };
                    }
                    if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
                        currentQuestion.mark_scheme.points.push(line.replace(/^[•\-]\s*/, '').trim());
                    }
                }
            }
        }
        
        // Add the last question
        if (currentQuestion) {
            if (currentPart) {
                const processed = processQuestionPart(currentPart.text);
                currentQuestion.parts.push({
                    ...currentPart,
                    ...processed
                });
            }
            questions.push(currentQuestion);
        }
        
        return questions;
    } catch (error) {
        console.error(`Error processing PDF ${pdfPath}:`, error);
        return [];
    }
}

/**
 * Process all PDFs in a directory
 * @param {string} directory - Directory containing PDFs
 * @returns {Promise<Object>} Structured questions by unit
 */
async function processAllPDFs(directory) {
    const structuredQuestions = {};
    
    try {
        const files = fs.readdirSync(directory);
        for (const file of files) {
            if (file.endsWith('.pdf')) {
                const pdfPath = path.join(directory, file);
                const questions = await processPDFToStructured(pdfPath);
                const unit = file.replace('Unit', '').replace('.pdf', '');
                structuredQuestions[unit] = questions;
            }
        }
        
        // Save the structured questions to a JSON file
        const outputPath = path.join(directory, 'structured_questions.json');
        fs.writeFileSync(outputPath, JSON.stringify(structuredQuestions, null, 2));
        console.log(`Processed questions saved to ${outputPath}`);
        
        return structuredQuestions;
    } catch (error) {
        console.error('Error processing PDFs:', error);
        return {};
    }
}

// Export functions for use in other files
module.exports = {
    processPDFToStructured,
    processAllPDFs,
    ExampleQuestion
};

// If run directly, process all PDFs in the PDF_files directory
if (require.main === module) {
    processAllPDFs('./PDF_files').catch(console.error);
}
