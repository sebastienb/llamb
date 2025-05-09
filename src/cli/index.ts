#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import OpenAI from 'openai';
import boxen from 'boxen';
import wrap from 'word-wrap';
import terminalLink from 'terminal-link';
import ora from 'ora';
import { marked } from 'marked';
//@ts-ignore
import TerminalRenderer from 'marked-terminal';
import hljs from 'highlight.js';
import { askQuestion, getModels, getProviders, getDefaultProvider, addProvider, setDefaultProvider } from '../services/llm.js';
import { KeyManager } from '../utils/keyManager.js';

// Check for required system dependencies
function checkDependencies() {
  const { hasRequiredDeps, installCommand } = KeyManager.checkDependencies();
  if (!hasRequiredDeps) {
    console.error(chalk.red('Error: Missing system dependencies required for secure credential storage.'));
    console.error(chalk.yellow('To fix this issue, please install the required dependencies:'));
    console.error(chalk.cyan(installCommand));
    console.error(chalk.yellow('After installing dependencies, run: npm rebuild keytar'));
    console.error('');
    console.error(chalk.dim('You can still use local providers that don\'t require authentication.'));
    console.error('');
  }
  return hasRequiredDeps;
}

// Set up Terminal Renderer for markdown
// Need to use ts-ignore since the types for marked-terminal are problematic
//@ts-ignore
marked.setOptions({ renderer: new TerminalRenderer() });

const program = new Command();

// Check for dependencies on startup, but don't block operation
// This provides an early warning to users
checkDependencies();

program
  .name('llamb')
  .description('CLI LLM client that answers questions directly from your terminal')
  .version('1.0.0');

