require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const { analyzeAllPDFs } = require('./analyze_pdf');
const rateLimit = require('express-rate-limit');
const { RateLimiterMemory } = require('rate-limiter-flexible');

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

// Rate limiting setup
const openaiRateLimiter = new RateLimiterMemory({
    points: 20,      // Number of requests
    duration: 60,    // Per minute
});

// Rate limit middleware for /api/chat endpoint
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // limit each IP to 20 requests per minute
    message: 'Too many requests, please try again later.'
});

app.use('/api/chat', apiLimiter);

// Initialize question bank
async function initializeQuestionBank() {
    if (!questionBank) {
        questionBank = await analyzeAllPDFs();
        console.log('Question bank initialized');
    }
    return questionBank;
}

// Utility function for delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Function to make OpenAI API call with retries
async function makeOpenAIRequest(messages, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(OPENAI_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    temperature: 0.3
                })
            });

            if (response.status === 429) {
                const waitTime = (i + 1) * backoff;
                console.log(`Rate limited. Waiting ${waitTime}ms before retry ${i + 1}/${retries}`);
                await delay(waitTime);
                continue;
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'OpenAI API error');
            }

            return await response.json();
        } catch (error) {
            if (i === retries - 1) throw error;
            const waitTime = (i + 1) * backoff;
            console.log(`Error: ${error.message}. Retrying in ${waitTime}ms...`);
            await delay(waitTime);
        }
    }
}

// Route to handle OpenAI API requests
app.post('/api/chat', async (req, res) => {
    try {
        // Check OpenAI rate limit
        await openaiRateLimiter.consume(req.ip);
        
        const { prompt, unit } = req.body;
        
        // Ensure question bank is initialized
        await initializeQuestionBank();
        
        // Get relevant questions for the unit
        const unitQuestions = questionBank[unit] || [];
        if (!unitQuestions.length) {
            return res.status(400).json({ 
                error: `No questions found for unit ${unit}. Please ensure PDF files are properly loaded.` 
            });
        }
        
        // Get 3 random questions for better context
        const sampleQuestions = [];
        for (let i = 0; i < Math.min(3, unitQuestions.length); i++) {
            const randomIndex = Math.floor(Math.random() * unitQuestions.length);
            sampleQuestions.push(unitQuestions[randomIndex]);
        }
        
        // Create a context-aware prompt
        const messages = [
            {
                role: 'system',
                content: `You are a GCSE Computer Science examiner. When formatting questions with multiple parts:

1. ALWAYS put each sub-part (a, b, c) on a new line with a blank line before it
2. Format sub-parts exactly like this:

1a) First part of question

1b) Second part of question

1c) Third part of question

3. Use double newlines between parts to ensure proper spacing
4. For code blocks, use triple backticks with newlines before and after
5. Keep the feedback sections in markdown format with proper headings`
            },
            {
                role: 'user',
                content: `You are a GCSE Computer Science examiner creating and marking questions. Here are some example questions and mark schemes from the official GCSE papers:

${sampleQuestions.map((q, i) => `Example ${i + 1}:
Question: ${q.question}
Mark Scheme: ${q.markScheme}
`).join('\n')}

IMPORTANT FORMATTING INSTRUCTIONS:
1. Format ALL multi-part questions EXACTLY like this example:

1a) First question part goes here

1b) Second question part goes here

1c) Third question part goes here

2. For code examples:
\`\`\`
code here
\`\`\`

3. For feedback sections:
# Score:
[score details]

## Strengths:
• [strength point]
• [strength point]

## Areas for Improvement:
• [improvement point]
• [improvement point]

## Model Answer:
[detailed model answer]

ADDITIONAL INSTRUCTIONS:
1. Generate questions similar in style and difficulty to the examples
2. Keep questions at GCSE level
3. No calculators allowed
4. No visual diagrams required
5. No general knowledge questions
6. Use command words like "State", "Explain", "Calculate"
7. Be lenient with spelling and grammar
8. Accept answers without units of measurement
9. Allow rounding: 1000 bytes = 1KB, 1000 KB = 1MB, 1000 MB = 1GB
10. Consider partial marks for partially correct answers

Now, generate a question and evaluate the student's answer:

Student's answer: ${prompt}`
            }
        ];

        const data = await makeOpenAIRequest(messages);
        res.json({ content: data.choices[0].message.content });
        
    } catch (error) {
        console.error('Error:', error);
        if (error.name === 'RateLimiterError') {
            return res.status(429).json({ 
                error: 'Too many requests. Please wait a minute before trying again.' 
            });
        }
        if (error.message.includes('rate limit')) {
            return res.status(429).json({ 
                error: 'OpenAI rate limit reached. Please try again in a few minutes.' 
            });
        }
        res.status(500).json({ 
            error: error.message || 'An error occurred while processing your request' 
        });
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
