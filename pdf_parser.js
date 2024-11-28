const fs = require('fs');
const pdf = require('pdf-parse');

const pdfToUnitMap = {
    'Unit1.pdf': '3.1',
    'Unit2.pdf': '3.2',
    'Unit3.pdf': '3.3',
    'Unit4.pdf': '3.4',
    'Unit5.pdf': '3.5',
    'Unit6.pdf': '3.6',
    'Unit7.pdf': '3.7',
    'Unit8.pdf': '3.8'
};

function extractQuestionAndMarkScheme(text) {
    const questions = new Map(); // Use map to match questions with mark schemes
    
    // Split text into lines and sections
    const lines = text.split('\n').map(line => line.trim());
    
    let isInQuestions = true; // Start in questions section
    let currentNumber = null;
    let currentContent = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) continue;
        
        // Check for section transitions
        if (line.toLowerCase().includes('mark scheme') || 
            line.toLowerCase().includes('marking scheme')) {
            isInQuestions = false;
            continue;
        }
        
        // Look for numbered items (e.g., "1." or "1)")
        const numberMatch = line.match(/^(\d+)[\.)]/);
        
        if (numberMatch) {
            // Save previous content if any
            if (currentNumber !== null && currentContent.trim()) {
                if (isInQuestions) {
                    if (!questions.has(currentNumber)) {
                        questions.set(currentNumber, { question: '', markScheme: '' });
                    }
                    questions.get(currentNumber).question = currentContent.trim();
                } else {
                    if (!questions.has(currentNumber)) {
                        questions.set(currentNumber, { question: '', markScheme: '' });
                    }
                    questions.get(currentNumber).markScheme = currentContent.trim();
                }
            }
            
            currentNumber = numberMatch[1];
            currentContent = line.substring(line.indexOf(numberMatch[0]) + numberMatch[0].length).trim();
        } else if (currentNumber !== null) {
            // Continue building current content
            currentContent += ' ' + line;
        }
        
        // Check for marks
        const marksMatch = line.match(/\[(\d+)\s*marks?\]/i);
        if (marksMatch && currentNumber !== null) {
            if (!questions.has(currentNumber)) {
                questions.set(currentNumber, { question: '', markScheme: '' });
            }
            questions.get(currentNumber).marks = parseInt(marksMatch[1]);
        }
    }
    
    // Save the last item
    if (currentNumber !== null && currentContent.trim()) {
        if (isInQuestions) {
            if (!questions.has(currentNumber)) {
                questions.set(currentNumber, { question: '', markScheme: '' });
            }
            questions.get(currentNumber).question = currentContent.trim();
        } else {
            if (!questions.has(currentNumber)) {
                questions.set(currentNumber, { question: '', markScheme: '' });
            }
            questions.get(currentNumber).markScheme = currentContent.trim();
        }
    }
    
    // Convert map to array of complete questions (those with both question and mark scheme)
    return Array.from(questions.entries())
        .filter(([_, data]) => data.question && data.markScheme)
        .map(([number, data]) => ({
            number: parseInt(number),
            ...data
        }));
}

async function parseAllPDFs() {
    const examples = {};
    
    for (const [pdfFile, unitNumber] of Object.entries(pdfToUnitMap)) {
        try {
            console.log(`Processing ${pdfFile} for unit ${unitNumber}...`);
            const dataBuffer = fs.readFileSync(`./PDF_files/${pdfFile}`);
            const data = await pdf(dataBuffer);
            
            const questions = extractQuestionAndMarkScheme(data.text);
            
            // Take the first two complete questions
            const validQuestions = questions.slice(0, 2);
            
            if (validQuestions.length > 0) {
                examples[unitNumber] = validQuestions.map((q, index) => {
                    const marksText = q.marks ? ` [${q.marks} marks]` : '';
                    return `Example Question ${q.number}: "${q.question}"${marksText}

Mark Scheme for Q${q.number}:
${q.markScheme}`;
                }).join('\n\n');
                
                console.log(`Found ${validQuestions.length} complete questions with mark schemes`);
            }
            
            console.log(`Successfully processed ${pdfFile}`);
        } catch (error) {
            console.error(`Error processing ${pdfFile}:`, error);
        }
    }
    
    // Write the examples to a JSON file
    fs.writeFileSync('./public/question_examples.json', 
        JSON.stringify(examples, null, 2), 
        'utf8'
    );
    
    console.log('All PDFs processed. Examples saved to question_examples.json');
}

parseAllPDFs();
