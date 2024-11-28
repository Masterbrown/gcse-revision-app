// Constants
const API_ENDPOINT = '/.netlify/functions/chat';
let isInitialized = false;
let currentQuestion = '';

// DOM Elements
const loadingElement = document.getElementById('loading');
const currentQuestionElement = document.getElementById('current-question');
const questionText = document.getElementById('question-text');
const answerInput = document.getElementById('answer-input');
const submitButton = document.getElementById('submit-answer');
const feedbackContainer = document.getElementById('feedback-container');
const feedbackText = document.getElementById('feedback-text');
const nextQuestionButton = document.getElementById('next-question');

// Event Listeners
document.addEventListener('DOMContentLoaded', initializeApp);
submitButton.addEventListener('click', handleSubmitAnswer);
nextQuestionButton.addEventListener('click', getNextQuestion);

async function initializeApp() {
    isInitialized = true;
    await generateQuestion();
}

function showLoading() {
    loadingElement.classList.remove('hidden');
    currentQuestionElement.classList.add('hidden');
    feedbackContainer.classList.add('hidden');
}

function hideLoading() {
    loadingElement.classList.add('hidden');
}

function showQuestion() {
    hideLoading();
    currentQuestionElement.classList.remove('hidden');
    feedbackContainer.classList.add('hidden');
}

function showFeedback() {
    feedbackContainer.classList.remove('hidden');
}

async function generateQuestion() {
    try {
        console.log('Generating question...');
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'question',
                prompt: `Generate a GCSE Computer Science question following the AQA exam board style (Specification 8525).

Requirements:
1. Use appropriate AQA command words (State, Describe, Explain, Compare, Evaluate)
2. Include mark allocation in square brackets [X marks]
3. For questions worth 4+ marks, break into parts (a), (b), etc.
4. Use technical vocabulary from the AQA specification
5. Match AQA's assessment objectives (AO1: Knowledge, AO2: Application, AO3: Analysis)
6. Focus on one of these AQA specification topics:
   - 3.1 Fundamentals of algorithms
   - 3.2 Programming
   - 3.3 Fundamentals of data representation
   - 3.4 Computer systems
   - 3.5 Fundamentals of computer networks
   - 3.6 Cyber security
   - 3.7 Relational databases and SQL
   - 3.8 Ethical, legal and environmental impacts

Generate a question now:`
            })
        });

        console.log('Response received:', response.status);
        const data = await response.json();
        console.log('Data:', data);
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate question');
        }

        currentQuestion = data.message;
        questionText.textContent = data.message.trim();
        answerInput.value = '';
        showQuestion();
    } catch (error) {
        console.error('Error details:', error);
        questionText.textContent = 'Error generating question. Please try again.';
        hideLoading();
    }
}

async function handleSubmitAnswer() {
    if (!answerInput.value.trim()) {
        alert('Please enter an answer before submitting.');
        return;
    }

    showLoading();
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'feedback',
                prompt: `You are an AQA GCSE Computer Science examiner marking the following question and answer. Follow AQA's positive marking approach - award marks for valid points even if not perfectly expressed.
                
Question: ${currentQuestion}

Student's Answer: ${answerInput.value}

Key AQA Marking Principles:
• Award marks for valid points even if not using exact technical terms
• Accept alternative valid answers and approaches
• If a student makes multiple valid points, award the marks even if mixed with incorrect points
• Look for understanding rather than perfect terminology
• For longer answers, credit valid points wherever they appear
• Award marks for correct working even if final answer is wrong
• If answer shows understanding but lacks detail, award partial marks
• For 6+ mark questions, use levels marking focusing on overall quality

Provide feedback in this format:

Score:
[Show marks awarded]/[total marks]
• Brief explanation of marks awarded
• Highlight what earned the marks

Strengths:
• Focus on the valid points made
• Acknowledge partial understanding
• Credit correct use of concepts even if terminology isn't perfect

Areas for Improvement:
• Suggest ways to gain additional marks
• Frame as "To gain full marks, you could..."
• Provide constructive suggestions rather than criticisms

Model Answer:
• Show a complete answer that would achieve full marks
• Include alternative valid approaches
• Demonstrate the level of detail required

Provide the feedback now:`
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to get feedback');
        }

        console.log('Raw feedback message:', data.message); // Debug log for raw message

        // Clear previous feedback
        feedbackText.innerHTML = '';

        // Create containers for each feedback section
        const scoreContainer = document.createElement('div');
        scoreContainer.id = 'score-container';
        const strengthsContainer = document.createElement('div');
        strengthsContainer.id = 'strengths-container';
        const improvementsContainer = document.createElement('div');
        improvementsContainer.id = 'improvements-container';
        const modelContainer = document.createElement('div');
        modelContainer.id = 'model-container';

        // Parse the feedback sections
        const sections = data.message.split('\n\n');
        console.log('Split sections:', sections); // Debug log for sections

        sections.forEach(section => {
            console.log('Processing section:', section); // Debug log for current section
            
            if (section.toLowerCase().includes('score')) {
                console.log('Found score section');
                scoreContainer.innerHTML = `<h3>Score</h3>${marked.parse(section.split('Score:')[1] || section)}`;
                feedbackText.appendChild(scoreContainer);
            } 
            if (section.toLowerCase().includes('strength')) {
                console.log('Found strengths section');
                strengthsContainer.innerHTML = `<h3>Strengths</h3>${marked.parse(section.split(/strengths:?/i)[1] || section)}`;
                feedbackText.appendChild(strengthsContainer);
            } 
            if (section.toLowerCase().includes('improve')) {
                console.log('Found improvements section');
                improvementsContainer.innerHTML = `<h3>Areas for Improvement</h3>${marked.parse(section.split(/improvements:?|areas to improve:?|areas for improvement:?/i)[1] || section)}`;
                feedbackText.appendChild(improvementsContainer);
            } 
            if (section.toLowerCase().includes('model')) {
                console.log('Found model answer section');
                modelContainer.innerHTML = `<h3>Model Answer</h3>${marked.parse(section.split(/model answer:?/i)[1] || section)}`;
                feedbackText.appendChild(modelContainer);
            }
        });

        hideLoading();
        showFeedback();
    } catch (error) {
        console.error('Error:', error);
        feedbackText.textContent = 'Error generating feedback. Please try again.';
    } finally {
        hideLoading();
    }
}

async function getNextQuestion() {
    showLoading();
    await generateQuestion();
}
