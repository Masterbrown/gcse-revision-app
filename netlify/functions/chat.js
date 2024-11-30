const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});

const openai = new OpenAIApi(configuration);

// Load questions from JSON file
let questionBank = null;
try {
  questionBank = require('../../public/extracted_questions.json');
} catch (error) {
  console.error('Error loading question bank:', error);
  questionBank = {};
}

// Utility function for delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Function to make OpenAI API call with retries
async function makeOpenAIRequest(messages, retries = 3, backoff = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.3
      });

      return completion.data.choices[0].message.content;
    } catch (error) {
      if (error.response?.status === 429 || error.message?.includes('rate limit')) {
        if (i === retries - 1) throw error;
        const waitTime = (i + 1) * backoff;
        console.log(`Rate limited. Waiting ${waitTime}ms before retry ${i + 1}/${retries}`);
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }
}

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { prompt, unit } = JSON.parse(event.body);
    
    // Validate input
    if (!prompt || !unit) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Get questions for the unit
    const unitQuestions = questionBank[unit] || [];
    if (!unitQuestions.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `No questions found for unit ${unit}` })
      };
    }

    // Get random questions for context
    const sampleQuestions = [];
    for (let i = 0; i < Math.min(3, unitQuestions.length); i++) {
      const randomIndex = Math.floor(Math.random() * unitQuestions.length);
      sampleQuestions.push(unitQuestions[randomIndex]);
    }

    // Create messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: 'You are a GCSE Computer Science examiner. Always format your response in a clear structure with sections for Question, Mark Scheme, Student Score, and Feedback. Never deviate from the style of the example questions provided.'
      },
      {
        role: 'user',
        content: `You are a GCSE Computer Science examiner marking questions. Here are some example questions and mark schemes:

${sampleQuestions.map((q, i) => `Example ${i + 1}:
Question: ${q.question}
Mark Scheme: ${q.markScheme}
`).join('\n')}

Now evaluate this student's answer:
${prompt}`
      }
    ];

    // Make API request with retries
    const content = await makeOpenAIRequest(messages);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ content })
    };

  } catch (error) {
    console.error('Error:', error);
    
    // Handle rate limit errors
    if (error.response?.status === 429 || error.message?.includes('rate limit')) {
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'OpenAI rate limit reached. Please try again in a few minutes.' 
        })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message || 'An error occurred while processing your request' 
      })
    };
  }
};
