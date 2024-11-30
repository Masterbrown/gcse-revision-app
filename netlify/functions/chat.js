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
    const { prompt, unit, type } = JSON.parse(event.body);
    
    if (type === 'question') {
      // Get questions for the specified unit
      const unitQuestions = questionBank[unit] || [];
      
      if (!unitQuestions.length) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ 
            error: 'No questions found',
            message: 'No questions available for this unit. Please try another unit.'
          })
        };
      }

      // Select a random question from the unit
      const randomQuestion = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          content: randomQuestion.question,
          markScheme: randomQuestion.markScheme 
        })
      };
    }
    
    // Handle answer evaluation
    const unitQuestions = questionBank[unit] || [];
    const randomQuestion = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
    
    if (!randomQuestion) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'No questions found',
          message: 'No questions available for this unit. Please try another unit.'
        })
      };
    }

    // Extract mark allocation from the question
    const markMatch = randomQuestion.question.match(/\[(\d+)\s*marks?\]/i);
    const totalMarks = markMatch ? parseInt(markMatch[1]) : 0;

    try {
      const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a GCSE Computer Science examiner. Evaluate answers strictly according to the mark scheme.'
          },
          {
            role: 'user',
            content: `Evaluate this student's answer according to the mark scheme:

Question: ${randomQuestion.question}

Mark Scheme: ${randomQuestion.markScheme}

Student's Answer: ${prompt}

Respond in EXACTLY this format:

Score:
[X] out of ${totalMarks} marks

Strengths:
• List specific points from their answer that match the mark scheme
• Each bullet point should reference mark scheme criteria they met

Areas for Improvement:
• List specific mark scheme points they missed
• Explain what they should have included to get those marks

Model Answer:
[Write an answer that would achieve full marks according to the mark scheme]`
          }
        ],
        temperature: 0.3
      });

      const response = completion.data.choices[0].message.content;
      
      // Verify the response has all required sections
      const sections = ['Score:', 'Strengths:', 'Areas for Improvement:', 'Model Answer:'];
      let modifiedResponse = response;

      sections.forEach(section => {
        if (!modifiedResponse.includes(section)) {
          if (section === 'Score:') {
            modifiedResponse = `Score:\n0 out of ${totalMarks} marks\n\n${modifiedResponse}`;
          } else if (section === 'Strengths:') {
            modifiedResponse += '\n\nStrengths:\n• Attempted to answer the question';
          } else if (section === 'Areas for Improvement:') {
            modifiedResponse += '\n\nAreas for Improvement:\n• Review the mark scheme points';
          } else if (section === 'Model Answer:') {
            modifiedResponse += `\n\nModel Answer:\n${randomQuestion.markScheme}`;
          }
        }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ content: modifiedResponse })
      };

    } catch (error) {
      if (error.message.includes('rate limit') || error.message.includes('resource_exhausted')) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({ 
            error: 'Rate limit exceeded',
            message: 'Please wait a minute before trying again'
          })
        };
      }
      throw error;
    }
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
