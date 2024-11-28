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

        const data = await response.json();
        
        // Split the feedback into sections and format each section
        const feedbackTextContent = data.message;
        let formattedFeedback = '';
        
        // Function to extract section content
        const extractSection = (text, sectionStart, nextSectionStart) => {
            const startIndex = text.indexOf(sectionStart);
            if (startIndex === -1) return '';
            
            const endIndex = text.indexOf(nextSectionStart, startIndex);
            const content = endIndex === -1 
                ? text.slice(startIndex + sectionStart.length) 
                : text.slice(startIndex + sectionStart.length, endIndex);
                
            return content.trim();
        };

        // Extract each section
        const scoreSection = extractSection(feedbackTextContent, 'Score:', 'Strengths:');
        const strengthsSection = extractSection(feedbackTextContent, 'Strengths:', 'Areas for Improvement:');
        const improvementsSection = extractSection(feedbackTextContent, 'Areas for Improvement:', 'Model Answer:');
        const modelSection = extractSection(feedbackTextContent, 'Model Answer:', '\n\nRemember');

        // Clear previous feedback
        const feedbackElement = document.getElementById('feedback-text');
        feedbackElement.innerHTML = '';

        // Add each section as a separate div
        if (scoreSection) {
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'feedback-score';
            scoreDiv.innerHTML = `Score:${scoreSection.replace(/\n/g, '<br>')}`;
            feedbackElement.appendChild(scoreDiv);
        }
        
        if (strengthsSection) {
            const strengthsDiv = document.createElement('div');
            strengthsDiv.className = 'feedback-strengths';
            strengthsDiv.innerHTML = `Strengths:${strengthsSection.replace(/\n/g, '<br>')}`;
            feedbackElement.appendChild(strengthsDiv);
        }
        
        if (improvementsSection) {
            const improvementsDiv = document.createElement('div');
            improvementsDiv.className = 'feedback-improvements';
            improvementsDiv.innerHTML = `Areas for Improvement:${improvementsSection.replace(/\n/g, '<br>')}`;
            feedbackElement.appendChild(improvementsDiv);
        }
        
        if (modelSection) {
            const modelDiv = document.createElement('div');
            modelDiv.className = 'feedback-model';
            modelDiv.innerHTML = `Model Answer:${modelSection.replace(/\n/g, '<br>')}`;
            feedbackElement.appendChild(modelDiv);
        }
        
        showFeedback();
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
