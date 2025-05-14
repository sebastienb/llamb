import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import boxen from 'boxen';
import wrap from 'word-wrap';

import { PromptManager } from '../services/promptManager.js';

/**
 * Open the user's preferred editor to edit a file
 * @param filePath - The file to edit
 * @returns A promise that resolves when the editor is closed
 */
async function openInEditor(filePath: string): Promise<void> {
  // Determine the preferred editor
  const editor = process.env.EDITOR || process.env.VISUAL || 
    (os.platform() === 'win32' ? 'notepad' : 'nano');
  
  try {
    // Launch the editor in a synchronous process
    console.log(chalk.dim(`Opening ${filePath} with ${editor}...`));
    execSync(`${editor} "${filePath}"`, { stdio: 'inherit' });
    console.log(chalk.green(`Saved changes to ${filePath}`));
  } catch (error: any) {
    console.error(chalk.red(`Error opening editor: ${error.message}`));
    throw new Error('Failed to open editor');
  }
}

/**
 * List all available prompts
 */
export async function listPrompts() {
  try {
    const promptManager = PromptManager.getInstance();
    const prompts = promptManager.listPrompts();
    
    if (prompts.length === 0) {
      console.log(chalk.yellow('No prompts found.'));
      console.log(chalk.cyan('To add a prompt, run: ') + chalk.bold('llamb prompt add <name>'));
      return;
    }
    
    console.log(chalk.bold('\nAvailable Prompts:'));
    
    // Table headers
    console.log(chalk.dim('┌─────────────────────┬─────────────────────┬─────────────────────┐'));
    console.log(chalk.dim('│ ') + chalk.bold('Name'.padEnd(20)) + chalk.dim(' │ ') + 
                chalk.bold('Created'.padEnd(20)) + chalk.dim(' │ ') + 
                chalk.bold('Updated'.padEnd(20)) + chalk.dim(' │'));
    console.log(chalk.dim('├─────────────────────┼─────────────────────┼─────────────────────┤'));
    
    // Table rows
    prompts.forEach((prompt: any) => {
      const created = new Date(prompt.createdAt).toLocaleString();
      const updated = new Date(prompt.updatedAt).toLocaleString();
      console.log(chalk.dim('│ ') + prompt.name.padEnd(20) + chalk.dim(' │ ') + 
                  chalk.dim(created.padEnd(20)) + chalk.dim(' │ ') + 
                  chalk.dim(updated.padEnd(20)) + chalk.dim(' │'));
    });
    
    console.log(chalk.dim('└─────────────────────┴─────────────────────┴─────────────────────┘'));
    
    // Usage information
    console.log('\n' + chalk.cyan('Usage:'));
    console.log(`  ${chalk.bold('llamb -t <prompt-name>')}             Run a prompt`);
    console.log(`  ${chalk.bold('llamb prompt edit <prompt-name>')}    Edit a prompt`);
    console.log(`  ${chalk.bold('llamb prompt delete <prompt-name>')}  Delete a prompt\n`);
  } catch (error: any) {
    console.error(chalk.red(`Error listing prompts: ${error.message}`));
  }
}

/**
 * Add a new prompt
 * @param promptName - Name of the prompt to add
 */
export async function addPrompt(promptName?: string) {
  try {
    const promptManager = PromptManager.getInstance();
    
    // If no prompt name was provided, ask for one
    if (!promptName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'promptName',
          message: 'Enter a name for the new prompt:',
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'Prompt name cannot be empty';
            }
            
            if (promptManager.promptExists(input)) {
              return `Prompt "${input}" already exists. Use "llamb prompt edit ${input}" to modify it.`;
            }
            
            return true;
          }
        }
      ]);
      
      promptName = answers.promptName;
    } else if (promptManager.promptExists(promptName)) {
      console.error(chalk.red(`Prompt "${promptName}" already exists. Use "llamb prompt edit ${promptName}" to modify it.`));
      return;
    }
    
    // Create a template prompt content
    const templateContent = `# ${promptName}
# This is a llamb prompt template. 
# Lines starting with # are comments and will be ignored.
# You can use {input} and {output} placeholders that will be replaced at runtime.

Please analyze the following content:

{input}

Provide a clear and concise summary.
`;
    
    // Get the file path for the new prompt
    const promptsDir = path.join(os.homedir(), '.llamb', 'prompts');
    const promptPath = path.join(promptsDir, `${promptName?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unnamed'}.txt`);
    
    // Create the prompt file
    if (promptName) {
      promptManager.createPrompt(promptName, templateContent);
    } else {
      throw new Error("Prompt name is required");
    }
    
    console.log(chalk.green(`Prompt "${promptName}" created.`));
    
    // Ask if user wants to edit the prompt now
    const { shouldEdit } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldEdit',
        message: 'Would you like to edit the prompt now?',
        default: true
      }
    ]);
    
    if (shouldEdit) {
      await openInEditor(promptPath);
    } else {
      console.log(chalk.cyan(`You can edit this prompt later with: llamb prompt edit ${promptName}`));
    }
    
    // Show usage example
    console.log(chalk.green('\nUsage example:'));
    console.log(chalk.cyan(`  llamb -t ${promptName} -f input.txt -o output.md`));
  } catch (error: any) {
    console.error(chalk.red(`Error adding prompt: ${error.message}`));
  }
}

