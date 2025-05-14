import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileExists, readFile, writeFile } from '../utils/fileUtils.js';

/**
 * Interface representing a prompt
 */
export interface Prompt {
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Class for managing user prompts
 */
export class PromptManager {
  private static instance: PromptManager;
  private promptsDir: string;

  private constructor() {
    // Set up prompts directory
    this.promptsDir = path.join(os.homedir(), '.llamb', 'prompts');
    this.ensurePromptsDirExists();
  }

  /**
   * Get the singleton instance of PromptManager
   */
  public static getInstance(): PromptManager {
    if (!PromptManager.instance) {
      PromptManager.instance = new PromptManager();
    }
    return PromptManager.instance;
  }

  /**
   * Ensure the prompts directory exists
   */
  private ensurePromptsDirExists(): void {
    if (!fs.existsSync(this.promptsDir)) {
      fs.mkdirSync(this.promptsDir, { recursive: true });
    }
  }

  /**
   * Get the file path for a prompt
   */
  private getPromptFilePath(promptName: string): string {
    // Sanitize the prompt name to be safe for filenames
    const sanitizedName = promptName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.promptsDir, `${sanitizedName}.txt`);
  }

  /**
   * List all available prompts
   */
  public listPrompts(): Prompt[] {
    this.ensurePromptsDirExists();
    
    try {
      const files = fs.readdirSync(this.promptsDir);
      const prompts: Prompt[] = [];
      
      for (const file of files) {
        if (file.endsWith('.txt')) {
          const promptName = path.basename(file, '.txt');
          const promptPath = path.join(this.promptsDir, file);
          const stats = fs.statSync(promptPath);
          
          prompts.push({
            name: promptName,
            content: this.getPrompt(promptName),
            createdAt: stats.birthtime.toISOString(),
            updatedAt: stats.mtime.toISOString()
          });
        }
      }
      
      return prompts;
    } catch (error: any) {
      throw new Error(`Failed to list prompts: ${error.message}`);
    }
  }

  /**
   * Get a specific prompt by name
   */
  public getPrompt(promptName: string): string {
    const promptPath = this.getPromptFilePath(promptName);
    
    try {
      if (!fileExists(promptPath)) {
        throw new Error(`Prompt "${promptName}" does not exist`);
      }
      
      return readFile(promptPath);
    } catch (error: any) {
      throw new Error(`Failed to get prompt "${promptName}": ${error.message}`);
    }
  }

  /**
   * Check if a prompt exists
   */
  public promptExists(promptName: string): boolean {
    const promptPath = this.getPromptFilePath(promptName);
    return fileExists(promptPath);
  }

  /**
   * Create a new prompt
   */
  public createPrompt(promptName: string, content: string): void {
    const promptPath = this.getPromptFilePath(promptName);
    
    try {
      if (fileExists(promptPath)) {
        throw new Error(`Prompt "${promptName}" already exists. Use updatePrompt to modify it.`);
      }
      
      writeFile(promptPath, content);
    } catch (error: any) {
      throw new Error(`Failed to create prompt "${promptName}": ${error.message}`);
    }
  }

  /**
   * Update an existing prompt
   */
  public updatePrompt(promptName: string, content: string): void {
    const promptPath = this.getPromptFilePath(promptName);
    
    try {
      if (!fileExists(promptPath)) {
        throw new Error(`Prompt "${promptName}" does not exist. Use createPrompt to create it.`);
      }
      
      writeFile(promptPath, content, true);
    } catch (error: any) {
      throw new Error(`Failed to update prompt "${promptName}": ${error.message}`);
    }
  }

  /**
   * Delete a prompt
   */
  public deletePrompt(promptName: string): void {
    const promptPath = this.getPromptFilePath(promptName);
    
    try {
      if (!fileExists(promptPath)) {
        throw new Error(`Prompt "${promptName}" does not exist`);
      }
      
      fs.unlinkSync(promptPath);
    } catch (error: any) {
      throw new Error(`Failed to delete prompt "${promptName}": ${error.message}`);
    }
  }

  /**
   * Process a prompt, replacing placeholders with actual values
   */
  public processPrompt(promptName: string, inputFile?: string, outputFile?: string): string {
    const promptContent = this.getPrompt(promptName);
    
    let processedPrompt = promptContent;
    
    // Replace input placeholder if input file is provided
    if (inputFile) {
      let inputContent = '';
      try {
        inputContent = readFile(inputFile);
      } catch (error: any) {
        throw new Error(`Failed to read input file "${inputFile}": ${error.message}`);
      }
      
      processedPrompt = processedPrompt.replace(/\{input\}/g, inputContent);
    }
    
    // Replace output placeholder with the output file path
    if (outputFile) {
      processedPrompt = processedPrompt.replace(/\{output\}/g, outputFile);
    }
    
    return processedPrompt;
  }
}