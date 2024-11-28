const fs = require('fs');
const pdf = require('pdf-parse');

async function analyzePDF() {
    const dataBuffer = fs.readFileSync('./PDF_files/Unit1.pdf');
    
    try {
        const data = await pdf(dataBuffer);
        
        console.log('Number of pages:', data.numpages);
        console.log('\nFirst 1000 characters of content:');
        console.log(data.text.substring(0, 1000));
        
        // Look for patterns
        const questions = data.text.match(/Question \d+/g);
        const markSchemes = data.text.match(/Mark scheme/g);
        
        if (questions) {
            console.log('\nFound question markers:', questions.length);
            console.log('First few questions:', questions.slice(0, 5));
        }
        
        if (markSchemes) {
            console.log('\nFound mark scheme markers:', markSchemes.length);
        }
        
    } catch (error) {
        console.error('Error parsing PDF:', error);
    }
}

analyzePDF();
