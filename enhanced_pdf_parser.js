const fs = require('fs');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');
const sharp = require('sharp');
const tabula = require('tabula-js');

const pdfExtract = new PDFExtract();
const extractOptions = {};

// Map of unit numbers to their PDF files
const pdfToUnitMap = {
    'Unit1 (text friendly).pdf': '3.1',
    'Unit2.pdf': '3.2',
    'Unit3.pdf': '3.3',
    'Unit4.pdf': '3.4',
    'Unit5.pdf': '3.5',
    'Unit6.pdf': '3.6',
    'Unit7.pdf': '3.7',
    'Unit8.pdf': '3.8'
};

/**
 * Extract images from a PDF page
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {number} pageNum - Page number to extract from
 * @returns {Promise<Array>} Array of extracted images with metadata
 */
async function extractImages(pdfBuffer, pageNum) {
    try {
        const images = [];
        // Extract images using pdf.js-extract
        const data = await pdfExtract.extractBuffer(pdfBuffer, extractOptions);
        if (data.pages[pageNum - 1] && data.pages[pageNum - 1].content) {
            // Process and optimize images
            for (const content of data.pages[pageNum - 1].content) {
                if (content.image) {
                    const optimizedImage = await sharp(content.image)
                        .resize(800, null, { // Max width 800px, maintain aspect ratio
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 85 })
                        .toBuffer();

                    images.push({
                        data: optimizedImage.toString('base64'),
                        type: 'image/jpeg',
                        position: {
                            x: content.x,
                            y: content.y,
                            width: content.width,
                            height: content.height
                        }
                    });
                }
            }
        }
        return images;
    } catch (error) {
        console.error('Error extracting images:', error);
        return [];
    }
}

/**
 * Extract tables from a PDF page
 * @param {string} pdfPath - Path to the PDF file
 * @param {number} pageNum - Page number to extract from
 * @returns {Promise<Array>} Array of extracted tables
 */
async function extractTables(pdfPath, pageNum) {
    try {
        const tables = [];
        const extracted = await tabula(pdfPath)
            .extractCsv()
            .then(output => {
                const rows = output.split('\n')
                    .map(row => row.split(','))
                    .filter(row => row.some(cell => cell.trim().length > 0));
                
                if (rows.length > 0) {
                    tables.push({
                        data: rows,
                        position: {
                            page: pageNum
                        }
                    });
                }
                return tables;
            });
        return extracted;
    } catch (error) {
        console.error('Error extracting tables:', error);
        return [];
    }
}

/**
 * Process text content to identify code blocks
 * @param {string} text - Text content to analyze
 * @returns {Array} Array of identified code blocks
 */
function extractCodeBlocks(text) {
    const codeBlocks = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
        codeBlocks.push({
            language: match[1] || 'text',
            code: match[2].trim()
        });
    }

    return codeBlocks;
}

/**
 * Process text content to identify question parts
 * @param {string} text - Text content to analyze
 * @returns {Array} Array of question parts
 */
function parseQuestionParts(text) {
    const parts = [];
    let currentText = '';
    
    // Split by question parts (a), (b), etc.
    const partRegex = /\(?([a-z])\)/g;
    let lastIndex = 0;
    let match;

    // Handle the main question text before any parts
    const firstPartIndex = text.search(/\([a-z]\)/);
    if (firstPartIndex > 0) {
        parts.push({
            type: 'introduction',
            content: text.substring(0, firstPartIndex).trim()
        });
    }

    // Extract lettered parts
    while ((match = partRegex.exec(text)) !== null) {
        const startIndex = match.index;
        const endIndex = text.indexOf('(', startIndex + 1);
        const endPos = endIndex === -1 ? text.length : endIndex;
        
        const partText = text.substring(startIndex, endPos).trim();
        const marksMatch = partText.match(/\((\d+)\s*marks?\)/i);
        
        parts.push({
            type: 'part',
            partLabel: match[1],
            content: partText.replace(/\(\d+\s*marks?\)/i, '').trim(),
            marks: marksMatch ? parseInt(marksMatch[1]) : null
        });
        
        lastIndex = endPos;
    }

    // Check for any remaining text (might be additional information or context)
    if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex).trim();
        if (remainingText.length > 0) {
            parts.push({
                type: 'additional',
                content: remainingText
            });
        }
    }

    return parts;
}

