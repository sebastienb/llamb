#!/usr/bin/env node

// Import polyfills first
import '../utils/polyfills.js';

import { Command } from 'commander';
import chalk from 'chalk';
import OpenAI from 'openai';
import boxen from 'boxen';
import wrap from 'word-wrap';
import terminalLink from 'terminal-link';
import ora from 'ora';
import { marked } from 'marked';
//@ts-ignore
import TerminalRenderer from 'marked-terminal';
import hljs from 'highlight.js';
// Import inquirer directly now that we have polyfills
import inquirer from 'inquirer';
import { askQuestion, askQuestionWithStreaming, getModels, getProviders, getDefaultProvider, addProvider, setDefaultProvider, getProviderWithApiKey } from '../services/llm.js';
import { KeyManager } from '../utils/keyManager.js';
import { SessionManager } from '../services/sessionManager.js';

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
  .option('-s, --stream', 'Stream the response as it arrives (default: true)')
  .option('-n, --no-history', 'Do not use conversation history for this request')
  .action(async (args, options) => {
    try {
      // Check for slash commands which should be handled directly
      if (args.length === 1 && args[0].startsWith('/')) {
        const slashCommand = args[0].substring(1);

        switch (slashCommand) {
          case 'models':
            const modelsCmd = program.commands.find(cmd => cmd.name() === 'models');
            if (modelsCmd) {
              modelsCmd.action({} as any);
              return;
            }
            break;
          case 'providers':
            const providersCmd = program.commands.find(cmd => cmd.name() === 'providers');
            if (providersCmd) {
              providersCmd.action({} as any);
              return;
            }
            break;
          case 'clear':
            const clearContextCmd = program.commands.find(cmd => cmd.name() === 'context:clear');
            if (clearContextCmd) {
              clearContextCmd.action({} as any);
              return;
            }
            break;
          case 'new':
            const newContextCmd = program.commands.find(cmd => cmd.name() === 'context:new');
            if (newContextCmd) {
              newContextCmd.action({} as any);
              return;
            }
            break;
          case 'history':
            const historyCmd = program.commands.find(cmd => cmd.name() === 'context:history');
            if (historyCmd) {
              historyCmd.action({} as any);
              return;
            }
            break;
        }
      }

      if (args.length === 0) {
        console.log(chalk.yellow('No question provided. Use --help for usage information.'));
        return;
      }

      const question = args.join(' ');
      console.log(chalk.dim('Asking: ') + question);
      
      try {
        // Check if the provider has a valid API key if needed
        const provider = await getProviderWithApiKey(options.provider);
        
        if (!provider.noAuth && !provider.apiKey) {
          console.log(chalk.yellow(`⚠️  Provider '${provider.name}' requires an API key but none is set.`));
          console.log(chalk.cyan('To add an API key, run: ') + chalk.bold('llamb provider:apikey'));
          console.log(chalk.cyan('To add a new provider, run: ') + chalk.bold('llamb provider:add'));
          console.log(chalk.cyan('To list available providers, run: ') + chalk.bold('llamb providers'));
          console.log('');
          
          // Check if Ollama is available as a fallback
          const ollama = getProviders().find(p => p.name === 'ollama');
          if (ollama) {
            console.log(chalk.green(`You can use local Ollama provider without an API key:`));
            console.log(chalk.bold(`llamb -p ollama "${question}"`));
          }
          return;
        }
        
        // Get terminal width for the output box
        const terminalWidth = process.stdout.columns || 80;
        const maxWidth = Math.min(terminalWidth - 10, 100); // Account for padding and max reasonable width
        
        // Determine if we should stream (default to true unless explicitly set to false)
        const shouldStream = options.stream !== false;
        
        let answer: string;
        
        if (shouldStream) {
          // For streaming, we'll create a live box that updates as content arrives
          let partialResponse = '';
          let parsedResponse = '';
          let boxedResponse = '';
         
          // Process and display streaming content
          const handleStreamingChunk = (chunk: string) => {
            partialResponse += chunk;
            
            // Parse the markdown
            //@ts-ignore
            parsedResponse = marked(partialResponse);
            
            // Create a boxed response
            boxedResponse = boxen(parsedResponse, {
              padding: 1,
              borderColor: 'green',
              borderStyle: 'round',
              title: 'LLaMB',
              titleAlignment: 'center',
              width: maxWidth,
            });
            
            // Clear the console and print the updated box
            // We use console.clear() to avoid flickering
            console.clear();
            console.log(chalk.dim('Asking: ') + question);
            console.log(boxedResponse);
          };

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
          
          // Set up the callback and ask the question
          answer = await askQuestionWithStreaming(
            question,
            (chunk) => {
              // Stop the spinner on first chunk
              if (partialResponse === '') {
                spinner.stop();
              }
              handleStreamingChunk(chunk);
            },
            options.model,
            options.provider,
            options.baseUrl,
            options.history // Pass the history option
          );
          
          // Ensure final answer is displayed correctly
          //@ts-ignore
          parsedResponse = marked(String(answer)) as string;
          boxedResponse = boxen(parsedResponse, {
            padding: 1,
            borderColor: 'green',
            borderStyle: 'round',
            title: 'LLaMB',
            titleAlignment: 'center',
            width: maxWidth,
          });
          
          // Clear and show the final answer
          console.clear();
          console.log(chalk.dim('Asking: ') + question);
          console.log(boxedResponse);
        } else {
          // Non-streaming version - show spinner
          const lambEmojis = ['🐑', '🐑 🐑', '🐑 🐑 🐑', '🐑 🐑', '🐑'];
          const spinner = ora({
            text: chalk.dim('Thinking...'),
            spinner: {
              frames: lambEmojis,
              interval: 300
            },
            color: 'yellow'
          }).start();
          
          // Call without streaming
          answer = await askQuestion(question, options.model, options.provider, options.baseUrl, options.history);
          
          // Stop the spinner
          spinner.stop();
          
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
        }
      } catch (error: any) {
        if (error.message.includes('No API key found') || 
            error.message.includes('Failed to get response from')) {
          // Provide helpful setup instructions
          console.log(chalk.yellow('⚠️  You need to configure an LLM provider before using llamb.'));
          console.log(chalk.cyan('To add a provider, run: ') + chalk.bold('llamb provider:add'));
          console.log(chalk.cyan('To set up an API key, run: ') + chalk.bold('llamb provider:apikey'));
          
          // Check if Ollama is configured
          const providers = getProviders();
          const ollama = providers.find(p => p.name === 'ollama');
          if (ollama) {
            console.log('');
            console.log(chalk.green('You can use Ollama locally without an API key if you have it installed:'));
            console.log(chalk.bold(`llamb -p ollama "${question}"`));
            console.log(chalk.dim('Learn more about Ollama: https://ollama.com'));
          }
        } else {
          console.error(chalk.red('Error:'), error.message);
        }
      }
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
      
      let readyProviders = 0;
      
      // Check for stored API keys
      for (const provider of providers) {
        const isDefault = provider.name === defaultProvider;
        const hasApiKey = provider.noAuth ? true : await KeyManager.getApiKey(provider.name);
        const isReady = provider.noAuth || hasApiKey;
        
        if (isReady) readyProviders++;
        
        // Prefix with status indicators
        let prefix = isDefault ? chalk.green('* ') : '  ';
        
        // Color-code the provider name based on ready status
        const nameStyle = isReady ? chalk.bold : chalk.dim;
        let providerInfo = `${prefix}${nameStyle(provider.name)} - ${provider.baseUrl} ${chalk.dim(`(default model: ${provider.defaultModel})`)}`;
        
        // Add API key status
        if (provider.noAuth) {
          providerInfo += ' ' + chalk.green('(ready to use)');
        } else if (hasApiKey) {
          providerInfo += ' ' + chalk.green('(API key: ✓)');
        } else {
          providerInfo += ' ' + chalk.yellow('(API key: ✗)');
        }
        
        console.log(providerInfo);
      }
      
      // Show help tips if no providers are ready to use
      if (readyProviders === 0) {
        console.log('');
        console.log(chalk.yellow('⚠️  No providers are ready to use.'));
        console.log(chalk.cyan('To add an API key, run: ') + chalk.bold('llamb provider:apikey'));
        console.log(chalk.cyan('To add a new provider, run: ') + chalk.bold('llamb provider:add'));
        console.log('');
        console.log(chalk.green('Tip: If you have Ollama installed locally, you can use it without an API key.'));
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
          validate: (input) => {
            if (input.length === 0) return 'Base URL cannot be empty';
            try {
              // Validate URL using WHATWG URL API instead of punycode
              new URL(input);
              return true;
            } catch (e) {
              return 'Invalid URL format';
            }
          },
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

// This handler is for unrecognized commands only
program.on('command:*', async (operands) => {
  const command = operands[0];
  console.log(chalk.yellow(`Unknown command: ${command}`));
  program.outputHelp();
});

// Add context management commands
program
  .command('context:clear')
  .description('Clear the current conversation context')
  .action(() => {
    try {
      const sessionManager = SessionManager.getInstance();
      sessionManager.clearSession();
      console.log(chalk.green('Conversation context has been cleared.'));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('context:new')
  .description('Start a new conversation context')
  .action(() => {
    try {
      const sessionManager = SessionManager.getInstance();
      sessionManager.createNewSession();
      console.log(chalk.green('Started a new conversation context.'));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program
  .command('context:history')
  .description('Display the current conversation history')
  .action(() => {
    try {
      const sessionManager = SessionManager.getInstance();
      const messages = sessionManager.getMessages();

      if (messages.length === 0) {
        console.log(chalk.yellow('No conversation history yet.'));
        return;
      }

      console.log(chalk.bold('Conversation History:'));
      console.log('');

      // Get terminal width for the output box
      const terminalWidth = process.stdout.columns || 80;
      const maxWidth = Math.min(terminalWidth - 10, 100);

      // Display each message with appropriate styling
      messages.forEach((message, index) => {
        const roleColor = message.role === 'user' ? chalk.blue : chalk.green;
        const roleName = message.role === 'user' ? 'You' : 'Assistant';

        console.log(roleColor(chalk.bold(`${roleName}:`)));

        // Create a boxed message
        const boxedMessage = boxen(wrap(message.content, { width: maxWidth - 4, indent: '' }), {
          padding: 1,
          borderColor: message.role === 'user' ? 'blue' : 'green',
          borderStyle: 'round',
          width: maxWidth,
        });

        console.log(boxedMessage);

        // Add spacing between messages
        if (index < messages.length - 1) {
          console.log('');
        }
      });
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program.parse(process.argv);

// If no arguments, show help
if (process.argv.length <= 2) {
  program.outputHelp();
}