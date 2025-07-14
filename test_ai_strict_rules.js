require('dotenv').config();
const fetch = require('node-fetch');

// Change this to 'gpt-3.5-turbo', 'gpt-4', or 'gpt-4o' as needed
const defaultModel = 'gpt-4o';

const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function violatesRules(output) {
    // Forbidden patterns: numbering, subparts, MCQ, lozenge, image/code/diagram references, multiple questions
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

async function testAIStrictRules({ inspirationText, prompt, model = defaultModel, retries = 3 }) {
    const messages = [
        {
            role: 'system',
            content: `You are a GCSE Computer Science examiner who loves to stick to the rules and never breaks rules.\nYour job is to generate a new question INSPIRED by the example given to you.\nDO NOT copy it. \nSTRICT RULES:\n1 - Do NOT use numbering or lettering for subparts (no 1., 2., a), b), etc.).\n2 - Only generate one self-contained question per response.\n3 - Do NOT include multiple choice or 'shade in the lozenge' instructions.\n4 - Do NOT generate questions that require viewing images/diagrams/code unless they are included in the prompt.\nIf you cannot follow ALL rules, respond ONLY with: Sorry, try again.\nHere is an example question for inspiration:${inspirationText}`
        },
        {
            role: 'user',
            content: prompt || 'Please generate a new question.'
        }
    ];
    let lastOutput = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        const response = await fetch(OPENAI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.3
            })
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${error}`);
        }
        const data = await response.json();
        const output = data.choices[0].message.content;
        lastOutput = output;
        if (!violatesRules(output)) {
            return {output, pass: true, attempts: attempt};
        }
    }
    return {output: lastOutput, pass: false, attempts: retries};
}

// Test cases
const testCases = [
    {
        name: 'Numbered and subpart inspiration',
        inspirationText: `1. Explain what an algorithm is. [2 marks]\na) Give an example of an algorithm in everyday life.\nb) Why is it important to use algorithms in computer science?`,
        prompt: 'Please generate a new question.'
    },
    {
        name: 'Multiple choice inspiration',
        inspirationText: `Which of the following is a valid variable name in Python?\nA) 2ndVar\nB) first_var\nC) var-name\nD) $var`,
        prompt: 'Please generate a new question.'
    },
    {
        name: 'Lozenge/MCQ instruction',
        inspirationText: `Shade in the lozenge next to the correct answer.\nWhich device stores data permanently?\nA) RAM\nB) ROM\nC) Cache\nD) Register`,
        prompt: 'Please generate a new question.'
    },
    {
        name: 'Image reference',
        inspirationText: `Refer to the diagram above. What does the diagram represent?`,
        prompt: 'Please generate a new question.'
    },
    {
        name: 'Multiple questions',
        inspirationText: `Explain what abstraction is.\nExplain what decomposition is.`,
        prompt: 'Please generate a new question.'
    }
];

(async () => {
    try {
        console.log('Testing with model:', defaultModel);
        for (const test of testCases) {
            console.log(`\n---\nTest: ${test.name}`);
            const result = await testAIStrictRules({
                inspirationText: test.inspirationText,
                prompt: test.prompt
            });
            console.log('AI Output:\n', result.output);
            if (result.pass) {
                console.log('PASS: Output complies with rules. Attempts:', result.attempts);
            } else {
                console.log('FAIL: Output violates rules even after retries. Attempts:', result.attempts);
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
})();
