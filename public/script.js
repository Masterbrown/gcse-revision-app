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
                prompt: 'Generate a GCSE Computer Science question'
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
                prompt: `Question: ${currentQuestion}\n\nStudent's Answer: ${answerInput.value}`
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to get feedback');
        }

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
        sections.forEach(section => {
            if (section.toLowerCase().includes('score')) {
                scoreContainer.innerHTML = `<h3>Score</h3>${marked.parse(section.split('Score:')[1])}`;
                feedbackText.appendChild(scoreContainer);
            } else if (section.toLowerCase().includes('strength')) {
                strengthsContainer.innerHTML = `<h3>Strengths</h3>${marked.parse(section.split(/strengths:?/i)[1])}`;
                feedbackText.appendChild(strengthsContainer);
            } else if (section.toLowerCase().includes('improvement') || section.toLowerCase().includes('areas to improve')) {
                improvementsContainer.innerHTML = `<h3>Areas for Improvement</h3>${marked.parse(section.split(/improvements:?|areas to improve:?/i)[1])}`;
                feedbackText.appendChild(improvementsContainer);
            } else if (section.toLowerCase().includes('model answer')) {
                modelContainer.innerHTML = `<h3>Model Answer</h3>${marked.parse(section.split(/model answer:?/i)[1])}`;
                feedbackText.appendChild(modelContainer);
            }
        });

        console.log('Feedback sections:', sections); // Debug log to see the sections

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
