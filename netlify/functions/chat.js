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
        model: 'gpt-4o',
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

    // If this is a question generation request (not marking/feedback), enforce strict rules
    // Treat as question generation if answer/markScheme are missing or empty
    const isQuestionGen = prompt && (!('answer' in prompt) || !prompt.answer) && (!('markScheme' in prompt) || !prompt.markScheme);
    console.log('Incoming payload:', JSON.stringify({prompt, unit}));
    console.log('Branch selected:', isQuestionGen ? 'QUESTION_GENERATION' : 'MARKING_FEEDBACK');
    if (isQuestionGen) {
      // Strict rules system prompt
      const messages = [
        {
          role: 'system',
          content: `You are a GCSE Computer Science examiner who loves to stick to the rules and never breaks rules.\nYour job is to generate a new question INSPIRED by the example given to you.\nDO NOT copy it. \nSTRICT RULES:\n1 - Do NOT use numbering or lettering for subparts (no 1., 2., a), b), etc.).\n2 - Only generate one self-contained question per response.\n3 - Do NOT include multiple choice or 'shade in the lozenge' instructions.\n4 - Do NOT generate questions that require viewing images/diagrams/code unless they are included in the prompt.\nIf you cannot follow ALL rules, respond ONLY with: Sorry, try again.\nHere is an example question for inspiration:${prompt.question}`
        },
        {
          role: 'user',
          content: prompt.userPrompt || 'Please generate a new question.'
        }
      ];

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
      for (let i = 0; i < 3; i++) {
        output = await makeOpenAIRequest(messages);
        console.log(`Attempt ${i+1}: Model used: gpt-4o | Output:`, output);
        if (!violatesRules(output)) {
          pass = true;
          break;
        }
      }
      if (pass) {
        console.log('Returning compliant question.');
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
          },
          body: JSON.stringify({ content: output })
        };
      } else {
        console.log('Returning fallback: Sorry, try again. [NETLIFY-STRICT-FAIL]');
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
          },
          body: JSON.stringify({ content: 'Sorry, try again. [NETLIFY-STRICT-FAIL]' })
        };
      }
    }

    // Default: Marking/feedback logic (original)
    console.log('Using MARKING/FEEDBACK branch. Model: gpt-4o');
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

Please evaluate the student's answer according to the mark scheme and provide feedback directly to the student. Don't be too harsh, be lenient and fair. be forgiving of spelling mistakes and when the student oes not include the correct unit numbers in their answers`
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
