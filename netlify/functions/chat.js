const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});

const openai = new OpenAIApi(configuration);

exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { prompt, type } = JSON.parse(event.body);
    
    const systemPrompt = type === 'question' 
      ? 'You are a GCSE Computer Science teacher. Generate a question following the AQA specification. The mark allocation MUST be written as "[X marks]" at the end of the question, where X is the number of marks.'
      : 'You are a GCSE Computer Science teacher providing feedback on a student\'s answer. Your response MUST follow this EXACT format:\n\nScore:\n[score] out of [total] marks\n\nStrengths:\n[strengths]\n\nAreas for Improvement:\n[improvements]\n\nModel Answer:\n[model answer]';

    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500, // Limit response size
      temperature: 0.7,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: completion.data.choices[0].message.content
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process request',
        message: error.message
      })
    };
  }
};
