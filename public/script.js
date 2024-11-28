// Constants
const API_ENDPOINT = '/.netlify/functions/chat';  // Restore original endpoint
let isInitialized = false;
let currentQuestion = '';
let currentMarkScheme = '';
let currentUnit = '';
let questionExamples = {};

// Load question examples when the page loads
fetch('/question_examples.json')
    .then(response => response.json())
    .then(data => {
        questionExamples = data;
        console.log('Loaded question examples for units:', Object.keys(questionExamples));
    })
    .catch(error => {
        console.error('Error loading question examples:', error);
        // Use default examples if loading fails
        questionExamples = {
            '3.1': `Example Question: What is an algorithm? [2 marks]
Mark Scheme: 
• A step-by-step procedure to solve a problem (1)
• Must be unambiguous/precise/detailed (1)`,
            '3.2': `Example Question: Write a Python function that adds two numbers. [3 marks]
\`\`\`python
def add_numbers(a, b):
    return a + b
\`\`\`
Mark Scheme:
• Correct function definition with parameters (1)
• Return statement used (1)
• Correct addition of parameters (1)`,
            '3.3': `Example Question: Convert the denary number 53 to binary. [2 marks]
Mark Scheme:
• Correct working shown (1)
• Answer: 110101 (1)`
        };
    });

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const questionContainer = document.getElementById('question-container');
const loadingElement = document.getElementById('loading');
const currentQuestionElement = document.getElementById('current-question');
const questionText = document.getElementById('question-text');
const answerInput = document.getElementById('answer-input');
const submitButton = document.getElementById('submit-answer');
const feedbackSection = document.getElementById('feedback-section');
const nextQuestionButton = document.getElementById('next-question');
const backToUnitsButton = document.getElementById('back-to-units');

function showLoading() {
    if (loadingElement) loadingElement.classList.remove('hidden');
    if (currentQuestionElement) currentQuestionElement.classList.add('hidden');
}

function hideLoading() {
    if (loadingElement) loadingElement.classList.add('hidden');
    if (currentQuestionElement) currentQuestionElement.classList.remove('hidden');
}

function showQuestion() {
    if (currentQuestionElement) currentQuestionElement.classList.remove('hidden');
    if (feedbackSection) feedbackSection.style.display = 'none';
}

function showFeedback() {
    if (currentQuestionElement) currentQuestionElement.classList.add('hidden');
    if (feedbackSection) feedbackSection.style.display = 'block';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Add unit button listeners
    const unitButtons = document.querySelectorAll('.unit-button');
    unitButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentUnit = button.id;
            console.log('Selected unit:', currentUnit);
            if (welcomeScreen) welcomeScreen.classList.add('hidden');
            if (questionContainer) {
                questionContainer.classList.remove('hidden');
                generateQuestion();
            }
        });
    });

    // Add back to units button listener
    if (backToUnitsButton) {
        backToUnitsButton.addEventListener('click', () => {
            console.log('Back to units clicked');
            if (welcomeScreen) welcomeScreen.classList.remove('hidden');
            if (questionContainer) questionContainer.classList.add('hidden');
            if (currentQuestionElement) currentQuestionElement.classList.add('hidden');
            if (feedbackSection) feedbackSection.style.display = 'none';
            if (questionText) questionText.textContent = '';
            if (answerInput) answerInput.value = '';
        });
    }

    // Add other event listeners
    if (submitButton) submitButton.addEventListener('click', handleSubmitAnswer);
    if (nextQuestionButton) nextQuestionButton.addEventListener('click', getNextQuestion);
});

async function initializeApp() {
    isInitialized = true;
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    if (questionContainer) questionContainer.classList.add('hidden');
    if (currentQuestionElement) currentQuestionElement.classList.add('hidden');
    if (feedbackSection) feedbackSection.style.display = 'none';
}

function getExampleQuestions(unit) {
    // Return unit-specific examples if available, otherwise return default examples
    return questionExamples[unit] || questionExamples['3.1'] || 
        `Example Question 1: "What is an algorithm?"
This shows how to format a knowledge-based question.

Example Question 2: "Explain how a binary search algorithm works."
This shows how to format a practical application question.`;
}