program
  .arguments('[question...]')
  .description('Ask a question to the LLM')
  .option('-m, --model <model>', 'Specify the model to use')
  .option('-p, --provider <provider>', 'Specify the provider to use')
  .option('-u, --baseUrl <baseUrl>', 'Specify a custom base URL for this request')
  .action(async (args, options) => {
    try {
      if (args.length === 0) {
        console.log(chalk.yellow('No question provided. Use --help for usage information.'));
        return;
      }

      const question = args.join(' ');
      console.log(chalk.dim('Asking: ') + question);
      
      // Custom spinner with lamb emojis
      const lambEmojis = ['🐑', '🐑 🐑', '🐑 🐑 🐑', '🐑 🐑', '🐑'];
      const spinner = ora({
        text: chalk.dim('Thinking...'),
        spinner: {
          frames: lambEmojis,
          interval: 300
        },
        color: 'yellow'
      }).start();
      
      const answer = await askQuestion(question, options.model, options.provider, options.baseUrl);
      
      // Stop the spinner
      spinner.stop();
      
      // Get terminal width
      const terminalWidth = process.stdout.columns || 80;
      const maxWidth = Math.min(terminalWidth - 10, 100); // Account for padding and max reasonable width
      
      // Make sure answer is a string before parsing markdown
      const answerText = typeof answer === 'string' ? answer : String(answer);
      
      // Parse markdown and apply syntax highlighting
      // Need to cast result to string since marked types are problematic
      //@ts-ignore
      const parsedMarkdown = marked(answerText) as string;
      
      // Create a styled box for the answer
      const boxedAnswer = boxen(parsedMarkdown, {
        padding: 1,
        borderColor: 'green',
        borderStyle: 'round',
        title: 'LLaMB',
        titleAlignment: 'center',
        width: maxWidth,
      });
      
      console.log(boxedAnswer);
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('providers')
  .description('List configured LLM providers')
  .action(async () => {
    try {
      const providers = getProviders();
      const defaultProvider = getDefaultProvider();
      
      console.log(chalk.bold('Configured Providers:'));
      
      // Check for stored API keys
      for (const provider of providers) {
        const isDefault = provider.name === defaultProvider;
        const hasApiKey = provider.noAuth ? null : await KeyManager.getApiKey(provider.name);
        
        let providerInfo = `${isDefault ? chalk.green('* ') : '  '}${chalk.bold(provider.name)} - ${provider.baseUrl} ${chalk.dim(`(default model: ${provider.defaultModel})`)}`;
        
        // Add API key status
        if (provider.noAuth) {
          providerInfo += ' ' + chalk.dim('(no auth required)');
        } else if (hasApiKey) {
          providerInfo += ' ' + chalk.green('(API key: ✓)');
        } else {
          providerInfo += ' ' + chalk.yellow('(API key: ✗)');
        }
        
        console.log(providerInfo);
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Define common providers with their default settings
const commonProviders = [
  { 
    name: 'OpenAI', 
    value: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    defaultModel: 'gpt-3.5-turbo'
  },
  { 
    name: 'Anthropic', 
    value: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
    defaultModel: 'claude-3-sonnet-20240229'
  },
  { 
    name: 'Mistral AI', 
    value: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    requiresApiKey: true,
    defaultModel: 'mistral-medium'
  },
  { 
    name: 'OpenRouter', 
    value: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    defaultModel: ''
  },
  { 
    name: 'Ollama (local)', 
    value: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    defaultModel: 'llama2'
  },
  { 
    name: 'LM Studio (local)', 
    value: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    requiresApiKey: false,
    defaultModel: ''
  },
  { 
    name: 'Other/Custom', 
    value: 'custom',
    baseUrl: '',
    requiresApiKey: false,
    defaultModel: ''
  }
];

program
  .command('provider:add')
  .description('Add or update a provider configuration')
  .action(async () => {
    try {
      // Check dependencies at the beginning
      const depsOk = checkDependencies();
      // First select from common providers or custom
      const providerSelection = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select LLM provider:',
          choices: commonProviders.map(p => ({ name: p.name, value: p.value })),
        }
      ]);
      
      const selectedProvider = commonProviders.find(p => p.value === providerSelection.provider);
      
      // Then collect provider details, with pre-filled defaults
      const providerInfo = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Provider name:',
          default: selectedProvider?.value || '',
          validate: (input) => input.length > 0 ? true : 'Name cannot be empty',
        },
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Base URL:',
          default: selectedProvider?.baseUrl || '',
          validate: (input) => input.length > 0 ? true : 'Base URL cannot be empty',
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'API Key' + (selectedProvider?.requiresApiKey ? '' : ' (can be left blank for local LLM servers)') + ':',
          default: '',
          validate: (input) => selectedProvider?.requiresApiKey && input.length === 0 ? 'API Key is required for this provider' : true,
        }
      ]);
      
      // Try to fetch available models
      console.log(chalk.dim('Fetching available models...'));
      
      let availableModels: string[] = [];
      
      try {
        // Create temporary OpenAI client to fetch models
        const openai = new OpenAI({
          apiKey: providerInfo.apiKey || 'dummy-key',
          baseURL: providerInfo.baseUrl,
        });
        
        const models = await openai.models.list();
        availableModels = models.data.map(model => model.id);
        
        if (availableModels.length > 0) {
          console.log(chalk.green(`Found ${availableModels.length} available models!`));
        }
      } catch (error) {
        console.log(chalk.yellow('Could not fetch models. You will need to enter the model name manually.'));
      }
      
      // Now prompt for model selection
      let defaultModelAnswer: { defaultModel: string };
      
      if (availableModels.length > 0) {
        defaultModelAnswer = await inquirer.prompt({
          type: 'list',
          name: 'defaultModel',
          message: 'Select default model:',
          choices: availableModels,
        });
      } else {
        defaultModelAnswer = await inquirer.prompt({
          type: 'input',
          name: 'defaultModel',
          message: 'Default model:',
          default: selectedProvider?.defaultModel || '',
          validate: (input: string) => input.length > 0 ? true : 'Default model cannot be empty',
        });
      }
      
      // For local providers, mark them as noAuth
      const isLocalProvider = !providerInfo.apiKey && 
        (selectedProvider?.value === 'ollama' || 
         selectedProvider?.value === 'lmstudio' || 
         providerInfo.baseUrl.includes('localhost') || 
         providerInfo.baseUrl.includes('127.0.0.1'));
      
      const answers = { 
        name: providerInfo.name, 
        baseUrl: providerInfo.baseUrl, 
        apiKey: providerInfo.apiKey,
        defaultModel: defaultModelAnswer.defaultModel,
        noAuth: isLocalProvider
      };
      
      // Store provider info and API key securely
      try {
        await addProvider(answers);
        
        console.log(chalk.green(`Provider '${answers.name}' added/updated successfully`));
        if (answers.apiKey) {
          console.log(chalk.green('API key has been stored securely in your system keychain'));
        }
      } catch (error: any) {
        if (error.message.includes('Missing system dependencies')) {
          // The detailed error message is already printed by the KeyManager
          console.log(chalk.yellow('Provider configuration saved but API key storage failed.'));
          console.log(chalk.yellow('Please install the required dependencies and try again.'));
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('provider:apikey')
  .description('Update API key for a provider')
  .action(async () => {
    try {
      // Check dependencies at the beginning
      const depsOk = checkDependencies();
      if (!depsOk) {
        console.error(chalk.yellow('Cannot proceed with API key operations until dependencies are installed.'));
        console.error(chalk.yellow('Please install the required dependencies and try again.'));
        return;
      }
      const providers = getProviders();
      if (providers.length === 0) {
        console.log(chalk.yellow('No providers configured. Add a provider first.'));
        return;
      }
      
      // Filter out providers marked as noAuth
      const authProviders = providers.filter(p => !p.noAuth);
      
      if (authProviders.length === 0) {
        console.log(chalk.yellow('No providers requiring authentication found.'));
        return;
      }
      
      // Choose provider
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select provider to update API key:',
          choices: authProviders.map(p => p.name),
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'Enter new API key:',
          validate: (input) => input.length > 0 ? true : 'API Key cannot be empty',
        }
      ]);
      
      // Store API key securely
      await KeyManager.storeApiKey(answers.provider, answers.apiKey);
      console.log(chalk.green(`API key for '${answers.provider}' updated successfully`));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('provider:default')
  .description('Set the default provider')
  .action(async () => {
    try {
      const providers = getProviders();
      if (providers.length === 0) {
        console.log(chalk.yellow('No providers configured. Add a provider first.'));
        return;
      }
      
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select default provider:',
          choices: providers.map(p => p.name),
        },
      ]);
      
      setDefaultProvider(answers.provider);
      console.log(chalk.green(`Default provider set to '${answers.provider}'`));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('models')
  .description('List available models for a provider')
  .option('-p, --provider <provider>', 'Specify the provider to use')
  .action(async (options) => {
    try {
      console.log(chalk.dim('Fetching models...'));
      const models = await getModels(options.provider);
      
      console.log(chalk.bold('Available Models:'));
      models.forEach(model => {
        console.log(`  ${model}`);
      });
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Handle slash commands
program.on('command:*', async (operands) => {
  const command = operands[0];
  
  if (command.startsWith('/')) {
    const slashCommand = command.substring(1);
    
    switch (slashCommand) {
      case 'models':
        const modelsCmd = program.commands.find(cmd => cmd.name() === 'models');
        if (modelsCmd) modelsCmd.action({} as any);
        break;
      case 'providers':
        const providersCmd = program.commands.find(cmd => cmd.name() === 'providers');
        if (providersCmd) providersCmd.action({} as any);
        break;
      default:
        console.log(chalk.yellow(`Unknown slash command: ${slashCommand}`));
    }
    return;
  }
  
  console.log(chalk.yellow(`Unknown command: ${command}`));
  program.outputHelp();
});

program.parse(process.argv);

// If no arguments, show help
if (process.argv.length <= 2) {
  program.outputHelp();
}