/**
 * Enhanced question extraction with support for images, tables, and code blocks
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<Array>} Array of structured questions
 */
async function extractEnhancedQuestions(pdfPath) {
    try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const data = await pdfExtract.extractBuffer(pdfBuffer, extractOptions);
        const questions = [];
        
        let currentQuestion = null;
        let currentPage = 1;

        for (const page of data.pages) {
            // Extract images for the current page
            const images = await extractImages(pdfBuffer, currentPage);
            // Extract tables for the current page
            const tables = await extractTables(pdfPath, currentPage);

            // Process text content
            const lines = page.content
                .sort((a, b) => a.y - b.y)
                .map(item => item.str)
                .filter(line => line.trim().length > 0);

            for (const line of lines) {
                const questionMatch = line.match(/^(\d+)\.(.*)/);
                if (questionMatch) {
                    // Save previous question if exists
                    if (currentQuestion) {
                        questions.push(currentQuestion);
                    }

                    // Start new question
                    const questionText = questionMatch[2].trim();
                    const questionParts = parseQuestionParts(questionText);
                    
                    currentQuestion = {
                        questionId: questionMatch[1],
                        unit: pdfToUnitMap[path.basename(pdfPath)],
                        content: {
                            parts: questionParts,
                            images: [],
                            tables: [],
                            codeBlocks: []
                        },
                        markScheme: {
                            points: [],
                            totalMarks: 0
                        }
                    };

                    // Calculate total marks from parts
                    currentQuestion.markScheme.totalMarks = questionParts.reduce((total, part) => {
                        return total + (part.marks || 0);
                    }, 0);

                    // Associate nearby images with the question
                    const nearbyImages = images.filter(img => 
                        Math.abs(img.position.y - page.height) <= 200
                    );
                    if (nearbyImages.length > 0) {
                        currentQuestion.content.images.push(...nearbyImages);
                    }

                    // Associate tables with the question
                    if (tables.length > 0) {
                        currentQuestion.content.tables.push(...tables);
                    }
                } else if (currentQuestion) {
                    // Check for mark scheme
                    if (line.toLowerCase().includes('mark scheme')) {
                        currentQuestion.inMarkScheme = true;
                    } else if (currentQuestion.inMarkScheme) {
                        // Process mark scheme points
                        const markPoint = line.match(/^[•\-\*]\s*(.+)/);
                        if (markPoint) {
                            currentQuestion.markScheme.points.push(markPoint[1].trim());
                        }
                    } else {
                        // Check for code blocks
                        const codeBlocks = extractCodeBlocks(line);
                        if (codeBlocks.length > 0) {
                            currentQuestion.content.codeBlocks.push(...codeBlocks);
                        }
                    }
                }
            }
            currentPage++;
        }

        // Add the last question
        if (currentQuestion) {
            questions.push(currentQuestion);
        }

        return questions;
    } catch (error) {
        console.error(`Error processing PDF ${pdfPath}:`, error);
        return [];
    }
}

/**
 * Process all PDFs in the specified directory
 * @param {string} pdfDirectory - Directory containing PDF files
 * @returns {Promise<Object>} Structured question bank
 */
async function processAllPDFs(pdfDirectory = './PDF_files') {
    const questionBank = {};
    
    try {
        const files = fs.readdirSync(pdfDirectory);
        for (const file of files) {
            if (file.endsWith('.pdf') && pdfToUnitMap[file]) {
                const pdfPath = path.join(pdfDirectory, file);
                const questions = await extractEnhancedQuestions(pdfPath);
                const unit = pdfToUnitMap[file];
                questionBank[unit] = questions;
            }
        }
    } catch (error) {
        console.error('Error processing PDFs:', error);
    }

    return questionBank;
}

module.exports = {
    processAllPDFs,
    extractEnhancedQuestions
};