async function generateQuestion() {
    showLoading();
    const examples = getExampleQuestions(currentUnit);
    console.log('Generating question for unit:', currentUnit);
    
    let prompt = `You are an expert Computer Science teacher creating exam questions for GCSE students.
Create a new question in the style of AQA GCSE Computer Science exams for unit ${currentUnit}.`;

    if (currentUnit === '3.2') {
        prompt += `\n\nFor Python programming questions:
1. Always wrap Python code blocks with \`\`\`python and \`\`\` markers
2. Ensure proper indentation in the code
3. Include clear comments where helpful
4. Format the code exactly as it would appear in a Python editor`;
    }

    prompt += `\n\nHere are example questions and mark schemes from this unit to guide your style:

${examples}

Based on these examples, create a new question that:
1. Matches the difficulty level and style of the examples
2. Includes a clear mark scheme that follows AQA's positive marking approach
3. Has similar mark allocations to the examples

Format your response EXACTLY as follows (including the separators):
QUESTION START
(your question here) [X marks]
QUESTION END
MARK SCHEME START
(list marking points, with mark allocations)
MARK SCHEME END`;

    try {
        console.log('Sending request to generate question...');
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                prompt,
                type: 'question'
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Received response:', data);

        // Handle both possible response formats
        const content = data.content || data.message || '';

        // Extract question and mark scheme using the separators
        const questionMatch = content.match(/QUESTION START\n([\s\S]*?)\nQUESTION END/);
        const markSchemeMatch = content.match(/MARK SCHEME START\n([\s\S]*?)\nMARK SCHEME END/);

        if (!questionMatch || !markSchemeMatch) {
            throw new Error('Invalid response format');
        }

        currentQuestion = questionMatch[1].trim();
        currentMarkScheme = markSchemeMatch[1].trim();
        console.log('Successfully extracted question and mark scheme');
        
        if (questionText) {
            displayQuestion(currentQuestion);
            hideLoading();
            showQuestion();
        } else {
            throw new Error('Question text element not found');
        }
    } catch (error) {
        console.error('Error generating question:', error);
        if (questionText) {
            questionText.textContent = `Error generating question: ${error.message}. Please try again.`;
        }
        hideLoading();
    }
}

