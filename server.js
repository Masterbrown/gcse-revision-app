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
        
        // Format the sample question in a clear structure
        function formatQuestionForContext(question) {
            let formattedQuestion = '';
            
            // Add introduction if exists
            const intro = question.content.parts.find(p => p.type === 'introduction');
            if (intro) {
                formattedQuestion += `Context:\n${intro.content}\n\n`;
            }
            
            // Add each part
            const parts = question.content.parts.filter(p => p.type === 'part');
            parts.forEach(part => {
                formattedQuestion += `Part ${part.partLabel.toUpperCase()}) [${part.marks} marks]\n${part.content}\n\n`;
            });
            
            // Add additional information if exists
            const additional = question.content.parts.find(p => p.type === 'additional');
            if (additional) {
                formattedQuestion += `Additional Information:\n${additional.content}\n\n`;
            }
            
            // Add mark scheme
            if (question.markScheme.points.length > 0) {
                formattedQuestion += 'Mark Scheme:\n';
                question.markScheme.points.forEach(point => {
                    formattedQuestion += `• ${point}\n`;
                });
            }
            
            return formattedQuestion;
        }
        
        // Get one well-formatted sample question for context
        const sampleQuestion = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
        const formattedSample = formatQuestionForContext(sampleQuestion);
        
        // Create a context-aware prompt
        const messages = [
            {
                role: 'system',
                content: `You are a GCSE Computer Science examiner. You must strictly follow this format for questions:

1. If there's context or setup information, start with:
   CONTEXT:
   [The context information]

2. For each part of the question:
   PART [X]) [${part.marks} marks]
   [Clear, self-contained question text]

3. If there's additional information (like subroutines, code examples):
   ADDITIONAL INFORMATION:
   [The additional details]

4. For the mark scheme:
   MARK SCHEME:
   • [Point 1]
   • [Point 2]
   etc.

IMPORTANT RULES:
- Each part must be completely self-contained
- Include ALL necessary information to answer the question
- Keep the original question structure but make it clearer
- Maintain consistent formatting
- Number the marks clearly
- If a part references information, include that information in that part

Here's a properly formatted example question:
${formattedSample}`
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
