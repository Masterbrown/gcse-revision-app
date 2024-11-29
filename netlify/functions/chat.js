const { Configuration, OpenAIApi } = require('openai');
const fs = require('fs');
const path = require('path');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});

const openai = new OpenAIApi(configuration);

// Load the extracted questions
let questionBank = null;
try {
  const questionsPath = path.join(__dirname, '../../public/extracted_questions.json');
  questionBank = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  console.log('Question bank loaded successfully');
} catch (error) {
  console.error('Error loading question bank:', error);
  questionBank = {};
}

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
    const { prompt, unit } = JSON.parse(event.body);
    
    // Get questions for the unit
    const unitQuestions = questionBank[unit] || [];
    
    // Get 3 random questions for context
    const sampleQuestions = [];
    for (let i = 0; i < Math.min(3, unitQuestions.length); i++) {
      const randomIndex = Math.floor(Math.random() * unitQuestions.length);
      sampleQuestions.push(unitQuestions[randomIndex]);
    }

    // Create context-aware prompt
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

    const completion = await openai.createChatCompletion({
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
      temperature: 0.3, // Lower temperature for more consistent outputs
      max_tokens: 1000 // Increased for longer responses
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        content: completion.data.choices[0].message.content
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process request',
        details: error.message
      })
    };
  }
};