function displayQuestion(question) {
    if (!questionText) return;
    
    if (currentUnit === '3.2') {  // If Python unit is selected
        // Look for Python code indicators
        const hasPythonCode = question.includes('```python') || 
                            question.includes('CODE:') ||
                            question.includes('def ') ||
                            question.includes('print(') ||
                            question.includes('class ');

        if (hasPythonCode) {
            // First, handle explicit code blocks with ```python
            let formattedQuestion = question;
            
            // Handle explicit code blocks
            if (question.includes('```python')) {
                formattedQuestion = question.replace(/```python([\s\S]*?)```/g, (match, code) => {
                    // Preserve indentation and format code
                    const formattedCode = code.trim()
                        .split('\n')
                        .map(line => line.trimRight())  // Remove trailing spaces but keep indentation
                        .join('\n');
                    return `<div class="code-block"><code>${formattedCode}</code></div>`;
                });
            } else {
                // For implicit code (when no explicit markers)
                const lines = question.split('\n');
                let inCodeBlock = false;
                let codeBlockContent = [];
                
                formattedQuestion = lines.map(line => {
                    const trimmedLine = line.trim();
                    // Check if line looks like Python code
                    if (trimmedLine.match(/^(def |class |if |for |while |print\(|return |import |from )/) || 
                        line.startsWith('    ')) {
                        if (!inCodeBlock) {
                            inCodeBlock = true;
                            codeBlockContent = [];
                        }
                        codeBlockContent.push(line);
                        return null;  // We'll join the code block later
                    } else if (inCodeBlock) {
                        inCodeBlock = false;
                        const code = codeBlockContent.join('\n');
                        return `<div class="code-block"><code>${code}</code></div>${line}`;
                    }
                    return line;
                })
                .filter(line => line !== null)  // Remove null entries
                .join('\n');

                // Handle any remaining code block
                if (inCodeBlock) {
                    const code = codeBlockContent.join('\n');
                    formattedQuestion += `<div class="code-block"><code>${code}</code></div>`;
                }
            }
            
            questionText.innerHTML = formattedQuestion;
        } else {
            questionText.textContent = question;
        }
    } else {
        // For other units, display normally
        questionText.textContent = question;
    }
}

async function handleSubmitAnswer() {
    if (!answerInput.value.trim()) {
        alert('Please enter an answer before submitting.');
        return;
    }

    showLoading();
    const userAnswer = answerInput.value;
    
    const prompt = `You are an expert Computer Science teacher marking a GCSE student's binary to denary conversion answer.

The question was:
${currentQuestion}

The official mark scheme is:
${currentMarkScheme}

The student's answer:
${userAnswer}

Before providing feedback, carefully:
1. Check if the answer is a valid binary number (only contains 1s and 0s) if converting from binary
2. Verify the calculation:
   - For binary to denary: Calculate the sum of each binary digit multiplied by its corresponding power of 2
   - For denary to binary: Check if the binary number correctly represents the denary value
3. Award full marks if the final answer is mathematically correct
4. For incorrect answers, identify where the calculation went wrong

Format your response EXACTLY as follows (DO NOT include section headers in the content):
MARKS START
X/Y marks
MARKS END

STRENGTHS START
• List correct aspects of their calculation
• Mention if they used the right method even if final answer is wrong
STRENGTHS END

IMPROVEMENTS START
• Point out specific calculation errors
• Suggest the correct method if they used the wrong approach
IMPROVEMENTS END

MODEL ANSWER START
Show a clear step-by-step conversion process. For binary to denary, show the powers of 2 calculation. For denary to binary, show the division by 2 method.
MODEL ANSWER END`;

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                type: 'feedback'
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate feedback');
        }

        const data = await response.json();
        const content = data.content || data.message || '';

        // Extract sections using regex with non-greedy matching
        const marksMatch = content.match(/MARKS START\r?\n([\s\S]*?)\r?\nMARKS END/);
        const strengthsMatch = content.match(/STRENGTHS START\r?\n([\s\S]*?)\r?\nSTRENGTHS END/);
        const improvementsMatch = content.match(/IMPROVEMENTS START\r?\n([\s\S]*?)\r?\nIMPROVEMENTS END/);
        const modelAnswerMatch = content.match(/MODEL ANSWER START\r?\n([\s\S]*?)\r?\nMODEL ANSWER END/);

        let feedbackHTML = '';

        // Always show marks
        if (marksMatch) {
            const marks = marksMatch[1].trim();
            feedbackHTML += `<div class="marks"><strong>${marks}</strong></div>`;
        }

        // Always show strengths (what they did well)
        if (strengthsMatch) {
            const strengths = strengthsMatch[1].trim();
            feedbackHTML += `<div class="feedback-section">
                <h3>What You Did Well:</h3>
                <p>${strengths}</p>
            </div>`;
        }

        // Only show improvements if they didn't get full marks
        if (improvementsMatch && marksMatch) {
            const marks = marksMatch[1].trim();
            const [scored, total] = marks.split('/').map(n => parseInt(n));
            if (scored < total) {
                const improvements = improvementsMatch[1].trim();
                feedbackHTML += `<div class="improvements-section">
                    <h3>Areas for Improvement:</h3>
                    <p>${improvements}</p>
                </div>`;
            }
        }

        // Always show model answer, but only the actual answer text
        if (modelAnswerMatch) {
            const modelAnswer = modelAnswerMatch[1].trim();
            feedbackHTML += `<div class="model-answer-section">
                <h3>Model Answer:</h3>
                <p>${modelAnswer}</p>
            </div>`;
        }

        if (feedbackSection) feedbackSection.innerHTML = feedbackHTML;
        hideLoading();
        showFeedback();
    } catch (error) {
        console.error('Error:', error);
        if (feedbackSection) feedbackSection.textContent = 'Error generating feedback. Please try again.';
        hideLoading();
    }
}

function getNextQuestion() {
    showQuestion();
    generateQuestion();
}

function getTopicDescription(unit) {
    const topics = {
        '3.1': `Fundamentals of algorithms:
- Computational thinking
- Algorithms
- Programming fundamentals
- Types of programming language
- Searching algorithms
- Sorting algorithms`,
        '3.2': `Programming:
- Data types
- Programming concepts
- Arithmetic operations
- Arrays
- File handling
- SQL
- Validation`,
        '3.3': `Data representation:
- Number bases
- Converting between number bases
- Units of information
- Binary arithmetic
- Character encoding
- Image representation
- Sound representation
- Compression`,
        '3.4': `Computer systems:
- Hardware and software
- Boolean logic
- Software classification
- Systems architecture
- Memory
- Secondary storage
- System security`,
        '3.5': `Computer networks:
- Networks and topologies
- Wired and wireless networks
- Protocols and layers
- Network security
- Cyber security`,
        '3.6': `Cyber security:
- Cyber security threats
- Social engineering
- Malware
- Detection and prevention
- Network forensics`,
        '3.7': `Databases:
- Relational databases
- SQL
- Database design
- Normalisation
- Entity relationship diagrams`,
        '3.8': `Impacts of technology:
- Ethical issues
- Legal issues
- Environmental issues
- Privacy issues
- Cultural issues`
    };
    return topics[unit] || 'General Computer Science topics';
}
