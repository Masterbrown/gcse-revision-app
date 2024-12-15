/**
 * Question Format Schema
 * Defines the structure for GCSE Computer Science questions
 */

const QuestionSchema = {
    // Main question object
    question: {
        id: String,                // Unique identifier (e.g., "1", "2a")
        unit: String,              // Unit reference (e.g., "3.1", "3.2")
        type: {
            type: String,
            enum: ['single', 'multi-part', 'multiple-choice']
        },
        
        // Main context that applies to multiple parts
        context: {
            text: String,          // Context description
            applies_to: [String],  // List of part IDs this context applies to
            references: [{
                type: String,      // Type of reference (table, code, diagram)
                content: String    // The actual reference content
            }]
        },
        
        // Individual question parts
        parts: [{
            id: String,           // Part identifier (e.g., "a", "b")
            text: String,         // The actual question text
            marks: Number,        // Number of marks for this part
            type: {
                type: String,
                enum: [
                    'written',
                    'multiple-choice',
                    'code',
                    'calculation',
                    'table-completion'
                ]
            },
            requires_context: Boolean,  // Whether this part needs the main context
            options: [String],          // For multiple-choice questions
            expected_answer: String,    // Expected format or type of answer
            mark_scheme: {
                points: [String],       // Individual mark scheme points
                total_marks: Number     // Total marks available
            }
        }],
        
        // Additional information that might be needed
        supplementary: [{
            type: {
                type: String,
                enum: [
                    'code_reference',
                    'table_reference',
                    'formula_reference',
                    'diagram_reference'
                ]
            },
            content: String,           // The supplementary content
            applies_to: [String]       // Part IDs this applies to
        }]
    }
};

// Example of a well-structured question
const ExampleQuestion = {
    id: "1",
    unit: "3.1",
    type: "multi-part",
    context: {
        text: "A developer is creating a dog walking booking system.",
        applies_to: ["a", "b"],
        references: []
    },
    parts: [
        {
            id: "a",
            text: "The developer needs to remove all unnecessary detail from the client's request. Which process is this?",
            marks: 1,
            type: "multiple-choice",
            requires_context: true,
            options: ["Abstraction", "Conversion", "Decomposition", "Validation"],
            expected_answer: "Single option selection",
            mark_scheme: {
                points: ["Abstraction"],
                total_marks: 1
            }
        },
        {
            id: "b",
            text: "The developer has noted: 'The charge is based on time and not how many dogs are walked. The charge is £10 every 30 minutes.' State two other relevant details that should be considered.",
            marks: 2,
            type: "written",
            requires_context: true,
            expected_answer: "Two distinct points",
            mark_scheme: {
                points: [
                    "Maximum number of dogs per walk",
                    "Cancellation policy",
                    "Payment method/timing",
                    "Walking location restrictions"
                ],
                total_marks: 2
            }
        }
    ],
    supplementary: []
};

module.exports = {
    QuestionSchema,
    ExampleQuestion
};
