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
import path from 'path';
// Import inquirer directly now that we have polyfills
import inquirer from 'inquirer';
import { askQuestion, askQuestionWithStreaming, getModels, getProviders, getDefaultProvider, addProvider, setDefaultProvider, getProviderWithApiKey } from '../services/llm.js';
import { KeyManager } from '../utils/keyManager.js';
import { SessionManager } from '../services/sessionManager.js';
import { readFile, writeFile, fileExists, generateUniqueFilename } from '../utils/fileUtils.js';
import config from '../config/index.js';
import { renderStreamingResponse } from '../components/StreamingResponse.js';

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
  .version('1.0.0')
  .addHelpText('after', `
Examples:
  $ llamb "What is the capital of France?"     Ask a simple question
  $ llamb -f script.js "Explain this code"     Include a file with your question
  $ llamb "Summarize this" -f document.txt     Process file contents
  $ llamb "Generate JSON" -o                   Save response (prompts for filename)
  $ llamb "Generate JSON" -o result.json       Save response to a specific file
  $ llamb -n "What is 2+2?"                    Ask without using conversation history
  $ llamb /history                             View conversation history
  $ llamb /clear                               Clear conversation history
  $ llamb /new                                 Start a new conversation
  $ llamb /debug                               Show terminal session debug info
  $ llamb /model                               Change the default model for current provider
  $ llamb model:default                        Select default model for the current provider
  $ llamb model:default -p openai              Select default model for a specific provider
`);

