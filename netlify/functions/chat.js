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
    
    // Get a random question for evaluation
    const randomQuestion = unitQuestions[Math.floor(Math.random() * unitQuestions.length)];
    
    if (!randomQuestion) {
      throw new Error('No questions available for this unit');
    }

    // Extract mark allocation from the question
    const markMatch = randomQuestion.question.match(/\[(\d+)\s*marks?\]/i);
    const totalMarks = markMatch ? parseInt(markMatch[1]) : 0;

    // Create context-aware prompt
    const contextPrompt = `You are a GCSE Computer Science examiner marking a student's answer to this specific question:

${randomQuestion.question}

The official mark scheme states:
${randomQuestion.markScheme}

Total marks available: ${totalMarks}

INSTRUCTIONS:
1. Use ONLY the official mark scheme above to evaluate the student's answer
2. Award marks strictly according to the mark scheme points
3. Provide specific feedback based on the mark scheme
4. Your model answer must match the style and depth of the mark scheme

Evaluate this student answer:
${prompt}

RESPOND IN EXACTLY THIS FORMAT:

Score:
[X] out of ${totalMarks} marks
(Where X is the actual marks earned based on the mark scheme)

Strengths:
• List specific points from their answer that match the mark scheme
• Each bullet point should reference specific mark scheme criteria they met

Areas for Improvement:
• List specific mark scheme points they missed
• Explain what they should have included to get those marks

Model Answer:
[Provide an answer that would achieve full marks according to the mark scheme]`;

    try {
        const completion = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a GCSE Computer Science examiner. You must evaluate answers strictly according to the provided mark scheme. Your feedback must be specific and reference the mark scheme criteria. Never award more marks than available in the question.'
                },
                {
                    role: 'user',
                    content: contextPrompt
                }
            ],
            temperature: 0.2
        });

        const response = completion.data.choices[0].message.content;
        console.log('AI Response:', response);

        // Verify the response format
        const requiredSections = ['Score:', 'Strengths:', 'Areas for Improvement:', 'Model Answer:'];
        let modifiedResponse = response;

        // Ensure score doesn't exceed total marks
        const scoreMatch = response.match(/Score:\s*(\d+)\s*out of\s*(\d+)/i);
        if (scoreMatch) {
            const [, score, max] = scoreMatch;
            if (parseInt(score) > totalMarks) {
                modifiedResponse = modifiedResponse.replace(
                    /Score:.*$/m,
                    `Score:\n${totalMarks} out of ${totalMarks} marks`
                );
            }
        }

        // Add any missing sections
        requiredSections.forEach(section => {
            if (!modifiedResponse.includes(section)) {
                if (section === 'Score:' && !modifiedResponse.includes('Score:')) {
                    modifiedResponse = `Score:\n0 out of ${totalMarks} marks\n\n${modifiedResponse}`;
                } else if (section === 'Strengths:' && !modifiedResponse.includes('Strengths:')) {
                    modifiedResponse += '\n\nStrengths:\n• Attempted to answer the question';
                } else if (section === 'Areas for Improvement:' && !modifiedResponse.includes('Areas for Improvement:')) {
                    modifiedResponse += '\n\nAreas for Improvement:\n• Review the mark scheme points\n• Include more specific details from the mark scheme';
                } else if (section === 'Model Answer:' && !modifiedResponse.includes('Model Answer:')) {
                    modifiedResponse += `\n\nModel Answer:\n${randomQuestion.markScheme.replace(/^Mark scheme:?\s*/i, '')}`;
                }
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                content: modifiedResponse,
                debug: {
                    question: randomQuestion.question,
                    markScheme: randomQuestion.markScheme,
                    totalMarks: totalMarks
                }
            })
        };
    } catch (error) {
        console.error('OpenAI Error:', error);
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
