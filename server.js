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

        // For unit 3.1, sometimes return an exact copy, other times generate an inspired question
        let sampleQuestion;
        if (unit === '3.1' && unitQuestions.length > 0) {
            // 70% chance to return an exact copy, 30% to generate an inspired question
            if (Math.random() < 0.7) {
                // Return a random exact copy from the PDF
                sampleQuestion = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
            } else {
                // Generate an inspired question using the AI
                const inspiration = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
                const inspirationText = formatQuestionForAI(inspiration);
                messages.push({
                    role: 'user',
                    content: `Create a new GCSE Computer Science question inspired by the following question. Do NOT copy it, but make it similar in style and topic.\n\n${inspirationText}`
                });
                const data = await makeOpenAIRequest(messages);
                return res.json({ content: data.choices[0].message.content });
            }
        } else {
            // For other units, use a random question
            sampleQuestion = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
        }

        // Format the question for the AI
        function formatQuestionForAI(question) {
            let formatted = '';
            
            // Add context if it exists
            if (question.context && question.context.text) {
                formatted += `CONTEXT:\n${question.context.text}\n\n`;
            }
            
            // Add each part with its complete context
            question.parts.forEach(part => {
                formatted += `PART ${part.id.toUpperCase()}) [${part.marks} marks]\n`;
                formatted += part.text + '\n';
                
                // Add any supplementary information that applies to this part
                const relevantSupp = question.supplementary
                    .filter(s => s.applies_to.includes(part.id));
                if (relevantSupp.length > 0) {
                    formatted += '\nRelevant Information:\n';
                    relevantSupp.forEach(s => {
                        formatted += s.content + '\n';
                    });
                }
                
                formatted += '\n';
            });
            
            // Add mark scheme if available
            if (question.mark_scheme && question.mark_scheme.points.length > 0) {
                formatted += 'MARK SCHEME:\n';
                question.mark_scheme.points.forEach(point => {
                    formatted += `• ${point}\n`;
                });
            }
            
            return formatted;
        }
        
        // Create a context-aware prompt
        const messages = [
            {
                role: 'system',
                content: `You are a GCSE Computer Science examiner. Format all responses in this exact structure:

CONTEXT: (if applicable)
[Any setup or background information needed for the question]

For each part:
PART [X]) [Y marks]
[Complete question text with ALL necessary information]
[Include any relevant code, tables, or additional information needed for THIS part]

Expected Answer:
[Clear explanation of what is expected for full marks]

Mark Scheme:
• [Point 1]
• [Point 2]
etc.

RULES:
1. Each part must be completely self-contained
2. Include ALL information needed to answer that specific part
3. Keep formatting consistent
4. Show marks clearly
5. If information from the context is needed, include it in the part

Here's an example of a properly formatted question:
${formatQuestionForAI(sampleQuestion)}`
            },
            {
                role: 'user',
                content: prompt
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
