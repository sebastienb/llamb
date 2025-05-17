import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { fetchJinaReader, setJinaReaderApiKey, getJinaReaderApiKey } from '../services/jinaReader.js';

/**
 * Register Jina Reader related commands with the CLI
 * @param program Commander program instance
 */
export function registerJinaReaderCommands(program: Command): void {
  // jina:apikey command
  program
    .command('jina:apikey')
    .alias('jina apikey')
    .description('Set or update the Jina Reader API key')
    .option('--key <key>', 'API key to set')
    .action(async (options) => {
      try {
        // If key is provided directly, use it; otherwise prompt
        if (options.key) {
          // Non-interactive update
          setJinaReaderApiKey(options.key);
          console.log(chalk.green('✓ Jina Reader API key updated successfully'));
        } else {
          // Interactive update
          const answers = await inquirer.prompt([
            {
              type: 'password',
              name: 'apiKey',
              message: 'Enter Jina Reader API key:',
              validate: (input) => input.trim() !== '' ? true : 'API key cannot be empty'
            }
          ]);

          setJinaReaderApiKey(answers.apiKey);
          console.log(chalk.green('✓ Jina Reader API key updated successfully'));
        }
      } catch (error: any) {
        console.error(chalk.red('Error updating Jina Reader API key:'), error.message);
      }
    });

  // jina:test command
  program
    .command('jina:test')
    .alias('jina test')
    .description('Test the Jina Reader API with a URL')
    .argument('<url>', 'URL to test with Jina Reader')
    .action(async (url) => {
      try {
        console.log(chalk.dim(`Testing Jina Reader with URL: ${url}`));
        
        // Check if API key is configured
        const apiKey = getJinaReaderApiKey();
        if (!apiKey) {
          console.log(chalk.yellow('No Jina Reader API key configured. Requests will be made without authentication.'));
          console.log(chalk.cyan('To set an API key, run:'));
          console.log(chalk.bold('  llamb jina:apikey'));
        } else {
          console.log(chalk.green('✓ Jina Reader API key is configured'));
        }
        
        // Fetch content using Jina Reader
        console.log(chalk.dim('Fetching content...'));
        const content = await fetchJinaReader(url);
        
        // Display a preview of the content
        console.log(chalk.green(`✓ Content fetched successfully (${(content.length / 1024).toFixed(1)} KB)`));
        console.log(chalk.cyan('\nContent Preview:'));
        console.log(chalk.dim('─'.repeat(50)));
        console.log(content.slice(0, 500) + (content.length > 500 ? '...' : ''));
        console.log(chalk.dim('─'.repeat(50)));
        console.log(chalk.cyan(`\nTo use this content with llamb, run:`));
        console.log(chalk.bold(`  llamb -j ${url} "Your question about the content"`));
      } catch (error: any) {
        console.error(chalk.red('Error testing Jina Reader:'), error.message);
      }
    });
}