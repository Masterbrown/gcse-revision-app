// Constants
const API_ENDPOINT = '/.netlify/functions/chat';
let isInitialized = false;
let currentQuestion = '';
let currentMarkScheme = '';
let currentUnit = '';
let questionExamples = {};

// Load question examples when the page loads
fetch('question_examples.json')
    .then(response => response.json())
    .then(data => {
        questionExamples = data;
        console.log('Loaded question examples for units:', Object.keys(questionExamples));
    })
    .catch(error => console.error('Error loading question examples:', error));

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const questionContainer = document.getElementById('question-container');
const loadingElement = document.getElementById('loading');
const currentQuestionElement = document.getElementById('current-question');
const questionText = document.getElementById('question-text');
const markSchemeText = document.getElementById('mark-scheme-text');
const answerInput = document.getElementById('answer-input');
const submitButton = document.getElementById('submit-answer');
const feedbackContainer = document.getElementById('feedback-container');
const feedbackText = document.getElementById('feedback-text');
const nextQuestionButton = document.getElementById('next-question');
const backToUnitsButton = document.getElementById('back-to-units');
const unitButtons = document.querySelectorAll('.unit-button');

// Event Listeners
document.addEventListener('DOMContentLoaded', initializeApp);
submitButton.addEventListener('click', handleSubmitAnswer);
nextQuestionButton.addEventListener('click', getNextQuestion);
backToUnitsButton.addEventListener('click', showWelcomeScreen);

// Add click event listeners to unit buttons
unitButtons.forEach(button => {
    button.addEventListener('click', () => {
        currentUnit = button.dataset.unit;
        welcomeScreen.classList.add('hidden');
        questionContainer.classList.remove('hidden');
        currentQuestionElement.classList.remove('hidden');
        generateQuestion();
    });
});

function showWelcomeScreen() {
    welcomeScreen.classList.remove('hidden');
    questionContainer.classList.add('hidden');
    currentQuestionElement.classList.add('hidden');
    feedbackContainer.classList.add('hidden');
}

async function initializeApp() {
    isInitialized = true;
    showWelcomeScreen();
}

function showLoading() {
    loadingElement.style.display = 'block';
    questionText.textContent = 'Generating question...';
}

function hideLoading() {
    loadingElement.style.display = 'none';
}

function showQuestion() {
    hideLoading();
    currentQuestionElement.classList.remove('hidden');
    feedbackContainer.classList.add('hidden');
}

function showFeedback() {
    questionText.style.display = 'none';
    answerInput.style.display = 'none';
    submitButton.style.display = 'none';
    feedbackContainer.style.display = 'block';
    nextQuestionButton.style.display = 'block';
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
    
    const prompt = `You are an expert Computer Science teacher creating exam questions for GCSE students.
Create a new question in the style of AQA GCSE Computer Science exams for unit ${currentUnit}.

Here are example questions and mark schemes from this unit to guide your style:

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
        console.log('Sending request to generate question for unit:', currentUnit);
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
            console.error('API response not ok:', response.status, response.statusText);
            throw new Error('Failed to generate question');
        }

        const data = await response.json();
        console.log('Received response:', data);

        // Handle both possible response formats
        const content = data.content || data.message || '';

        // Extract question and mark scheme using the separators
        const questionMatch = content.match(/QUESTION START\n([\s\S]*?)\nQUESTION END/);
        const markSchemeMatch = content.match(/MARK SCHEME START\n([\s\S]*?)\nMARK SCHEME END/);

        if (questionMatch && markSchemeMatch) {
            currentQuestion = questionMatch[1].trim();
            currentMarkScheme = markSchemeMatch[1].trim();
            console.log('Successfully extracted question and mark scheme');
        } else {
            console.error('Failed to parse response format:', content);
            throw new Error('Invalid question format received');
        }
        
        // Only display the question, not the mark scheme
        questionText.textContent = currentQuestion;
        answerInput.value = '';
        feedbackText.textContent = '';
        showQuestion();
    } catch (error) {
        console.error('Error generating question:', error);
        questionText.textContent = 'Error generating question. Please try again.';
    } finally {
        hideLoading();
    }
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

async function handleSubmitAnswer() {
    const userAnswer = answerInput.value;
    
    const prompt = `You are an expert Computer Science teacher marking a GCSE student's answer.

The question was:
${currentQuestion}

The official mark scheme is:
${currentMarkScheme}

The student's answer:
${userAnswer}

Please mark this answer following AQA's positive marking approach:
1. Award marks for valid points that match the mark scheme
2. Be specific about which points from the mark scheme were met
3. Only provide improvement suggestions if the student didn't get full marks

Format your response as follows:
MARKS START
X/Y marks
MARKS END
FEEDBACK START
(explanation of marks awarded)
FEEDBACK END
IMPROVEMENTS START
(only include this section if student didn't get full marks - suggest specific improvements to reach full marks)
IMPROVEMENTS END`;

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

        // Extract sections using regex
        const marksMatch = content.match(/MARKS START\n([\s\S]*?)\nMARKS END/);
        const feedbackMatch = content.match(/FEEDBACK START\n([\s\S]*?)\nFEEDBACK END/);
        const improvementsMatch = content.match(/IMPROVEMENTS START\n([\s\S]*?)\nIMPROVEMENTS END/);

        let feedbackHTML = '';

        if (marksMatch) {
            const marks = marksMatch[1].trim();
            feedbackHTML += `<div class="marks"><strong>${marks}</strong></div>`;
        }

        if (feedbackMatch) {
            const feedback = feedbackMatch[1].trim();
            feedbackHTML += `<div class="feedback-section">
                <h3>Feedback:</h3>
                <p>${feedback}</p>
            </div>`;
        }

        // Only show improvements if they exist and the student didn't get full marks
        if (improvementsMatch && !marksMatch[1].includes('/')) {
            const improvements = improvementsMatch[1].trim();
            feedbackHTML += `<div class="improvements-section">
                <h3>Areas for Improvement:</h3>
                <p>${improvements}</p>
            </div>`;
        }

        feedbackText.innerHTML = feedbackHTML;
        showFeedback();
    } catch (error) {
        console.error('Error:', error);
        feedbackText.textContent = 'Error generating feedback. Please try again.';
    }
}

function getNextQuestion() {
    // Reset UI state
    questionText.style.display = 'block';
    answerInput.style.display = 'block';
    submitButton.style.display = 'block';
    feedbackContainer.style.display = 'none';
    nextQuestionButton.style.display = 'none';
    
    // Generate new question
    generateQuestion();
}