program
  .arguments('[question...]')
  .description('Ask a question to the LLM')
  .option('-m, --model <model>', 'Specify the model to use')
  .option('-p, --provider <provider>', 'Specify the provider to use')
  .option('-u, --baseUrl <baseUrl>', 'Specify a custom base URL for this request')
  .option('-s, --stream', 'Stream the response as it arrives (default: true)')
  .option('--progress-only', 'Show progress indicator without streaming content (prevents scrollback artifacts)')
  .option('--live-stream', 'Force live streaming of content even if progress-only mode is enabled')
  .option('--ink', 'Use ink-based UI for rendering (prevents scrollback artifacts)')
  .option('--no-ink', 'Disable ink-based UI rendering (use traditional rendering)')
  .option('-n, --no-history', 'Do not use conversation history for this request')
  .option('-f, --file <path>', 'Path to a file to include with your question')
  .option('-o, --output [path]', 'Save the response to a file (will prompt for filename)')
  .option('--overwrite', 'Overwrite existing files without prompting')
  .action(async (args, options) => {
    try {
      // Check for slash commands which should be handled directly
      if (args.length === 1 && args[0].startsWith('/')) {
        const slashCommand = args[0].substring(1);

        // Direct execution of slash commands without depending on Commander's command lookup
        switch (slashCommand) {
          case 'models':
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
            return;

          case 'model':
            try {
              // Get the provider
              const providers = getProviders();
              const defaultProviderName = getDefaultProvider();
              const providerName = options.provider || defaultProviderName;

              // Find the provider
              const provider = providers.find(p => p.name === providerName);
              if (!provider) {
                console.log(chalk.yellow(`Provider '${providerName}' not found.`));
                return;
              }

              console.log(chalk.dim(`Fetching models for ${provider.name}...`));
              let models: string[] = [];

              try {
                models = await getModels(provider.name);
              } catch (error: any) {
                console.log(chalk.yellow(`Could not fetch models for ${provider.name}: ${error.message}`));
                console.log(chalk.yellow('You will need to enter the model name manually.'));
              }

              let modelAnswer;

              if (models.length > 0) {
                // Show current default model
                console.log(chalk.dim(`Current default model: ${provider.defaultModel}`));

                // Let user select from available models
                modelAnswer = await inquirer.prompt({
                  type: 'list',
                  name: 'model',
                  message: 'Select default model:',
                  choices: models,
                  default: models.findIndex(m => m === provider.defaultModel),
                });
              } else {
                // If we couldn't get models, let the user enter manually
                modelAnswer = await inquirer.prompt({
                  type: 'input',
                  name: 'model',
                  message: 'Enter default model name:',
                  default: provider.defaultModel,
                  validate: (input: string) => input.length > 0 ? true : 'Model name cannot be empty',
                });
              }

              // Update the provider's default model
              const updatedProvider = {
                ...provider,
                defaultModel: modelAnswer.model
              };

              // Add provider to update it (this replaces the existing entry)
              await addProvider(updatedProvider);
              console.log(chalk.green(`Default model for '${provider.name}' set to '${modelAnswer.model}'`));
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
            }
            return;

          case 'providers':
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
            return;

          case 'clear':
            try {
              const sessionManager = SessionManager.getInstance();
              sessionManager.clearSession();
              console.log(chalk.green('Conversation context has been cleared.'));
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
            }
            return;

          case 'new':
            try {
              const sessionManager = SessionManager.getInstance();
              sessionManager.createNewSession();
              console.log(chalk.green('Started a new conversation context.'));
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
            }
            return;

          case 'history':
            try {
              const sessionManager = SessionManager.getInstance();
              const messages = sessionManager.getMessages();

              if (messages.length === 0) {
                console.log(chalk.yellow('No conversation history yet.'));
                return;
              }

              console.log(chalk.bold('Conversation History:'));
              console.log(chalk.dim(`Terminal ID: ${sessionManager.getTerminalId()}`));
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
            return;

          case 'debug':
            try {
              const sessionManager = SessionManager.getInstance();
              const terminalId = sessionManager.getTerminalId();

              console.log(chalk.bold('Terminal Session Debug Info:'));
              console.log('');
              console.log(chalk.cyan('Terminal ID:'), terminalId);
              console.log('');

              // Check if this is an SSH session
              const isSSH = process.env.SSH_CONNECTION ? true : false;
              console.log(chalk.cyan('Session Type:'), isSSH ? chalk.yellow('SSH Connection') : 'Local Terminal');

              if (isSSH) {
                console.log('');
                console.log(chalk.cyan('SSH Session Info:'));
                console.log(chalk.dim('SSH_CONNECTION:'), process.env.SSH_CONNECTION || 'not set');
                console.log(chalk.dim('SSH_CLIENT:'), process.env.SSH_CLIENT || 'not set');
                console.log(chalk.dim('SSH_TTY:'), process.env.SSH_TTY || 'not set');
              }

              console.log('');
              console.log(chalk.cyan('Environment Variables:'));
              console.log(chalk.dim('TERM_SESSION_ID:'), process.env.TERM_SESSION_ID || 'not set');
              console.log(chalk.dim('WINDOWID:'), process.env.WINDOWID || 'not set');
              console.log(chalk.dim('TERMINATOR_UUID:'), process.env.TERMINATOR_UUID || 'not set');
              console.log(chalk.dim('ITERM_SESSION_ID:'), process.env.ITERM_SESSION_ID || 'not set');
              console.log(chalk.dim('SHELL:'), process.env.SHELL || 'not set');
              console.log(chalk.dim('TTY:'), process.env.TTY || 'not set');
              console.log(chalk.dim('PID:'), process.pid?.toString() || 'not set');

              console.log('');
              console.log(chalk.cyan('Session Info:'));
              const currentSession = sessionManager.getCurrentSession();
              console.log(chalk.dim('Session ID:'), currentSession.id);
              console.log(chalk.dim('Created At:'), currentSession.createdAt);
              console.log(chalk.dim('Updated At:'), currentSession.updatedAt);
              console.log(chalk.dim('Message Count:'), currentSession.messages.length);

              console.log('');
              console.log(chalk.green('✓ This command helps debug terminal-specific sessions.'));
              console.log(chalk.dim('Run this in different terminal windows to verify unique IDs.'));
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
            }
            return;
        }
      }

      if (args.length === 0) {
        console.log(chalk.yellow('No question provided. Use --help for usage information.'));
        return;
      }

      const question = args.join(' ');
      console.log(chalk.dim('Asking: ') + question);

      // Handle file input if provided
      let fileContent: string | undefined;
      if (options.file) {
        try {
          console.log(chalk.dim(`Reading file: ${options.file}`));
          fileContent = readFile(options.file);
          console.log(chalk.green(`✓ File loaded (${(fileContent.length / 1024).toFixed(1)} KB)`));
        } catch (error: any) {
          console.error(chalk.red(`Error reading file: ${error.message}`));
          return;
        }
      }

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

        // Determine if we should use progress-only mode (prevents scrollback artifacts)
        // Check command-line options first, then fall back to config setting
        // --live-stream flag overrides both --progress-only and the config setting
        const useProgressOnly = options.liveStream === true ? false :
                              (options.progressOnly === true ||
                              (options.progressOnly !== false && config.get('useProgressOnly')));

        // Check if we should use the ink-based UI (enabled by default, can be disabled with --no-ink)
        const useInkUI = options.ink !== false && config.get('useInkUI') === true;

        let answer: string;
        
        if (shouldStream) {
          // If using Ink UI, it handles the streaming display
          if (useInkUI) {
            // Create a streaming function for Ink to consume
            const streamingFunction = (onChunk: (chunk: string) => void) => {
              return askQuestionWithStreaming(
                question,
                onChunk,
                options.model,
                options.provider,
                options.baseUrl,
                options.history,
                fileContent
              );
            };

            // Use the ink-based UI for display
            renderStreamingResponse(question, streamingFunction, (fullResponse: string) => {
              answer = fullResponse;
              // Handle file output when complete
              if (options.output !== undefined) {
                try {
                  handleFileOutput(answer, options.output, options.overwrite);
                } catch (error: any) {
                  console.error(chalk.red(`Error saving response: ${error.message}`));
                }
              }
            });

            // Early return since ink handles its own rendering
            return;
          } else if (useProgressOnly) {
            // PROGRESS-ONLY MODE: collect response and only render at the end
            // This eliminates all scrollback issues
            let partialResponse = '';
            let streamComplete = false;
            let updateCounter = 0;
            const streamInterval = 50; // ms between updates

            // Custom spinner alternating between lamb and llama emojis
            const animalEmojis = ['🐑', '🦙'];
            const spinner = ora({
              text: chalk.dim('Thinking...'),
              spinner: {
                frames: animalEmojis,
                interval: 400
              },
              color: 'yellow'
            }).start();

            // Display the question once
            console.log(chalk.dim('Asking: ') + question);

            // Collect the response through streaming without displaying intermediate updates
            const handleStreamingChunk = (chunk: string) => {
              partialResponse += chunk;
              updateCounter++;
            };

            // Start a timer that will update a progress indicator instead of the content
            const progressTimer = setInterval(() => {
              if (updateCounter > 0 && spinner.isSpinning) {
                spinner.text = chalk.dim(`Receiving response${'.'.repeat(updateCounter % 4)}`);
                updateCounter = 0;
              }

              if (streamComplete) {
                clearInterval(progressTimer);
              }
            }, streamInterval);

            // Set up the callback and ask the question
            answer = await askQuestionWithStreaming(
              question,
              handleStreamingChunk,
              options.model,
              options.provider,
              options.baseUrl,
              options.history,
              fileContent
            );

            // Mark streaming as complete and clear the interval
            streamComplete = true;
            clearInterval(progressTimer);

            // Stop the spinner
            spinner.stop();

            // Parse and display the full response at once
            //@ts-ignore
            const parsedResponse = marked(String(answer)) as string;
            const boxedResponse = boxen(parsedResponse, {
              padding: 1,
              borderColor: 'green',
              borderStyle: 'round',
              title: 'LLaMB',
              titleAlignment: 'center',
              width: maxWidth,
            });

            // Display the complete response once with no streaming artifacts
            console.log(boxedResponse);
          } else {
            // LIVE STREAMING MODE: show content as it arrives (may have scrollback artifacts)
            let partialResponse = '';
            let isFirstChunk = true;

            // Custom spinner alternating between lamb and llama emojis
            const animalEmojis = ['🐑', '🦙'];
            const spinner = ora({
              text: chalk.dim('Thinking...'),
              spinner: {
                frames: animalEmojis,
                interval: 400
              },
              color: 'yellow'
            }).start();

            // Display the question once
            console.log(chalk.dim('Asking: ') + question);

            // Function to create a clean render of the response
            const renderResponse = (content: string) => {
              // Parse markdown
              //@ts-ignore
              const parsedContent = marked(content) as string;

              // Create the boxed response
              return boxen(parsedContent, {
                padding: 1,
                borderColor: 'green',
                borderStyle: 'round',
                title: 'LLaMB',
                titleAlignment: 'center',
                width: maxWidth,
              });
            };

            // Track the state for terminal rendering
            let lastOutputLines = 0;

            // Process streaming content with live updates
            const handleStreamingChunk = (chunk: string) => {
              // Stop the spinner on first chunk
              if (isFirstChunk) {
                spinner.stop();
                isFirstChunk = false;
              }

              // Accumulate the response
              partialResponse += chunk;

              // Render the response and store its line count
              const rendered = renderResponse(partialResponse);
              const renderedLines = rendered.split('\n').length;

              // Logic for first render vs subsequent renders
              if (lastOutputLines === 0) {
                // First render after spinner stops
                process.stdout.write(rendered + '\n');
              } else {
                // For subsequent renders:
                // 1. Move cursor up to beginning of last output
                process.stdout.write(`\x1B[${lastOutputLines}A`);
                // 2. Clear screen from cursor down (removes old content)
                process.stdout.write('\x1B[J');
                // 3. Write new content
                process.stdout.write(rendered + '\n');
              }

              // Store line count for next update
              lastOutputLines = renderedLines;
            };

            // Set up the callback and ask the question
            answer = await askQuestionWithStreaming(
              question,
              handleStreamingChunk,
              options.model,
              options.provider,
              options.baseUrl,
              options.history,
              fileContent
            );
          }

          // Handle file output
          if (options.output !== undefined) {
            try {
              await handleFileOutput(answer, options.output, options.overwrite);
            } catch (error: any) {
              console.error(chalk.red(`Error saving response: ${error.message}`));
            }
          }
        } else {
          // Non-streaming version - show spinner alternating between lamb and llama
          const animalEmojis = ['🐑', '🦙'];
          const spinner = ora({
            text: chalk.dim('Thinking...'),
            spinner: {
              frames: animalEmojis,
              interval: 400
            },
            color: 'yellow'
          }).start();
          
          // Call without streaming
          answer = await askQuestion(question, options.model, options.provider, options.baseUrl, options.history, fileContent);
          
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

          // Handle file output
          if (options.output !== undefined) {
            try {
              await handleFileOutput(answerText, options.output, options.overwrite);
            } catch (error: any) {
              console.error(chalk.red(`Error saving response: ${error.message}`));
            }
          }
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

program
  .command('model:default')
  .description('Set the default model for a provider')
  .option('-p, --provider <provider>', 'Specify the provider to use')
  .action(async (options) => {
    try {
      // Get the provider
      const providers = getProviders();
      const defaultProviderName = getDefaultProvider();
      const providerName = options.provider || defaultProviderName;

      // Find the provider
      const provider = providers.find(p => p.name === providerName);
      if (!provider) {
        console.log(chalk.yellow(`Provider '${providerName}' not found.`));
        return;
      }

      console.log(chalk.dim(`Fetching models for ${provider.name}...`));
      let models: string[] = [];

      try {
        models = await getModels(provider.name);
      } catch (error: any) {
        console.log(chalk.yellow(`Could not fetch models for ${provider.name}: ${error.message}`));
        console.log(chalk.yellow('You will need to enter the model name manually.'));
      }

      let modelAnswer;

      if (models.length > 0) {
        // Show current default model
        console.log(chalk.dim(`Current default model: ${provider.defaultModel}`));

        // Let user select from available models
        modelAnswer = await inquirer.prompt({
          type: 'list',
          name: 'model',
          message: 'Select default model:',
          choices: models,
          default: models.findIndex(m => m === provider.defaultModel),
        });
      } else {
        // If we couldn't get models, let the user enter manually
        modelAnswer = await inquirer.prompt({
          type: 'input',
          name: 'model',
          message: 'Enter default model name:',
          default: provider.defaultModel,
          validate: (input: string) => input.length > 0 ? true : 'Model name cannot be empty',
        });
      }

      // Update the provider's default model
      const updatedProvider = {
        ...provider,
        defaultModel: modelAnswer.model
      };

      // Add provider to update it (this replaces the existing entry)
      await addProvider(updatedProvider);
      console.log(chalk.green(`Default model for '${provider.name}' set to '${modelAnswer.model}'`));

    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

/**
 * Handle saving response to a file with interactive prompts
 */
async function handleFileOutput(content: string, outputPath: string | true, overwrite: boolean = false): Promise<void> {
  let finalPath = typeof outputPath === 'string' ? outputPath : '';

  // If no path is specified (just -o flag), prompt for a filename
  if (!finalPath) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'filename',
        message: 'Enter filename to save response:',
        default: `llamb-response-${Date.now()}.txt`,
        validate: (input: string) => input.length > 0 ? true : 'Filename cannot be empty'
      }
    ]);
    finalPath = answer.filename;
  }

  // Check if file exists and handle appropriately
  if (fileExists(finalPath) && !overwrite) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `File '${finalPath}' already exists. What would you like to do?`,
        choices: [
          { name: 'Overwrite existing file', value: 'overwrite' },
          { name: 'Generate a new filename', value: 'new' },
          { name: 'Cancel', value: 'cancel' }
        ]
      }
    ]);

    if (answer.action === 'cancel') {
      console.log(chalk.yellow('File save cancelled.'));
      return;
    } else if (answer.action === 'new') {
      const newPath = generateUniqueFilename(finalPath);
      console.log(chalk.dim(`Using new filename: ${newPath}`));
      finalPath = newPath;
    }
    // For 'overwrite', we'll just continue with the existing path
  }

  // Write the file
  writeFile(finalPath, content, true); // true to overwrite if needed
  console.log(chalk.green(`✓ Response saved to: ${finalPath}`));
}

