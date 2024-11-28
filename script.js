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
                prompt: 'You are a GCSE Computer Science teacher creating exam questions. Generate a question from the AQA GCSE Computer Science specification (8525).\n\nRequirements:\n1. The question should follow AQA GCSE Computer Science exam style\n2. Include mark allocation by writing "X marks" at the end of the question (e.g., [2 marks])\n3. Mark allocation should be between 2-8 marks\n4. The question should be challenging but appropriate for GCSE level\n5. Only provide the question with mark allocation, no answers\n\nExample format:\nExplain how the CPU uses the fetch-execute cycle to run a program. [4 marks]'
            })
        });

        console.log('Response received:', response.status);
        const data = await response.json();
        console.log('Data:', data);
        
        // Check for error responses
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate question');
        }

        if (data.error) {
            throw new Error(data.error);
        }

        currentQuestion = data.message;
        questionText.textContent = data.message.trim();
        answerInput.value = '';
        showQuestion();
    } catch (error) {
        console.error('Error details:', error);
        const errorMessage = error.message.includes('rate limit') 
            ? 'The service is currently busy. Please try again in about an hour.' 
            : 'Error generating question. Please try again.';
        
        questionText.textContent = errorMessage;
        hideLoading();
    }
}

async function getNextQuestion() {
    showLoading();
    await generateQuestion();
}

async function handleSubmitAnswer() {
    if (!answerInput.value.trim()) {
        alert('Please enter an answer before submitting.');
        return;
    }

    showLoading();
    const answer = answerInput.value;

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'feedback',
                prompt: `Question: ${currentQuestion}\n\nStudent's Answer: ${answer}\n\nAs a GCSE Computer Science teacher, provide constructive feedback on this student's answer. The feedback should be encouraging and personal.\n\nProvide feedback in this EXACT format:\n\nScore:\n[State the score they achieved out of the total marks available]\n\nStrengths:\n[Highlight what the student did well, being specific about correct concepts and good explanations]\n\nAreas for Improvement:\n[Provide constructive suggestions on what could be added or clarified, relating to missing marks]\n\nModel Answer:\n[Provide a clear, comprehensive answer that would achieve full marks, written in student-friendly language]\n\nRemember to:\n1. Be encouraging and speak directly to the student\n2. Relate feedback to the mark scheme and mark allocation\n3. Use clear, student-friendly language\n4. Be specific about concepts and explanations`
            })
        });

        // Check for rate limit error in the response
        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.error && errorData.error.includes('rate limit')) {
                document.getElementById('score-container').innerHTML = `
                    <div class="feedback-title">Service Temporarily Busy</div>
                    <div>
                        The service is currently experiencing high demand. Please wait about an hour before trying again.
                        <br><br>
                        This helps ensure everyone can use the revision app fairly.
                    </div>
                `;
                document.getElementById('strengths-container').style.display = 'none';
                document.getElementById('improvements-container').style.display = 'none';
                document.getElementById('model-container').style.display = 'none';
                document.getElementById('feedback-section').style.display = 'block';
                return;
            }
            throw new Error('Failed to get feedback');
        }

        const data = await response.json();
        
        // Split the feedback into sections
        const feedbackTextContent = data.message;
        
        // Extract content sections
        const [scorePart, rest1] = feedbackTextContent.split('Strengths:');
        const [strengthsPart, rest2] = rest1.split('Areas for Improvement:');
        const [improvementsPart, rest3] = rest2.split('Model Answer:');
        const modelPart = rest3.split('\n\nRemember')[0];

        // Function to create content with title
        const createContent = (content, title) => {
            return `
                <div class="feedback-title">${title}</div>
                <div>${content.trim().replace(/\n/g, '<br>')}</div>
            `;
        };

        // Update each container
        document.getElementById('score-container').innerHTML = createContent(scorePart, 'Score');
        document.getElementById('strengths-container').innerHTML = createContent(strengthsPart, 'Strengths');
        document.getElementById('improvements-container').innerHTML = createContent(improvementsPart, 'Areas for Improvement');
        document.getElementById('model-container').innerHTML = createContent(modelPart, 'Model Answer');

        // Show feedback section
        document.getElementById('feedback-section').style.display = 'block';
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('feedback-text').textContent = 'Error generating feedback. Please try again.';
    } finally {
        hideLoading();
    }
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
