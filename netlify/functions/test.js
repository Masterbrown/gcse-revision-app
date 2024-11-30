exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    // Load and parse questions
    const questions = require('../../public/question_examples.json');
    const units = Object.keys(questions);
    const summary = {};
    
    for (const unit of units) {
      const content = questions[unit];
      const questionCount = (content.match(/Example Question/g) || []).length;
      summary[unit] = questionCount;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        units,
        summary,
        sample: questions['3.1'].substring(0, 200) // First 200 chars of unit 3.1
      })
    };
  } catch (error) {
    console.error('Test function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to load questions',
        details: error.message,
        stack: error.stack
      })
    };
  }
};
