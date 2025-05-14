import { Command } from 'commander';
import { listPrompts, addPrompt, editPrompt, deletePrompt, showPrompt } from './promptCommands.js';

/**
 * Register prompt-related commands with the CLI
 * @param program - The Commander program instance
 */
export function registerPromptCommands(program: Command): void {
  // Prompt list command
  program
    .command('prompt:list')
    .alias('prompt list')
    .description('List all available prompts')
    .action(() => {
      listPrompts();
    });

  // Prompt add command
  program
    .command('prompt:add [name]')
    .alias('prompt add')
    .description('Create a new prompt')
    .action((name) => {
      addPrompt(name);
    });

  // Prompt edit command
  program
    .command('prompt:edit [name]')
    .alias('prompt edit')
    .description('Edit an existing prompt')
    .action((name) => {
      editPrompt(name);
    });

  // Prompt delete command
  program
    .command('prompt:delete [name]')
    .alias('prompt delete')
    .description('Delete a prompt')
    .option('--force', 'Delete without confirmation')
    .action((name, options) => {
      deletePrompt(name, options.force);
    });

  // Prompt show command
  program
    .command('prompt:show [name]')
    .alias('prompt show')
    .description('Display a prompt\'s content')
    .action((name) => {
      showPrompt(name);
    });
}