require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const { analyzeAllPDFs } = require('./analyze_pdf');

const app = express();
const port = process.env.PORT || 3000;

// Cache for PDF questions
let questionBank = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// OpenAI API endpoint
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Initialize question bank
async function initializeQuestionBank() {
    if (!questionBank) {
        questionBank = await analyzeAllPDFs();
        console.log('Question bank initialized');
    }
    return questionBank;
}

// Route to handle OpenAI API requests
app.post('/api/chat', async (req, res) => {
    try {
        const { prompt, unit } = req.body;
        
        // Ensure question bank is initialized
        await initializeQuestionBank();
        
        // Get relevant questions for the unit
        const unitQuestions = questionBank[unit] || [];
        const randomQuestion = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
        
        // Create a context-aware prompt
        const contextPrompt = `You are a GCSE Computer Science tutor. Using this example question and mark scheme as reference:
        
        Example Question: ${randomQuestion?.question || 'No specific question available'}
        Example Mark Scheme: ${randomQuestion?.markScheme || 'No specific mark scheme available'}
        
        Generate a similar but different question about ${unit} that tests the same concepts. Then evaluate the student's answer.
        
        Student's prompt: ${prompt}`;
        
        const response = await fetch(OPENAI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: contextPrompt
                    }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Failed to fetch from OpenAI API');
        }

        const data = await response.json();
        res.json({ content: data.choices[0].message.content });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize question bank when server starts
initializeQuestionBank().catch(console.error);

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
