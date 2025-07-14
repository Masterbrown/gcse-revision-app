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
        temperature: 0.7
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
    if (!prompt || !prompt.question || !unit) {
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
      const topicDesc = prompt.topicDescription ? `\n\nTOPIC DESCRIPTION:\n${prompt.topicDescription}` : '';
      const exampleQs = (prompt.exampleQuestions && Array.isArray(prompt.exampleQuestions) && prompt.exampleQuestions.length)
        ? `\n\nEXAMPLE QUESTIONS FROM THIS TOPIC (use these for inspiration, do NOT copy):\n${prompt.exampleQuestions.map((q,i)=>`${i+1}. ${q.question || q}`).join('\n')}`
        : '';
      const messages = [
        {
          role: 'system',
          content: `You are a GCSE Computer Science examiner who must ALWAYS follow the strict rules below. Your job is to generate a new, original question INSPIRED by the topic and the provided example questions (do NOT copy them). The question must be highly relevant to the topic and different from previous examples. If you break ANY rule, you must try again and only return a valid question. If you cannot, reply ONLY with: Sorry, try again.

STRICT RULES (read carefully):
1. Do NOT use numbering or lettering for subparts (no 1., 2., a), b), i), ii), etc.).
2. Only generate ONE self-contained question per response.
3. Do NOT include multiple choice or 'shade in the lozenge' instructions.
4. Do NOT generate questions that require viewing images, diagrams, or code unless they are included in the prompt.
5. The question must be clear, unambiguous, and suitable for a GCSE Computer Science student.
6. Do NOT copy the example question or any of the example questions below.
7. Each question must be unique and not a repeat of previous examples.
8. Do NOT generate questions that ask users to use the contents of a text file, image, or diagram.
9. Every question must end with a mark value in the format: [X marks] (e.g., [2 marks]).
${topicDesc}${exampleQs}

NEGATIVE EXAMPLES (DO NOT DO THIS):
- "(a) What is an algorithm? (1)\n(b) Give an example of... (2)" ❌ (No subparts)
- "Which of the following is correct? A) B) C) D)" ❌ (No multiple choice)
- "Shade one lozenge that shows..." ❌ (No lozenge instructions)
- "Refer to the diagram above." ❌ (No external references)
- "Use the contents of the text file below." ❌ (No external references)
- "Explain the difference between RAM and ROM." ❌ (Missing mark value)

POSITIVE EXAMPLES (GOOD):
- "Explain why binary is used in computers. [2 marks]"
- "Describe the purpose of a flowchart in algorithm design. [3 marks]"
- "Write a Python statement to output the result of 2 + 2. [1 marks]"

QUESTION TEMPLATE (follow this structure):
[Your question here] [X marks]
[Start with a clear, single question relevant to GCSE Computer Science.]

FEW-SHOT EXAMPLES:
---
Compliant:
1. "Explain the difference between RAM and ROM in a computer system."
2. "Describe one advantage of using a high-level programming language."
3. "Give one reason why data is stored in binary format."
---
Non-compliant:
1. "(a) What is an algorithm? (1)\n(b) Give an example of an algorithm. (1)" // ❌ Has subparts
2. "Which of the following is a logic gate? A) AND B) OR C) NOT D) XOR" // ❌ Multiple choice
3. "Shade one lozenge that shows the correct answer." // ❌ Lozenge instruction

If you break ANY rule, try again. If you cannot follow ALL rules, respond ONLY with: Sorry, try again.`
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
        // Must end with [X marks]
        const marksPattern = /\[\d+ marks\]$/;
        if (!marksPattern.test(output)) return true;
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
