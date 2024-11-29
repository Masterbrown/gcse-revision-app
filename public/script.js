// Constants
const API_ENDPOINT = '/.netlify/functions/chat';  // Restore original endpoint
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

async function getExampleQuestions(unit) {
    let examples = questionExamples[unit] || '';
    
    // Add extracted questions from PDFs if available
    const extractedUnitQuestions = extractedQuestions[unit] || [];
    if (extractedUnitQuestions.length > 0) {
        // Add up to 3 random extracted questions
        const selectedQuestions = extractedUnitQuestions
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);
            
        examples += '\n\nExtracted example questions:\n' + 
            selectedQuestions.map(q => 
                `${q.question}\n${q.markScheme}`
            ).join('\n\n');
    }
    
    return examples;
}

async function generateQuestion() {
    showLoading();
    try {
        if (!currentUnit || !unitKeywords[currentUnit]) {
            throw new Error('Invalid unit selected. Please select a valid unit.');
        }

        const examples = await getExampleQuestions(currentUnit);
        const topicDescription = getTopicDescription(currentUnit);
        const keywords = unitKeywords[currentUnit] || [];
        
        if (keywords.length === 0) {
            throw new Error('No keywords found for the selected unit. Please try another unit.');
        }

        console.log('Generating question for unit:', currentUnit);
        
        let prompt = `You are an expert Computer Science teacher creating exam questions for GCSE students.
You MUST create a question SPECIFICALLY for unit ${currentUnit} that tests the following topics ONLY:
${topicDescription}

IMPORTANT RULES:
1. The question MUST be about one of these topics ONLY
2. DO NOT create questions about topics from other units
3. Use at least one of these key terms: ${keywords.join(', ')}
4. The question difficulty MUST be at GCSE level (14-16 year olds)
5. Make the question practical and relevant to real-world applications`;

        if (currentUnit === '3.2') {
            prompt += `\n\nFor Python programming questions:
1. Always wrap Python code blocks with \`\`\`python and \`\`\` markers
2. Ensure proper indentation in the code
3. Include clear comments where helpful
4. Format the code exactly as it would appear in a Python editor
5. Focus on: ${keywords.join(', ')}`;
        } else if (currentUnit === '3.3') {
            prompt += `\n\nFor number conversion questions:
1. Include clear working out steps in the mark scheme
2. Use appropriate notation (e.g., binary numbers prefixed with '0b')
3. Show the conversion process step by step
4. Focus on: ${keywords.join(', ')}`;
        } else if (currentUnit === '3.4') {
            prompt += `\n\nFor Boolean logic and hardware questions:
1. Use proper Boolean algebra notation
2. Include truth tables where relevant
3. Use correct technical terminology for hardware components
4. Focus on: ${keywords.join(', ')}`;
        }

        prompt += `\n\nHere are example questions and mark schemes from this unit to guide your style:

${examples}

Based on these examples, create a new question that:
1. Matches the difficulty level and style of the examples
2. Includes a clear mark scheme that follows AQA's positive marking approach
3. Has similar mark allocations to the examples
4. MUST test knowledge of ${currentUnit} unit topics ONLY
5. Uses appropriate technical terminology for this unit
6. Includes at least one of these key terms: ${keywords.join(', ')}

DO NOT create a question about topics from other units.

Format your response EXACTLY as follows (including the separators):
QUESTION START
(your question here) [X marks]
QUESTION END
MARK SCHEME START
(list marking points, with mark allocations)
MARK SCHEME END`;

        console.log('Sending request to generate question...');
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                prompt,
                type: 'question',
                max_tokens: 500
            }),
        });

        if (!response.ok) {
            console.error('API response not OK:', response.status, response.statusText);
            throw new Error(`Failed to generate question (HTTP ${response.status})`);
        }

        const data = await response.json();
        console.log('Received response:', data);

        if (!data || (!data.content && !data.message)) {
            console.error('Invalid API response:', data);
            throw new Error('Invalid API response format');
        }

        // Handle both possible response formats
        const content = data.content || data.message || '';

        // Extract question and mark scheme using the separators
        const questionMatch = content.match(/QUESTION START\n([\s\S]*?)\nQUESTION END/);
        const markSchemeMatch = content.match(/MARK SCHEME START\n([\s\S]*?)\nMARK SCHEME END/);

        if (!questionMatch || !markSchemeMatch) {
            console.error('Invalid question format in response:', content);
            throw new Error('The generated question format was invalid. Please try again.');
        }

        const questionText = questionMatch[1].trim();
        const markScheme = markSchemeMatch[1].trim();

        // Validate that the question contains at least one keyword from the unit
        const hasKeyword = keywords.some(keyword => 
            questionText.toLowerCase().includes(keyword.toLowerCase()) || 
            markScheme.toLowerCase().includes(keyword.toLowerCase())
        );

        if (!hasKeyword) {
            console.error('Question missing keywords:', questionText);
            throw new Error('The generated question was not relevant to the selected unit. Please try again.');
        }

        currentQuestion = questionText;
        currentMarkScheme = markScheme;
        console.log('Successfully extracted question and mark scheme');
        
        displayQuestion(currentQuestion);
        showQuestion();
    } catch (error) {
        console.error('Error in generateQuestion:', error);
        if (questionText) {
            questionText.textContent = `Error: ${error.message}. Please try selecting the unit again.`;
        }
    } finally {
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
    submitButton.disabled = true;
    answerInput.disabled = true;

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: answerInput.value,
                unit: currentUnit
            })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        const feedbackContent = data.content;

        // Update the feedback section
        const scoreContainer = document.getElementById('score-container');
        const strengthsContainer = document.getElementById('strengths-container');
        const improvementsContainer = document.getElementById('improvements-container');
        const modelContainer = document.getElementById('model-container');

        // Extract sections using regex for more precise matching
        const scoreMatch = feedbackContent.match(/Score:\s*([\s\S]*?)(?=\n\s*(?:Strengths:|$))/i);
        const strengthsMatch = feedbackContent.match(/Strengths:\s*([\s\S]*?)(?=\n\s*(?:Areas for Improvement:|$))/i);
        const improvementsMatch = feedbackContent.match(/Areas for Improvement:\s*([\s\S]*?)(?=\n\s*(?:Model Answer:|$))/i);
        const modelMatch = feedbackContent.match(/Model Answer:\s*([\s\S]*?)(?=$)/i);

        // Helper function to format bullet points
        const formatBulletPoints = (text) => {
            if (!text) return '';
            return text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n');
        };

        // Update containers with formatted content
        scoreContainer.innerHTML = marked.parse(scoreMatch ? `## Score\n${formatBulletPoints(scoreMatch[1])}` : 'Score not provided');
        strengthsContainer.innerHTML = marked.parse(strengthsMatch ? `## Strengths\n${formatBulletPoints(strengthsMatch[1])}` : 'Strengths not provided');
        improvementsContainer.innerHTML = marked.parse(improvementsMatch ? `## Areas for Improvement\n${formatBulletPoints(improvementsMatch[1])}` : 'Areas for improvement not provided');
        modelContainer.innerHTML = marked.parse(modelMatch ? `## Model Answer\n${formatBulletPoints(modelMatch[1])}` : 'Model answer not provided');

        // Show the feedback section
        currentQuestionElement.style.display = 'none';
        feedbackSection.style.display = 'block';
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to submit answer. Please try again.');
    } finally {
        hideLoading();
        submitButton.disabled = false;
        answerInput.disabled = false;
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
