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

                    // Generate AI question using strict rules
                    await fetchNewAIQuestion(currentUnit);
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

// Function to fetch a new AI-generated question for the current unit
async function fetchNewAIQuestion(unit) {
    showLoading();
    try {
        // Get topic description and 2-3 example questions for the selected unit
        const topicDescription = getTopicDescription(unit);
        const exampleQuestions = getExampleQuestions(unit);

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: {
                    question: `Please generate a new GCSE Computer Science question for unit ${unit}.`,
                    topicDescription: topicDescription,
                    exampleQuestions: exampleQuestions
                },
                unit: unit
            })
        });
        if (!response.ok) throw new Error('Failed to fetch AI question');
        const data = await response.json();
        // Display the AI-generated question
        questionText.innerHTML = data.content;
        currentQuestionElement.classList.remove('hidden');
        feedbackSection.style.display = 'none';
        // Optionally set currentQuestion for answer submission
        currentQuestion = data.content;
        currentMarkScheme = '';
    } catch (error) {
        questionText.innerHTML = 'Error fetching AI question: ' + error.message;
        currentQuestionElement.classList.remove('hidden');
    } finally {
        hideLoading();
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
        // Convert markdown bullets to HTML lists for strengths and improvements
function bulletsToList(section) {
    if (!section) return '';
    // Remove the title (e.g., 'Strengths:')
    const lines = section.split('\n').map(l => l.trim());
    const title = lines.shift();
    const bullets = lines.filter(l => l.startsWith('•'));
    if (!bullets.length) return marked.parse(section);
    return `<strong>${title}</strong><ul>` + bullets.map(b => `<li>${b.replace(/^•\s*/, '')}</li>`).join('') + '</ul>';
}
document.getElementById('strengths-container').innerHTML = bulletsToList(strengths || 'No strengths provided');
document.getElementById('improvements-container').innerHTML = bulletsToList(improvements || 'No improvements provided');
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
    // === EDIT BELOW: Enter your own topic descriptions for each unit. ===
    // Example:
    // '3.1': `Algorithms: sorting, searching, pseudocode, computational thinking, etc.`,
    // '3.2': `Programming: variables, loops, arrays, SQL, data types, etc.`,
    //
    const topics = {
        '3.1': `Algorithms - 
Representing algorithms: Understand and explain the term algorithm. An algorithm is a sequence of steps that can be followed to complete a task. Be aware that a computer program is an implementation of an algorithm and that an algorithm is not a computer program. Understand and explain the term decomposition. Decomposition means breaking a problem into a number of sub-problems, so that each subproblem accomplishes an identifiable task, which might itself be further subdivided. Understand and explain the term abstraction. Abstraction is the process of removing unnecessary detail from a problem. Use a systematic approach to problem solving and algorithm creation representing those algorithms using pseudo-code, program code and flowcharts. Any exam question where students are given pseudo-code will use the AQA standard version. Exam questions will indicate the form of response expected. For example, pseudo-code, program code or a flowchart. Explain simple algorithms in terms of their inputs, processing and outputs. Students must be able to identify where inputs, processing and outputs are taking place within an algorithm. Determine the purpose of simple algorithms. Students should be able to use trace tables and visual inspection to determine how simple algorithms work and what their purpose is.
Efficiency of algorithms: Understand that more than one algorithm can be used to solve the same problem. Compare the efficiency of algorithms explaining how some algorithms are more efficient than others in solving the same problem. Formal comparisons of algorithmic efficiency are not required. Exam questions in this area will only refer to time efficiency. 10 Visit aqa.org.uk/8525 for the most up-to-date specification, resources, support and administration.
Searching algorithms: Understand and explain how the linear search algorithm works. Students should know the mechanics of the algorithm. Understand and explain how the binary search algorithm works. Students should know the mechanics of the algorithm. Compare and contrast linear and binary search algorithms. Students should know the advantages and disadvantages of both algorithms.
Sorting algorithms: Understand and explain how the merge sort algorithm works. Students should know the mechanics of the algorithm. Understand and explain how the bubble sort algorithm works. Students should know the mechanics of the algorithm. Compare and contrast merge sort and bubble sort algorithms. Students should know the advantages and disadvantages of both algorithms.`,
        '3.2': `Programming -
ALL QUESTIONS MUST BE RELATED TO PYTHON
Data types: Understand the concept of a data type. Understand and use the following appropriately: • integer • real • Boolean • character • string. Depending on the actual programming language(s) being used, these data types may have other names. For example real numbers may be described as float. In exams we will use the general names given opposite.
Programming concepts: Use, understand and know how the following statement types can be combined in programs: • variable declaration • constant declaration • assignment • iteration • selection • subroutine (procedure/function). The three combining principles (sequence, iteration/repetition and selection/choice) are basic to all high-level imperative programming languages. Students should be able to write programs using these statement types. They should be able to interpret and write algorithms that include these statement types. Students should know why named constants and variables are used.  Use definite (count controlled) and indefinite (condition controlled) iteration, including indefinite iteration with the condition(s) at the start or the end of the iterative structure. A theoretical understanding of condition(s) at either end of an iterative structure is required, regardless of whether they are supported by the language(s) being used. An example of definite (count controlled) iteration would be: FOR i ← 1 TO 5 … Instructions here … ENDFOR An example of indefinite (condition controlled) iteration with the condition at the start would be: WHILE NotSolved … Instructions here … ENDWHILE Examples of indefinite (condition controlled) iteration with the condition at the end would be: REPEAT … Instructions here … UNTIL Solved DO … Instructions here … WHILE NotSolved Use nested selection and nested iteration structures. An example of nested iteration would be: WHILE NotSolved … Instructions here ... FOR i ← 1 TO 5 … Instructions here … ENDFOR … Instructions here … ENDWHILE An example of nested selection would be: IF GameWon THEN … Instructions here … IF Score > HighScore THEN … Instructions here … ENDIF … Instructions here … ENDIF Use meaningful identifier names and know why it is important to use them. Identifier names include names for variables, constants and subroutine names.
Arithmetic operations in a programming language: Be familiar with and be able to use: • addition • subtraction • multiplication • real division • integer division, including remainders. Integer division, including remainders, is usually a two stage process and uses modular arithmetic: eg the calculation 11/2 would generate the following values: Integer division: the integer quotient of 11 divided by 2 (11 DIV 2) = 5 Remainder: the remainder when 11 is divided by 2 (11 MOD 2) = 1
Relational operations in a programming language: Be familiar with and be able to use: • equal to • not equal to • less than • greater than • less than or equal to • greater than or equal to. Students should be able to use these operators within their own programs and be able to interpret them when used within algorithms. Note that different languages may use different symbols to represent these operators.
Boolean operations in a programming language: Be familiar with and be able to use: • NOT • AND • OR. Students should be able to use these operators, and combinations of these operators, within conditions for iterative and selection structures. 
Data structures: Understand the concept of data structures. It may be helpful to set the concept of a data structure in various contexts that students may already be familiar with. It may also be helpful to suggest/demonstrate how data structures could be used in a practical setting. Use arrays (or equivalent) in the design of solutions to simple problems. Only one and two-dimensional arrays are required. Use records (or equivalent) in the design of solutions to simple problems. An example of a record definition would be: RECORD Car make : String model : String reg : String price : Real noOfDoors : Integer ENDRECORD
Input/output: Be able to obtain user input from the keyboard. Be able to output data and information from a program to the computer display.
String handling operations in a programming language: Understand and be able to use: • length • position • substring • concatenation • convert character to character code • convert character code to character • string conversion operations. Expected string conversion operations: • string to integer • string to real • integer to string • real to string.
Random number generation in a programming language: Be able to use random number generation. Students will be expected to use random number generation within their computer programs. An understanding of how pseudorandom numbers are generated is not required. 
Structured programming and subroutines (procedures and functions): Understand the concept of subroutines. Students should know that a subroutine is a named ‘out of line’ block of code that may be executed (called) by simply writing its name in a program statement. Explain the advantages of using subroutines in programs. Describe the use of parameters to pass data within programs. Students should be able to use subroutines that require more than one parameter. Students should be able to describe how data is passed to a subroutine using parameters. Use subroutines that return values to the calling routine. Students should be able to describe how data is passed out of a subroutine using return values. Know that subroutines may declare their own variables, called local variables, and that local variables usually: • only exist while the subroutine is executing • are only accessible within the subroutine. Use local variables and explain why it is good practice to do so. Describe the structured approach to programming. Students should be able to describe the structured approach including modularised programming, clear well-documented interfaces (local variables, parameters) and return values. Teachers should be aware that the terms arguments and parameters are sometimes used but in examinable material we will use the term parameter to refer to both of these. Explain the advantages of the structured approach.
Robust and secure programming: Be able to write simple data validation routines. Students should be able to use data validation techniques to write simple routines that check the validity of data being entered by a user. The following validation checks are examples of simple data validation routines: • checking if an entered string has a minimum length • checking if a string is empty • checking if data entered lies within a given range (eg between 1 and 10). Be able to write simple authentication routines. Students should be able to write a simple authentication routine that uses a username and password. Students will only be required to use plain text usernames and passwords (ie students will not need to encrypt the passwords). Understand what is meant by testing in the context of algorithms and programs. Be able to correct errors within algorithms and programs. Understand what test data is and describe the following types of test data: • normal (typical) • boundary (extreme) • erroneous data. Boundary data would be for example: If the allowed range is 1 to 10, then boundary data is 0, 1, 10, 11, ie either side of the allowed boundary. Be able to select and justify the choice of suitable test data for a given problem. Understand that there are different types of error: • syntax error • logic error. Be able to identify and categorise errors within algorithms and programs.`,
        '3.3': `Data representation - 
Number bases: Understand the following number bases: • decimal (base 10) • binary (base 2) • hexadecimal (base 16). Understand that computers use binary to represent all data and instructions. Students should be familiar with the idea that a bit pattern could represent different types of data including text, image, sound and integer. Explain why hexadecimal is often used in computer science. 
Converting between number bases: Understand how binary can be used to represent whole numbers. Students must be able to represent decimal values between 0 and 255 in binary. Understand how hexadecimal can be used to represent whole numbers. Students must be able to represent decimal values between 0 and 255 in hexadecimal. Be able to convert in both directions between: • binary and decimal • binary and hexadecimal • decimal and hexadecimal. The following equivalent maximum values will be used: • decimal: 255 • binary: 1111 1111 • hexadecimal: FF 
Units of information: Know that: • a bit is the fundamental unit of information • a byte is a group of 8 bits. A bit is either a 0 or a 1. • b represents bit • B represents byte 18 Visit aqa.org.uk/8525 for the most up-to-date specification, resources, support and administration Content Additional information Know that quantities of bytes can be described using prefixes. Know the names, symbols and corresponding values for the decimal prefixes: • kilo, 1 kB is 1,000 bytes • mega, 1 MB is 1,000 kilobytes • giga, 1 GB is 1,000 Megabytes • tera, 1 TB is 1,000 Gigabytes. Be able to compare quantities of bytes using the prefixes above. Students might benefit from knowing that historically the terms kilobyte, megabyte, etc have often been used to represent powers of 2. The International System of Units (SI units) kilo, mega and so forth refer to values based on powers of 10. When referring to powers of 2 the terms kibi, mebi and so forth would normally be used but students do not need to know these. 
Binary arithmetic: Be able to add together up to three binary numbers. Students will need to be able to add together up to three binary numbers using a maximum of 8 bits per number. Students will only be expected to add together a maximum of three 1s in a single column. Answers will be a maximum of 8 bits in length and will not involve carrying beyond the 8th bit. Be able to apply a binary shift to a binary number. Students will be expected to use a maximum of 8 bits. Students will be expected to understand and use only a logical binary shift. Students will not need to understand or use fractional representations. Describe situations where binary shifts can be used. Binary shifts can be used to perform simple multiplication/division by powers of 2. 
Character encoding: Understand what a character set is and be able to describe the following character encoding methods: • 7-bit ASCII • Unicode. Students should be able to use a given character encoding table to: • convert characters to character codes • convert character codes to characters. Content Additional information Understand that character codes are commonly grouped and run in sequence within encoding tables. Students should know that character codes are grouped and that they run in sequence. For example in ASCII ‘A’ is coded as 65, ‘B’ as 66, and so on, meaning that the codes for the other capital letters can be calculated once the code for ‘A’ is known. This pattern also applies to other groupings such as lower case letters and digits. Describe the purpose of Unicode and the advantages of Unicode over ASCII. Know that Unicode uses the same codes as ASCII up to 127. Students should be able to explain the need for data representation of different alphabets and of special symbols allowing a far greater range of characters. It is not necessary to be familiar with UTF-8, UTF-16 or other different versions of Unicode. 
Representing images: Understand what a pixel is and be able to describe how pixels relate to an image and the way images are displayed. Students should know that the term pixel is short for picture element. A pixel is a single point in an image. Describe the following for bitmaps: • image size • colour depth. Know that the size of a bitmap image is measured in pixels (width x height). The size of an image is expressed directly as width of image in pixels by height of image in pixels using the notation width x height. Colour depth is the number of bits used to represent each pixel. Describe how a bitmap represents an image using pixels and colour depth. Students should be able to explain how bitmaps are made from pixels. Describe using examples how the number of pixels and colour depth can affect the file size of a bitmap image. Students should be able to describe how higher numbers of pixels and higher colour depths can affect file size, and should also be able to use examples. Calculate bitmap image file sizes based on the number of pixels and colour depth. Students only need to use colour depth and number of pixels within their calculations. Size = (bits) = W x H x D Size = (bytes) = (W x H x D)/8 W = image width H = image height D = colour depth in bits. Convert binary data into a bitmap image. Given a binary pattern that represents a simple bitmap, students should be able to draw the resulting image as a series of pixels. Convert a bitmap image into binary data. Given a simple bitmap, students should be able to write down a bit pattern that represents the image. 
Representing sound: Understand that sound is analogue and that it must be converted to a digital form for storage and processing. Understand that analogue signals are sampled to create the digital version of sound. Students should understand that a sample is a measure of amplitude at a point in time. Describe the digital representation of sound in terms of: • sampling rate • sample resolution. Sampling rate is the number of samples taken in a second and is usually measured in hertz (1 hertz = 1 sample per second). Sample resolution is the number of bits per sample. Calculate sound file sizes based on the sampling rate and the sample resolution. File size (bits) = rate x res x secs rate = sampling rate res = sample resolution secs = number of seconds 
Data compression: Explain what data compression is. Understand why data may be compressed and that there are different ways to compress data. Students should understand that it is common for data to be compressed and should be able to explain why it may be necessary or desirable to compress data. Explain how data can be compressed using Huffman coding. Be able to interpret Huffman trees. Students should be familiar with the process of using a tree to represent the Huffman code. Content Additional information Be able to calculate the number of bits required to store a piece of data compressed using Huffman coding. Be able to calculate the number of bits required to store a piece of uncompressed data in ASCII. Students should be familiar with carrying out calculations to determine the number of bits saved by compressing a piece of data using Huffman coding. Explain how data can be compressed using run length encoding (RLE). Students should be familiar with the process of using frequency/data pairs to reduce the amount of data stored. Represent data in RLE frequency/data pairs. Students could be given a bitmap representation and they would be expected to show the frequency and value pairs for each row, eg 0000011100000011 would become 5 0 3 1 6 0 2 1.`,
        '3.4': `Computer systems - 
Hardware and software: Define the terms hardware and software and understand the relationship between them.
Boolean logic: Construct truth tables for the following logic gates: • NOT • AND • OR • XOR. Students do not need to know about or use NAND and NOR logic gates. Construct truth tables for simple logic circuits using combinations of NOT, AND, OR and XOR gates. Interpret the results of simple truth tables. Students should be able to construct truth tables which contain up to three inputs.  Create, modify and interpret simple logic circuit diagrams. Students will only need to use NOT, AND, OR and XOR gates within logic circuits. Students will be expected to understand and use the following logic circuit symbols: Students should be able to construct simple logic circuit diagrams which contain up to three inputs. Create and interpret simple Boolean expressions made up of NOT, AND, OR and XOR operations. Students will be expected to understand and use the following Boolean expression operators: . to represent the AND gate + to represent the OR gate ⊕ to represent the XOR gate Overbar to represent the NOT gate For example the expression (A AND B) OR (NOT C) would be represented as: A. B + C̅ Create the Boolean expression for a simple logic circuit. Create a logic circuit from a simple Boolean expression. 
3.4.3 Software classification Content Additional information Explain what is meant by: • system software • application software. Give examples of both types of software. Students should understand that: • system software manages the computer system resources and acts as a platform to run application software • application software is software that performs end-user tasks.  Content Additional information Understand the need for, and functions of, operating systems (OS) and utility programs. Understand that the OS handles management of the: • processor(s) • memory • input/output (I/O) devices • applications • security. 
Classification of programming languages and translators: Know that there are different levels of programming language: • low-level language • high-level language. Explain the main differences between low-level and high-level languages. Students should understand that most computer programs are written in high-level languages and be able to explain why this is the case. Know that machine code and assembly language are considered to be low-level languages and explain the differences between them. Students should be able to • understand that processors execute machine code and that each type of processor has its own specific machine code instruction set • understand that assembly language is often used to develop software for embedded systems and for controlling specific hardware components • understand that assembly language has a 1:1 correspondence with machine code. Understand that all programming code written in high-level or assembly languages must be translated. Understand that machine code is expressed in binary and is specific to a processor or family of processors. Understand the advantages and disadvantages of low-level language programming compared with high-level language programming.  Understand that there are three common types of program translator: • interpreter • compiler • assembler. Explain the main differences between these three types of translator. Understand when it would be appropriate to use each type of translator. Students will need to know that: • assemblers and compilers translate their input into machine code directly • each line of assembly language is assembled into a single machine code instruction • interpreters do not generate machine code directly (they call appropriate machine code subroutines within their own code to carry out statements). 
Systems architecture Content: Explain the role and operation of main memory and the following major components of a central processing unit (CPU): • arithmetic logic unit • control unit • clock • register • bus. A bus is a collection of wires through which data/signals are transmitted from one component to another. Knowledge of specific registers is not required. Explain the effect of the following on the performance of the CPU: • clock speed • number of processor cores • cache size. Understand and explain the Fetch-Execute cycle. The CPU continually reads instructions stored in main memory and executes them as required: • fetch: the next instruction is fetched to the CPU from main memory • decode: the instruction is decoded to work out what it is • execute: the instruction is executed (carried out). This may include reading/ writing from/to main memory. Understand the different types of memory within a computer: • RAM • ROM • Cache • Register. Know what the different types of memory are used for and why they are required. Understand the differences between main memory and secondary storage. Understand the differences between RAM and ROM. Students should be able to explain the terms volatile and non-volatile. Main memory will be considered to be any form of memory that is directly accessible by the CPU (except for cache and registers). Secondary storage is considered to be any nonvolatile storage mechanism not directly accessible by the CPU. Understand why secondary storage is required. Be aware of different types of secondary storage (solid state and magnetic). Explain the operation of solid state and magnetic storage. Discuss the advantages and disadvantages of solid state and magnetic storage. Students should be aware that SSDs use electrical circuits to persistently store data but will not need to know the precise details such as use of NAND gates. Explain the term cloud storage. Students should understand that cloud storage uses magnetic and/or solid state storage at a remote location. Explain the advantages and disadvantages of cloud storage when compared to local storage. Understand the term embedded system and explain how an embedded system differs from a non-embedded system. Students must be able to give examples of embedded and non-embedded systems.`,
        '3.5': `Computer networks - 
Network basics: Define what a computer network is. Discuss the advantages and disadvantages of computer networks. Describe the main types of computer network including: • Personal Area Network (PAN) • Local Area Network (LAN) • Wide Area Network (WAN). PAN – only Bluetooth needs to be considered. LAN – know that these usually cover relatively small geographical areas. LAN – know that these are often owned and controlled/managed by a single person or organisation. WAN – know that the Internet is the biggest example of a WAN. WAN – know that these usually cover a wide geographic area. WAN – know that these are often under collective or distributed ownership. Understand that networks can be wired or wireless. Discuss the advantages and disadvantages of wireless networks as opposed to wired networks. Students should know that wired networks can use different types of cable such as fibre and copper and when each would be appropriate. 
Protocols: Define the term network protocol. Explain the purpose of common network protocols including: • TCP (Transmission Control Protocol) • IP (Internet Protocol) • HTTP (Hypertext Transfer Protocol) • HTTPS (Hypertext Transfer Protocol Secure) • email protocols: • SMTP (Simple Mail Transfer Protocol) • IMAP (Internet Message Access Protocol). Students should know what each protocol is used for (eg HTTPS provides an encrypted version of HTTP for more secure web transactions). Understand the need for, and importance of, network security. Explain the following methods of network security: • authentication • encryption • firewall • MAC address filtering. Students should be able to explain, using examples, what each of these security methods is and when each could be used. Students should understand how these methods can work together to provide a greater level of security. The capabilities of firewalls have changed dramatically in recent years and will continue to do so. Students should be aware that a firewall is a network security device that monitors incoming and outgoing network traffic and decides whether to allow or block specific traffic based on a defined set of security rules. Students should understand that MAC address filtering allows devices to access, or be blocked from accessing a network based on their physical address embedded within the device’s network adapter. Describe the 4 layer TCP/IP model: • application layer • transport layer • internet layer • link layer. Understand that the HTTP, HTTPS, SMTP and IMAP protocols operate at the application layer. Understand that the TCP protocol operates at the transport layer. Understand that the IP protocol operates at the internet layer. Students should be able to name the layers and describe their main function(s) in a networking environment. Application layer: this is where the network applications, such as web browsers or email programs, operate. Transport layer: this layer sets up the communication between the two hosts and they agree settings such as the size of packets. Internet layer: addresses and packages data for transmission. Routes the packets across the network. Link layer: this is where the network hardware such as the NIC (network interface card) is located. OS device drivers also operate here.`,
        '3.6': `Cyber security - 
Fundamentals of cyber security: Be able to define the term cyber security and be able to describe the main purposes of cyber security. Students should know that cyber security consists of the processes, practices and technologies designed to protect networks, computers, programs and data from attack, damage or unauthorised access. 
Cyber security threats: Understand and be able to explain the following cyber security threats: • social engineering techniques • malicious code (malware) • pharming • weak and default passwords • misconfigured access rights • removable media • unpatched and/or outdated software. Pharming is a cyber attack intended to redirect a website's traffic to a fake website. Explain what penetration testing is and what it is used for. Penetration testing is the process of attempting to gain access to resources without knowledge of usernames, passwords and other normal means of access. Students should understand the following two types of penetration testing: • when the person or team testing the system has knowledge of and possibly basic credentials for the target system, simulating an attack from inside the system (a malicious insider) • when the person or team testing the system has no knowledge of any credentials for the target system, simulating an attack from outside the system (an external attack).
Social engineering: Define the term social engineering. Describe what social engineering is and how it can be protected against. Explain the following forms of social engineering: • blagging (pretexting) • phishing • shouldering (or shoulder surfing). Students should know that social engineering is the art of manipulating people so they give up confidential information. Blagging is the act of creating and using an invented scenario to engage a targeted victim in a manner that increases the chance the victim will divulge information or perform actions that would be unlikely in ordinary circumstances. Phishing is a technique of fraudulently obtaining private information, often using email or SMS. Shouldering is observing a person's private information over their shoulder eg cashpoint machine PIN numbers. 3.6.2.2 Malicious code (malware) Content Additional information Define the term malware. Describe what malware is and how it can be protected against. Describe the following forms of malware: • computer virus • trojan • spyware. Malware is an umbrella term used to refer to a variety of forms of hostile or intrusive software. 
Methods to detect and prevent cyber security threats: Understand and be able to explain the following security measures: • biometric measures (particularly for mobile devices) • password systems • CAPTCHA (or similar) • using email confirmations to confirm a user’s identity • automatic software updates.
`,
        '3.7': `Databases - 
Relational databases: Explain the concept of a database. Explain the concept of a relational database. Understand the following database concepts: • table • record • field • data type • primary key • foreign key. Understand that the use of a relational database facilitates the elimination of data inconsistency and data redundancy. Note that whilst the terms entity, attribute and entity identifier are more commonly used when an abstract model of a database is being considered, the terms given here will be used for both implementations of and abstract models of databases. 
Structured query language (SQL): Be able to use SQL to retrieve data from a relational database, using the commands: • SELECT • FROM • WHERE • ORDER BY…ASC | DESC Exam questions will require that data is extracted from no more than two tables for any one query. Be able to use SQL to insert data into a relational database using the commands. INSERT INTO table_name (column1, column 2 …) VALUES (value1, value2 …) Be able to use SQL to edit and delete data in a database using the commands. UPDATE table_name SET column1 = value1, column2 = value2 ... WHERE condition DELETE FROM table_name WHERE`,
        '3.8': `Impacts of technology:
Ethical, legal and environmental impacts of digital technology on wider society, including issues of privacy: Explain the current ethical, legal and environmental impacts and risks of digital technology on society. Where data privacy issues arise these should be considered. Exam questions will be taken from the following areas: • cyber security • mobile technologies • wireless networking • cloud storage • hacking (unauthorised access to a computer system) • wearable technologies • computer based implants • autonomous vehicles. Students will be expected to understand and explain the general principles behind the issues rather than have detailed knowledge on specific issues. Students should be aware that ordinary citizens normally value their privacy and may not like it when governments or security services have too much access. Students should be aware that governments and security services often argue that they cannot keep their citizens safe from terrorism and other attacks unless they have access to private data.`
    };
    return topics[unit] || 'General Computer Science topics';
}
