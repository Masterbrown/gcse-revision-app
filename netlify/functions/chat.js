const { Configuration, OpenAIApi } = require('openai');
const path = require('path');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});

const openai = new OpenAIApi(configuration);

// Load questions directly using require
let questionBank = null;
try {
  console.log('Starting to load question bank...');
  // In Netlify functions, we need to use require to load JSON
  const rawQuestions = require('../../public/question_examples.json');
  console.log('Raw questions loaded. Units found:', Object.keys(rawQuestions));
  
  // Process the raw questions into a structured format
  questionBank = {};
  for (const [unit, content] of Object.entries(rawQuestions)) {
    console.log(`\nProcessing unit ${unit}...`);
    console.log('Content preview:', content.substring(0, 100));
    
    questionBank[unit] = [];
    
    // Split content into individual questions
    const questions = content.split('Example Question');
    console.log(`Found ${questions.length - 1} potential questions in unit ${unit}`);
    
    for (let i = 1; i < questions.length; i++) {
      const q = questions[i];
      if (!q.trim()) {
        console.log(`Question ${i} is empty, skipping`);
        continue;
      }
      
      try {
        console.log(`\nParsing question ${i} in unit ${unit}...`);
        
        // Extract question number and text
        const questionMatch = q.match(/\d+:\s*"([^"]+)"/);
        if (!questionMatch) {
          console.log('No question match found, raw content:', q.substring(0, 100));
          continue;
        }
        const questionText = questionMatch[1].trim();
        console.log('Found question text:', questionText.substring(0, 100));
        
        // Extract mark scheme
        const markSchemeMatch = q.match(/Mark Scheme for Q\d+:\s*([^"]+?)(?=\n\nExample Question|\n\n{|$)/);
        const markScheme = markSchemeMatch ? markSchemeMatch[1].trim() : '';
        console.log('Found mark scheme:', markScheme ? markScheme.substring(0, 100) : 'No mark scheme found');
        
        if (questionText && markScheme) {
          // Extract total marks from question text
          const marksMatch = questionText.match(/\(Total\s+(\d+)\s+marks?\)/i);
          const totalMarks = marksMatch ? parseInt(marksMatch[1]) : 1;
          console.log('Total marks:', totalMarks);
          
          questionBank[unit].push({
            question: questionText,
            markScheme: markScheme,
            totalMarks: totalMarks
          });
          console.log(`Successfully added question ${i} to unit ${unit}`);
        } else {
          console.log('Skipping question due to missing text or mark scheme');
        }
      } catch (err) {
        console.error(`Error parsing question ${i} in unit ${unit}:`, err);
        continue;
      }
    }
    
    console.log(`\nFinished processing unit ${unit}. Total questions added: ${questionBank[unit].length}`);
  }
  
  console.log('\nQuestion bank loading complete. Summary:');
  Object.entries(questionBank).forEach(([unit, questions]) => {
    console.log(`Unit ${unit}: ${questions.length} questions`);
  });
} catch (error) {
  console.error('Error loading question bank:', error);
  questionBank = {};
}

// Add debug logging to the handler
exports.handler = async function(event, context) {
  console.log('Request received:', {
    method: event.httpMethod,
    body: event.body
  });
  
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
      console.log('Generating question for unit:', unit);
      console.log('Question bank status:', {
        hasBank: !!questionBank,
        units: questionBank ? Object.keys(questionBank) : [],
        unitQuestionCount: questionBank && questionBank[unit] ? questionBank[unit].length : 0
      });
      
      const unitQuestions = questionBank[unit] || [];
      console.log(`Found ${unitQuestions.length} questions for unit ${unit}`);
      
      if (!unitQuestions.length) {
        console.log('No questions found for unit:', unit);
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
      console.log('Selected question:', randomQuestion);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          content: randomQuestion.question,
          markScheme: randomQuestion.markScheme 
        })
      };
    }
    
    if (type === 'answer') {
      console.log('Evaluating answer for question:', {
        question: event.body.question,
        markScheme: event.body.markScheme
      });

      try {
        const { prompt, question, markScheme } = JSON.parse(event.body);
        
        // Extract total marks from the question
        const marksMatch = question.match(/\[(\d+)\s*marks?\]/i);
        const totalMarks = marksMatch ? parseInt(marksMatch[1]) : 1;
        
        // Count mark scheme points to validate
        const markSchemePoints = markScheme.split('\n')
          .filter(line => line.trim().startsWith('•')).length;
        
        if (markSchemePoints !== totalMarks) {
          console.warn(`Warning: Mark scheme has ${markSchemePoints} points but question is worth ${totalMarks} marks`);
        }

        const completion = await openai.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a GCSE Computer Science examiner. Evaluate answers according to the mark scheme and AQA guidelines.
                       Be strict but fair in your marking. Award marks only when the student's answer clearly demonstrates the required knowledge or understanding.
                       
                       IMPORTANT:
                       1. The question is worth ${totalMarks} marks
                       2. Each bullet point in the mark scheme is worth 1 mark
                       3. Only award marks for points that match the mark scheme exactly
                       4. If a student's answer includes correct points not in the mark scheme, do not award marks for these
                       5. Format your response exactly as requested, with Score, Strengths, Areas for Improvement, and Model Answer sections`
            },
            {
              role: 'user',
              content: `Question [${totalMarks} marks]:
${question}

Mark Scheme:
${markScheme}

Student's Answer:
${prompt}

Please evaluate the answer and respond in this exact format:

Score:
[X] out of ${totalMarks} marks

Strengths:
• List specific points the student got correct, referencing the mark scheme
• Award 1 mark for each point that matches the mark scheme exactly

Areas for Improvement:
• List specific points from the mark scheme that were missed
• Explain what was needed for each missing mark

Model Answer:
A complete answer that would achieve full marks according to the mark scheme.`
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
              modifiedResponse += `\n\nModel Answer:\n${markScheme}`;
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
