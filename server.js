require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const { processAllPDFs } = require('./question_processor');
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
                    model: 'gpt-4o',
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

// Format the question for the AI
function formatQuestionForAI(question) {
    let formatted = '';
    // Add context if it exists
    if (question.context && question.context.text) {
        formatted += `CONTEXT:\n${question.context.text}\n\n`;
    }
    // Add each part (if any)
    if (question.parts && Array.isArray(question.parts)) {
        question.parts.forEach(part => {
            formatted += `${part.text}\n`;
            // Add any supplementary information that applies to this part
            if (question.supplementary && Array.isArray(question.supplementary)) {
                const relevantSupp = question.supplementary.filter(s => s.applies_to && s.applies_to.includes(part.id));
                if (relevantSupp.length > 0) {
                    formatted += '\nRelevant Information:\n';
                    relevantSupp.forEach(s => {
                        formatted += s.content + '\n';
                    });
                }
            }
            formatted += '\n';
        });
    }
    // Add mark scheme if available
    if (question.mark_scheme && question.mark_scheme.points && question.mark_scheme.points.length > 0) {
        formatted += 'MARK SCHEME:\n';
        question.mark_scheme.points.forEach(point => {
            formatted += `• ${point}\n`;
        });
    }
    return formatted;
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

        // Always generate an AI-inspired question—never return an exact copy from the PDF
        if (unitQuestions.length > 0) {
            const inspiration = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
            const inspirationText = formatQuestionForAI(inspiration);
            // Build the system prompt (strict rules)
            const messages = [
                {
                    role: 'system',
                    content: `You are a GCSE Computer Science examiner who loves to stick to the rules and never breaks rules.
                    Your job is to generate a new question INSPIRED by the example given to you.
                    DO NOT copy it. 
                    STRICT RULES:
                    1 - Do NOT use numbering or lettering for subparts (no 1., 2., a), b), etc.).
                    2 - Only generate one self-contained question per response.
                    3 - Do NOT include multiple choice or 'shade in the lozenge' instructions.
                    4 - Do NOT generate questions that require viewing images/diagrams/code unless they are included in the prompt.
                    If you cannot follow ALL rules, respond ONLY with: Sorry, try again.
                    Here is an example question for inspiration:${inspirationText}`
                },
                {
                    role: 'user',
                    content: prompt || 'Please generate a new question.'
                }
            ];
            // Output validation logic
            function violatesRules(output) {
                const forbidden = [
                    /\b[1-9]\./, // 1.
                    /\ba\)/i, // a)
                    /\bb\)/i, // b)
                    /\bi\)/i, // i)
                    /\bii\)/i, // ii)
                    /shade in the lozenge/i,
                    /choose (one|the correct)/i,
                    /select (one|the correct)/i,
                    /which of the following/i,
                    /multiple choice/i,
                    /see the image/i,
                    /see the diagram/i,
                    /see the code/i,
                    /refer to the image/i,
                    /refer to the diagram/i,
                    /refer to the code/i,
                    /\b[A-D]\)/, // MCQ options
                    /\n.*\n.*\n.*\?/ // crude: more than one question mark in output
                ];
                return forbidden.some(rx => rx.test(output));
            }

            let output = null;
            let pass = false;
            let attempts = 0;
            for (let i = 0; i < 3; i++) {
                const data = await makeOpenAIRequest(messages);
                output = data.choices[0].message.content;
                if (!violatesRules(output)) {
                    pass = true;
                    break;
                }
            }
            if (pass) {
                return res.json({ content: output });
            } else {
                return res.json({ content: 'Sorry, try again.' });
            }
        } else {
            return res.status(400).json({ error: `No questions found for unit ${unit}. Please ensure PDF files are properly loaded.` });
        }
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