// This handler is for unrecognized commands only
program.on('command:*', async (operands) => {
  const command = operands[0];
  console.log(chalk.yellow(`Unknown command: ${command}`));
  program.outputHelp();
});

// Add config management commands
program
  .command('config:progress-mode')
  .description('Toggle progress-only mode (prevents scrollback artifacts)')
  .option('--enable', 'Enable progress-only mode')
  .option('--disable', 'Disable progress-only mode')
  .option('--ink', 'Use ink-based UI (experimental)')
  .option('--status', 'Show current setting status (default)')
  .action((options) => {
    try {
      // Default to showing status if no action specified
      const showStatus = !options.enable && !options.disable && !options.ink;

      // Get current settings
      const currentProgressSetting = config.get('useProgressOnly');
      const currentInkSetting = config.get('useInkUI');

      if (options.enable) {
        // Enable progress-only mode
        config.set('useProgressOnly', true);
        // Disable ink when enabling progress-only mode
        config.set('useInkUI', false);
        console.log(chalk.green('Progress-only mode has been enabled.'));
        console.log(chalk.dim('This will prevent scrollback artifacts by not streaming content as it arrives.'));
      } else if (options.disable) {
        // Disable progress-only mode
        config.set('useProgressOnly', false);
        // Also disable ink when disabling progress-only mode
        config.set('useInkUI', false);
        console.log(chalk.green('Progress-only mode has been disabled.'));
        console.log(chalk.dim('Content will stream as it arrives (may have scrollback artifacts).'));
      } else if (options.ink) {
        // Enable ink UI mode
        config.set('useInkUI', true);
        // Disable progress-only mode when enabling ink
        config.set('useProgressOnly', false);
        console.log(chalk.green('Ink-based UI has been enabled.'));
        console.log(chalk.dim('Using React-based terminal UI, which prevents scrollback artifacts.'));
      }

      // Show status
      if (showStatus || options.status) {
        console.log(chalk.bold('Current settings:'));

        if (currentInkSetting) {
          console.log(chalk.green('✓ Ink-based UI is enabled'));
          console.log(chalk.dim('Using React-based terminal UI to prevent scrollback artifacts.'));
        } else if (currentProgressSetting) {
          console.log(chalk.green('✓ Progress-only mode is enabled'));
          console.log(chalk.dim('Content is not streamed as it arrives, preventing scrollback artifacts.'));
        } else {
          console.log(chalk.yellow('✗ Progress-only mode is disabled'));
          console.log(chalk.dim('Content streams as it arrives (may have scrollback artifacts).'));
        }

        console.log('');
        console.log(chalk.cyan('To change these settings, use:'));
        console.log('  llamb config:progress-mode --enable   (progress-only mode)');
        console.log('  llamb config:progress-mode --ink      (experimental ink UI)');
        console.log('  llamb config:progress-mode --disable  (live streaming)');
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
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
      console.log(chalk.dim(`Terminal ID: ${sessionManager.getTerminalId()}`));
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

// Add debug command for terminal session info
program
  .command('context:debug')
  .description('Display terminal and session debugging information')
  .action(() => {
    try {
      const sessionManager = SessionManager.getInstance();
      const terminalId = sessionManager.getTerminalId();

      console.log(chalk.bold('Terminal Session Debug Info:'));
      console.log('');
      console.log(chalk.cyan('Terminal ID:'), terminalId);
      console.log('');

      // Check if this is an SSH session
      const isSSH = process.env.SSH_CONNECTION ? true : false;
      console.log(chalk.cyan('Session Type:'), isSSH ? chalk.yellow('SSH Connection') : 'Local Terminal');

      if (isSSH) {
        console.log('');
        console.log(chalk.cyan('SSH Session Info:'));
        console.log(chalk.dim('SSH_CONNECTION:'), process.env.SSH_CONNECTION || 'not set');
        console.log(chalk.dim('SSH_CLIENT:'), process.env.SSH_CLIENT || 'not set');
        console.log(chalk.dim('SSH_TTY:'), process.env.SSH_TTY || 'not set');
      }

      console.log('');
      console.log(chalk.cyan('Environment Variables:'));
      console.log(chalk.dim('TERM_SESSION_ID:'), process.env.TERM_SESSION_ID || 'not set');
      console.log(chalk.dim('WINDOWID:'), process.env.WINDOWID || 'not set');
      console.log(chalk.dim('TERMINATOR_UUID:'), process.env.TERMINATOR_UUID || 'not set');
      console.log(chalk.dim('ITERM_SESSION_ID:'), process.env.ITERM_SESSION_ID || 'not set');
      console.log(chalk.dim('SHELL:'), process.env.SHELL || 'not set');
      console.log(chalk.dim('TTY:'), process.env.TTY || 'not set');
      console.log(chalk.dim('PID:'), process.pid?.toString() || 'not set');

      console.log('');
      console.log(chalk.cyan('Session Info:'));
      const currentSession = sessionManager.getCurrentSession();
      console.log(chalk.dim('Session ID:'), currentSession.id);
      console.log(chalk.dim('Created At:'), currentSession.createdAt);
      console.log(chalk.dim('Updated At:'), currentSession.updatedAt);
      console.log(chalk.dim('Message Count:'), currentSession.messages.length);

      console.log('');
      console.log(chalk.green('✓ This command helps debug terminal-specific sessions.'));
      console.log(chalk.dim('Run this in different terminal windows to verify unique IDs.'));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

program.parse(process.argv);

// If no arguments, show help
if (process.argv.length <= 2) {
  program.outputHelp();
}