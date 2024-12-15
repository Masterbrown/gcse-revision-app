require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const { processAllPDFs } = require('./enhanced_pdf_parser');
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
        try {
            questionBank = await processAllPDFs('./PDF_files');
            console.log('Question bank initialized successfully');
        } catch (error) {
            console.error('Error initializing question bank:', error);
            questionBank = {};
        }
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
                content: 'You are a GCSE Computer Science examiner. Always format your response in a clear structure with sections for Question, Mark Scheme, Student Score, and Feedback. Keep to the style of the example questions provided. But make sure that the questions are readable and the students have all the information they need from the question in order to answer it.'
            },
            {
                role: 'user',
                content: `You are a GCSE Computer Science examiner creating and marking questions. Here are some example questions and mark schemes from the official GCSE papers:

${sampleQuestions.map((q, i) => `Example ${i + 1}:
Question: ${q.question}
Mark Scheme: ${q.markScheme}
`).join('\n')}

IMPORTANT INSTRUCTIONS:
1. Generate a new question that is VERY similar in style, difficulty, and format to these example questions.
2. Remember these questions are GCSE level, keep the questions at this level.
3. Students will not have access to any calculator or calculator software.
4. Questions must be readable not include diagrams are where the students needs to look at something visually.
5. Do NOT create general knowledge or discussion questions.
6. The question should be in the same style as the example questions but feel free to make your own simillar questions as long as they are relevant
7. When generating a question with multiple parts (e.g 1a, 1b, 1c), be sure to start at 1a then 1b and so on.
8. make sure only one question is asked at a time.
9. Use similar command words (e.g., "State", "Explain", "Calculate" etc.) as used in the examples.
10. The mark scheme must follow the same style as the examples.
11. When markking, be lenient with spelling and grammar errors.
12. When markiing, be forgiving if student forget the unit of measurmeent in the question or mark scheme.
13. When marking, student are allowed to round to: 1000 bytes = 1KB, 1000 kilobytes = 1MB, 1000 megabytes = 1GB
14. When allocating marks make sure to take into account the mark scheme but also consider if they got any partially correct.

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
