// Constants
const API_ENDPOINT = '/.netlify/functions/chat';
let isInitialized = false;
let currentQuestion = '';
let currentUnit = '';

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const questionContainer = document.getElementById('question-container');
const loadingElement = document.getElementById('loading');
const currentQuestionElement = document.getElementById('current-question');
const questionText = document.getElementById('question-text');
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

function getExampleQuestions(unit) {
    const examples = {
        '3.1': `Example Question 1: "Define the term abstraction. [Total 1 mark]"
This shows how to format a knowledge-based definition question.

Example Question 2: "A program is being developed that allows users to rate and review movies. A user will enter their rating (out of 10) and a written review for each movie they have watched. Decomposition has been used to break the problem down into smaller sub-problems. Complete the decomposition of this program by stating what should be written in the missing boxes. [Total 2 marks]"
This shows how to format a scenario-based question with practical application.`,
        '3.2': `Example Question 1: "State what is meant by the term variable. [Total 1 mark]"
This shows how to format a knowledge-based definition question.

Example Question 2: "A program stores the names and ages of students in a class. Write an algorithm that will output the average age of all students in the class. [Total 4 marks]"
This shows how to format a programming problem-solving question.`,
        // Add examples for other units as PDFs become available
    };
    return examples[unit] || examples['3.1']; // Default to 3.1 if unit not found
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
                prompt: `You are an AQA GCSE Computer Science examiner creating questions for topic ${currentUnit}. 

Reference this AQA-style example from our question bank:

${getExampleQuestions(currentUnit)}

Requirements for your question:
1. Follow the exact AQA format shown in the examples:
   - Clear scenario (if applicable)
   - Precise command words (Define, Explain, State, etc.)
   - Mark allocation in square brackets [Total X marks]
   - For 4+ marks, break into parts (a), (b), etc.

2. Match the difficulty level:
   - 1-2 marks: Knowledge and understanding
   - 3-4 marks: Application of knowledge
   - 5-6 marks: Analysis and evaluation

3. Use appropriate command words:
   - "Define" for terminology
   - "Explain" for processes
   - "Describe" for features
   - "Compare" for similarities/differences
   - "Evaluate" for advantages/disadvantages

4. Focus specifically on topic ${currentUnit} from the specification:

${getTopicDescription(currentUnit)}

Generate an AQA-style question now, following this format exactly.`
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
