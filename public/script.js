// Constants
const API_ENDPOINT = '/.netlify/functions/chat';  // Use Netlify functions endpoint
let isInitialized = false;
let currentQuestion = '';
let currentMarkScheme = '';
let currentUnit = '';
let questionExamples = {};
let extractedQuestions = {};

// DOM Elements
let welcomeScreen;
let questionContainer;
let currentQuestionElement;
let questionText;
let answerInput;
let submitButton;
let feedbackSection;
let nextQuestionButton;
let backToUnitsButton;
let loadingElement;

// Initialize DOM references
function initializeDOMReferences() {
    welcomeScreen = document.getElementById('welcome-screen');
    questionContainer = document.getElementById('question-container');
    currentQuestionElement = document.getElementById('current-question');
    questionText = document.getElementById('question-text');
    answerInput = document.getElementById('answer-input');
    submitButton = document.getElementById('submit-answer');
    feedbackSection = document.getElementById('feedback-section');
    nextQuestionButton = document.getElementById('next-question');
    backToUnitsButton = document.getElementById('back-to-units');
    loadingElement = document.getElementById('loading');
    
    if (!welcomeScreen || !questionContainer || !currentQuestionElement || !questionText || 
        !answerInput || !submitButton || !feedbackSection || !nextQuestionButton || 
        !backToUnitsButton || !loadingElement) {
        console.error('Failed to initialize one or more DOM elements');
        throw new Error('Failed to initialize DOM elements');
    }
}

