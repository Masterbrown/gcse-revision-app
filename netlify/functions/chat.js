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
    const contextPrompt = `You are a GCSE Computer Science examiner marking a student's answer. 

${sampleQuestions.map((q, i) => `Example ${i + 1}:
Question: ${q.question}
Mark Scheme: ${q.markScheme}
`).join('\n')}

Based on these example questions and mark schemes, evaluate the student's answer.

YOU MUST RESPOND IN EXACTLY THIS FORMAT, including all section headers and bullet points:

Score:
[X] out of [Y] marks

Strengths:
• [First strength point]
• [Second strength point]
• [Add more points if applicable]

Areas for Improvement:
• [First improvement point]
• [Second improvement point]
• [Add more points if applicable]

Model Answer:
[Provide a detailed model answer that would achieve full marks]

Student's answer: ${prompt}`;

    try {
        const completion = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a GCSE Computer Science examiner. You MUST include ALL sections in your response: Score, Strengths, Areas for Improvement, and Model Answer. Each section must start with its exact heading and be followed by relevant content. For Strengths and Areas for Improvement, use bullet points starting with •'
                },
                {
                    role: 'user',
                    content: contextPrompt
                }
            ],
            temperature: 0.2,  // Reduced for more consistent formatting
            max_tokens: 1000
        });

        const response = completion.data.choices[0].message.content;
        
        // Log the response for debugging
        console.log('AI Response:', response);

        // Verify all sections are present
        const sections = ['Score:', 'Strengths:', 'Areas for Improvement:', 'Model Answer:'];
        const missingSections = sections.filter(section => !response.includes(section));
        
        if (missingSections.length > 0) {
            console.log('Missing sections:', missingSections);
            // If sections are missing, add them with default content
            let modifiedResponse = response;
            missingSections.forEach(section => {
                if (!modifiedResponse.includes(section)) {
                    if (section === 'Score:' && !modifiedResponse.includes('Score:')) {
                        modifiedResponse = 'Score:\n0 out of 0 marks\n\n' + modifiedResponse;
                    } else if (section === 'Strengths:' && !modifiedResponse.includes('Strengths:')) {
                        modifiedResponse += '\n\nStrengths:\n• Attempted to answer the question';
                    } else if (section === 'Areas for Improvement:' && !modifiedResponse.includes('Areas for Improvement:')) {
                        modifiedResponse += '\n\nAreas for Improvement:\n• Review the topic material\n• Practice similar questions';
                    } else if (section === 'Model Answer:' && !modifiedResponse.includes('Model Answer:')) {
                        modifiedResponse += '\n\nModel Answer:\nA model answer should be provided';
                    }
                }
            });
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ content: modifiedResponse })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ content: response })
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
