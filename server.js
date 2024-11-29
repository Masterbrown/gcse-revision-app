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
app.use(express.static(path.join(__dirname, 'public')));

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
        
        // Get 3 random questions for better context
        const sampleQuestions = [];
        for (let i = 0; i < Math.min(3, unitQuestions.length); i++) {
            const randomIndex = Math.floor(Math.random() * unitQuestions.length);
            sampleQuestions.push(unitQuestions[randomIndex]);
        }
        
        // Create a context-aware prompt with multiple example questions
        const contextPrompt = `You are a GCSE Computer Science examiner creating and marking questions. Here are some example questions and mark schemes from the official GCSE papers:

${sampleQuestions.map((q, i) => `Example ${i + 1}:
Question: ${q.question}
Mark Scheme: ${q.markScheme}
`).join('\n')}

IMPORTANT INSTRUCTIONS:
1. Generate a new question that is VERY similar in style, difficulty, and format to these example questions.
2. Do NOT create general knowledge or discussion questions.
3. The question MUST match the exact format of the examples (including mark allocation).
4. Use similar command words (e.g., "State", "Explain", "Calculate" etc.) as used in the examples.
5. The mark scheme must follow the same style as the examples.

Now, generate a question and evaluate the student's answer:

Student's answer: ${prompt}`;
        
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
                        role: 'system',
                        content: 'You are a GCSE Computer Science examiner. Always format your response in a clear structure with sections for Question, Mark Scheme, Student Score, and Feedback. Never deviate from the style of the example questions provided.'
                    },
                    {
                        role: 'user',
                        content: contextPrompt
                    }
                ],
                temperature: 0.3  // Lower temperature for more consistent outputs
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
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize question bank when server starts
initializeQuestionBank().catch(console.error);

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
