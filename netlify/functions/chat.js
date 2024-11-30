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
    if (!prompt || !prompt.question || !prompt.answer || !unit) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Create messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: `You are a GCSE Computer Science examiner. Format your response exactly as follows:

Score:
[X] out of [Total] marks

Strengths:
• Point 1
• Point 2
[etc]

Areas for Improvement:
• Point 1
• Point 2
[etc]

Model Answer:
[Complete answer that would achieve full marks]`
      },
      {
        role: 'user',
        content: `You are a GCSE Computer Science examiner marking the following question:

Current Question:
${prompt.question}

Mark Scheme:
${prompt.markScheme || 'Not provided'}

Student's Answer:
${prompt.answer}

Please evaluate the student's answer according to the mark scheme and provide feedback.`
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