// Load both question examples and extracted questions when the page loads
Promise.all([
    fetch('question_examples.json')
        .then(response => response.json())
        .catch(error => {
            console.error('Error loading question examples:', error);
            return {
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
        }),
    fetch('extracted_questions.json')
        .then(response => response.json())
        .catch(error => {
            console.error('Error loading extracted questions:', error);
            return {};
        })
])
.then(([examples, extracted]) => {
    questionExamples = examples;
    extractedQuestions = extracted;
    console.log('Loaded question examples for units:', Object.keys(questionExamples));
    console.log('Loaded extracted questions for units:', Object.keys(extractedQuestions));
})
.catch(error => {
    console.error('Error initializing question data:', error);
    questionExamples = {};
    extractedQuestions = {};
});

// Unit-specific keywords
const unitKeywords = {
    '3.1': ['algorithm', 'computational', 'thinking', 'pseudocode', 'flowchart', 'search', 'sort', 'bubble', 'merge', 'insertion'],
    '3.2': ['python', 'programming', 'function', 'variable', 'loop', 'array', 'list', 'if', 'else', 'while', 'for'],
    '3.3': ['binary', 'denary', 'hexadecimal', 'conversion', 'bits', 'bytes', 'ascii', 'unicode', 'bitmap', 'resolution', 'sample'],
    '3.4': ['cpu', 'memory', 'ram', 'rom', 'cache', 'register', 'boolean', 'logic', 'and', 'or', 'not', 'hardware'],
    '3.5': ['network', 'topology', 'protocol', 'tcp/ip', 'ethernet', 'wifi', 'router', 'switch', 'packet', 'ip'],
    '3.6': ['cyber', 'security', 'threat', 'malware', 'virus', 'phishing', 'ddos', 'encryption', 'firewall'],
    '3.7': ['database', 'sql', 'table', 'query', 'primary key', 'foreign key', 'relationship', 'entity'],
    '3.8': ['ethical', 'legal', 'environmental', 'privacy', 'digital', 'impact', 'society']
};

// Initialize the app
function initializeApp() {
    console.log('Initializing app...');
    isInitialized = true;
    initializeDOMReferences();
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    if (questionContainer) questionContainer.classList.add('hidden');
    if (currentQuestionElement) currentQuestionElement.classList.add('hidden');
    if (feedbackSection) feedbackSection.style.display = 'none';
    console.log('App initialized');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('DOM Content Loaded');
        initializeApp();
        
        // Add unit button listeners
        const unitButtons = document.querySelectorAll('.unit-button');
        console.log('Found unit buttons:', unitButtons.length);
        
        unitButtons.forEach(button => {
            button.addEventListener('click', async () => {
                try {
                    console.log('Unit selected:', button.id);
                    currentUnit = button.id;
                    console.log('Selected unit:', currentUnit);
                    
                    // Show loading state immediately
                    welcomeScreen.classList.add('hidden');
                    questionContainer.classList.remove('hidden');
                    showLoading();
                    
                    // Validate unit selection
                    if (!unitKeywords[currentUnit]) {
                        throw new Error('Invalid unit selected');
                    }

                    // Generate question
                    await generateQuestion();
                } catch (error) {
                    console.error('Error handling unit selection:', error);
                    hideLoading();
                    questionText.textContent = `Error: ${error.message}. Please try again.`;
                    currentQuestionElement.classList.remove('hidden');
                }
            });
        });

        // Add back to units button listener
        backToUnitsButton.addEventListener('click', () => {
            console.log('Back to units clicked');
            currentUnit = ''; // Reset current unit
            welcomeScreen.classList.remove('hidden');
            questionContainer.classList.add('hidden');
            currentQuestionElement.classList.add('hidden');
            feedbackSection.style.display = 'none';
            questionText.textContent = '';
            answerInput.value = '';
        });

        // Add other event listeners
        submitButton.addEventListener('click', handleSubmitAnswer);
        nextQuestionButton.addEventListener('click', getNextQuestion);
        
        console.log('All event listeners added successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

function showLoading() {
    if (loadingElement) loadingElement.classList.remove('hidden');
    if (currentQuestionElement) currentQuestionElement.classList.add('hidden');
}

function hideLoading() {
    if (loadingElement) loadingElement.classList.add('hidden');
    // Don't automatically show question - let the calling function handle visibility
}

function showQuestion() {
    if (currentQuestionElement) currentQuestionElement.classList.remove('hidden');
    if (feedbackSection) feedbackSection.style.display = 'none';
}

function showFeedback() {
    if (currentQuestionElement) currentQuestionElement.classList.add('hidden');
    if (feedbackSection) feedbackSection.style.display = 'block';
}

// Function to get random questions for a unit
function getExampleQuestions(unit) {
    const questions = extractedQuestions[unit] || [];
    if (!questions.length) {
        console.error(`No questions found for unit ${unit}`);
        return [];
    }
    
    // Get 3 random questions
    const selectedQuestions = [];
    const numQuestions = Math.min(3, questions.length);
    const indices = new Set();
    
    while (indices.size < numQuestions) {
        const randomIndex = Math.floor(Math.random() * questions.length);
        if (!indices.has(randomIndex)) {
            indices.add(randomIndex);
            selectedQuestions.push(questions[randomIndex]);
        }
    }
    
    return selectedQuestions;
}

// Function to generate a new question
async function generateQuestion() {
    showLoading();
    currentQuestionElement.classList.add('hidden');
    
    try {
        // Get example questions for the current unit
        const examples = getExampleQuestions(currentUnit);
        if (!examples || examples.length === 0) {
            throw new Error(`No questions available for unit ${currentUnit}`);
        }
        
        // Select a random question from the examples
        const randomIndex = Math.floor(Math.random() * examples.length);
        const selectedQuestion = examples[randomIndex];
        
        if (!selectedQuestion || !selectedQuestion.question) {
            throw new Error('Invalid question format');
        }
        
        currentQuestion = selectedQuestion.question;
        currentMarkScheme = selectedQuestion.markScheme;
        
        displayQuestion(selectedQuestion);
    } catch (error) {
        console.error('Error generating question:', error);
        questionText.innerHTML = 'Error loading question. Please try again.';
    } finally {
        hideLoading();
        // Show question after loading is done
        showQuestion();
        answerInput.value = ''; // Clear previous answer
    }
}

// Function to display a question
function displayQuestion(questionData) {
    if (!questionData || !questionData.question) {
        console.error('Invalid question data:', questionData);
        return;
    }
    
    // Format the question text
    let formattedQuestion = questionData.question;
    
    // Handle code blocks if present
    if (formattedQuestion.includes('```')) {
        formattedQuestion = marked.parse(formattedQuestion);
    }
    
    // Display the question
    questionText.innerHTML = formattedQuestion;
    answerInput.value = '';
    
    // Show the question container
    currentQuestionElement.classList.remove('hidden');
    feedbackSection.style.display = 'none';
}

// Function to handle answer submission
async function handleSubmitAnswer() {
    if (!currentQuestion || !answerInput.value.trim()) {
        return;
    }
    
    showLoading();
    feedbackSection.style.display = 'none';
    
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: {
                    question: currentQuestion,
                    markScheme: currentMarkScheme,
                    answer: answerInput.value.trim()
                },
                unit: currentUnit
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get feedback');
        }
        
        const data = await response.json();
        console.log('Received feedback:', data.content); // Debug log
        
        // Use showFeedback() to handle visibility properly
        showFeedback();
        
        // Split raw content into sections
        const sections = data.content.split('\n\n');
        let score = '', strengths = '', improvements = '', model = '';
        
        // Find each section
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i].trim();
            if (section.startsWith('Score:')) {
                score = section;
            } else if (section.startsWith('Strengths:')) {
                strengths = section;
            } else if (section.startsWith('Areas for Improvement:')) {
                improvements = section;
            } else if (section.startsWith('Model Answer:')) {
                model = section;
            }
        }
        
        console.log('Parsed sections:', { score, strengths, improvements, model }); // Debug log
        
        // Parse and display each section
        document.getElementById('score-container').innerHTML = marked.parse(score || 'Score not provided');
        document.getElementById('strengths-container').innerHTML = marked.parse(strengths || 'No strengths provided');
        document.getElementById('improvements-container').innerHTML = marked.parse(improvements || 'No improvements provided');
        document.getElementById('model-container').innerHTML = marked.parse(model || 'No model answer provided');
        
    } catch (error) {
        console.error('Error submitting answer:', error);
        feedbackSection.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        feedbackSection.style.display = 'block';
    } finally {
        hideLoading();
    }
}

function getNextQuestion() {
    feedbackSection.style.display = 'none';
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
