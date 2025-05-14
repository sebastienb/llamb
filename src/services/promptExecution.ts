import chalk from 'chalk';
import { PromptManager } from './promptManager.js';
import { readFile, fileExists } from '../utils/fileUtils.js';

/**
 * Process a prompt with input and output placeholders
 * @param promptName - Name of the prompt to process
 * @param inputFilePath - Optional path to an input file
 * @param outputFilePath - Optional path to an output file
 * @returns The processed prompt text
 */
export function processPrompt(promptName: string, inputFilePath?: string, outputFilePath?: string): string {
  try {
    const promptManager = PromptManager.getInstance();
    
    // Check if the prompt exists
    if (!promptManager.promptExists(promptName)) {
      throw new Error(`Prompt "${promptName}" does not exist. Use "llamb prompt list" to see available prompts.`);
    }
    
    // Check if input file exists
    if (inputFilePath && !fileExists(inputFilePath)) {
      throw new Error(`Input file does not exist: ${inputFilePath}`);
    }
    
    // Process the prompt
    return promptManager.processPrompt(promptName, inputFilePath, outputFilePath);
  } catch (error: any) {
    throw new Error(`Error processing prompt: ${error.message}`);
  }
}

/**
 * Extract user instructions from prompt content
 * @param promptContent - The full prompt content including comments
 * @returns The processed prompt with comments removed
 */
export function processPromptContent(promptContent: string): string {
  // Remove comment lines (lines starting with #)
  return promptContent
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')
    .trim();
}

/**
 * Format a question with prompt content
 * @param originalQuestion - The original question from the user
 * @param promptContent - The processed prompt content
 * @returns The combined question for the LLM
 */
export function formatQuestionWithPrompt(originalQuestion: string, promptContent: string): string {
  // If the original question is empty, just use the prompt content
  if (!originalQuestion || originalQuestion.trim() === '') {
    return promptContent;
  }
  
  // Otherwise, append the original question to the prompt content
  return `${promptContent}\n\n${originalQuestion}`;
}