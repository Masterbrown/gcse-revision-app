you just got the following error in Windsurf - ErrorServer encountered error of type: resource_exhausted. Please try again later.

Do you remember what you were doing?

# GCSE Computer Science Revision App

This is a mobile-friendly web application designed to help students revise for their AQA GCSE Computer Science (8525) examination using AI-powered questions and feedback.

## Features

- Generates questions based on the AQA GCSE Computer Science specification
- Provides immediate feedback on student answers
- Mobile-responsive design
- Interactive user interface

## Setup

1. Install Node.js from [nodejs.org](https://nodejs.org/) if you haven't already
2. Clone or download this repository
3. Open a terminal in the project directory
4. Install dependencies:
   ```bash
   npm install
   ```
5. Create a `.env` file in the root directory:
   - Copy `sample.env` to `.env`
   - Replace `your_api_key_here` with your OpenAI API key
6. Start the server:
   ```bash
   npm start
   ```
7. Open your browser and navigate to `http://localhost:3000`

## How to Use

1. The app will automatically generate a Computer Science question
2. Type your answer in the text area provided
3. Click "Submit Answer" to receive feedback
4. Review the feedback which includes:
   - Correctness of your answer
   - Good aspects of your response
   - Areas for improvement
   - The correct answer or important points
5. Click "Next Question" to continue practicing

## Technical Requirements

- Node.js 14.x or higher
- A modern web browser (Chrome, Firefox, Safari, or Edge)
- An active internet connection
- An OpenAI API key

## Security Note

Your OpenAI API key is stored in the `.env` file and is only used server-side. Never commit your `.env` file to version control.

## Support

If you encounter any issues or have questions, please open an issue in this repository.