/**
 * Edit an existing prompt
 * @param promptName - Name of the prompt to edit
 */
export async function editPrompt(promptName?: string) {
  try {
    const promptManager = PromptManager.getInstance();
    
    // If no prompt name was provided, ask for one
    if (!promptName) {
      const prompts = promptManager.listPrompts();
      
      if (prompts.length === 0) {
        console.log(chalk.yellow('No prompts found.'));
        console.log(chalk.cyan('To add a prompt, run: ') + chalk.bold('llamb prompt add <name>'));
        return;
      }
      
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'promptName',
          message: 'Select a prompt to edit:',
          choices: prompts.map((p: any) => p.name)
        }
      ]);
      
      promptName = answers.promptName;
    } else if (!promptManager.promptExists(promptName)) {
      console.error(chalk.red(`Prompt "${promptName}" does not exist. Use "llamb prompt add ${promptName}" to create it.`));
      return;
    }
    
    // Get the file path for the prompt
    const promptsDir = path.join(os.homedir(), '.llamb', 'prompts');
    const promptPath = path.join(promptsDir, `${promptName?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unnamed'}.txt`);
    
    // Open the prompt in the editor
    await openInEditor(promptPath);
    
    console.log(chalk.green(`Prompt "${promptName}" has been updated.`));
    
    // Show usage example
    console.log(chalk.green('\nUsage example:'));
    console.log(chalk.cyan(`  llamb -t ${promptName} -f input.txt -o output.md`));
  } catch (error: any) {
    console.error(chalk.red(`Error editing prompt: ${error.message}`));
  }
}

/**
 * Delete a prompt
 * @param promptName - Name of the prompt to delete
 * @param force - Whether to delete without confirmation
 */
export async function deletePrompt(promptName?: string, force: boolean = false) {
  try {
    const promptManager = PromptManager.getInstance();
    
    // If no prompt name was provided, ask for one
    if (!promptName) {
      const prompts = promptManager.listPrompts();
      
      if (prompts.length === 0) {
        console.log(chalk.yellow('No prompts found.'));
        return;
      }
      
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'promptName',
          message: 'Select a prompt to delete:',
          choices: prompts.map((p: any) => p.name)
        }
      ]);
      
      promptName = answers.promptName;
    } else if (!promptManager.promptExists(promptName)) {
      console.error(chalk.red(`Prompt "${promptName}" does not exist.`));
      return;
    }
    
    // Confirm deletion unless forced
    if (!force) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmDelete',
          message: `Are you sure you want to delete the prompt "${promptName}"?`,
          default: false
        }
      ]);
      
      if (!answers.confirmDelete) {
        console.log(chalk.yellow('Deletion cancelled.'));
        return;
      }
    }
    
    // Delete the prompt
    if (promptName) {
      promptManager.deletePrompt(promptName);
    } else {
      throw new Error("Prompt name is required");
    }
    
    console.log(chalk.green(`Prompt "${promptName}" has been deleted.`));
  } catch (error: any) {
    console.error(chalk.red(`Error deleting prompt: ${error.message}`));
  }
}

/**
 * Show a specific prompt
 * @param promptName - Name of the prompt to show
 */
export async function showPrompt(promptName?: string) {
  try {
    const promptManager = PromptManager.getInstance();
    
    // If no prompt name was provided, ask for one
    if (!promptName) {
      const prompts = promptManager.listPrompts();
      
      if (prompts.length === 0) {
        console.log(chalk.yellow('No prompts found.'));
        return;
      }
      
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'promptName',
          message: 'Select a prompt to show:',
          choices: prompts.map((p: any) => p.name)
        }
      ]);
      
      promptName = answers.promptName;
    } else if (!promptManager.promptExists(promptName)) {
      console.error(chalk.red(`Prompt "${promptName}" does not exist.`));
      return;
    }
    
    // Get the prompt content
    if (!promptName) {
      throw new Error("Prompt name is required");
    }
    const promptContent = promptManager.getPrompt(promptName);
    
    // Display the prompt
    console.log(chalk.bold(`\nPrompt: ${promptName}\n`));
    
    // Get terminal width for the output box
    const terminalWidth = process.stdout.columns || 80;
    const maxWidth = Math.min(terminalWidth - 10, 100);
    
    // Create a boxed display
    const boxedContent = boxen(
      promptContent
        .replace(/^#.*$/gm, (line: string) => chalk.dim(line)) // Dim comments
        .replace(/\{input\}/g, chalk.cyan('{input}')) // Highlight placeholders
        .replace(/\{output\}/g, chalk.cyan('{output}')),
      {
        padding: 1,
        borderColor: 'blue',
        borderStyle: 'round',
        width: maxWidth
      }
    );
    
    console.log(boxedContent);
    
    // Show usage example
    console.log(chalk.green('\nUsage example:'));
    console.log(chalk.cyan(`  llamb -t ${promptName} -f input.txt -o output.md`));
  } catch (error: any) {
    console.error(chalk.red(`Error showing prompt: ${error.message}`));
  }
}