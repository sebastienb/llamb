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
import fs from 'fs';
import os from 'os';
// Import inquirer directly now that we have polyfills
import inquirer from 'inquirer';
import { askQuestion, askQuestionWithStreaming, getModels, getProviders, getDefaultProvider, addProvider, setDefaultProvider, getProviderWithApiKey, deleteProvider, formatOutputContent, checkProviderStatus, getModelCount } from '../services/llm.js';

// Global auto-close prevention system
// This allows any feature to prevent the app from closing while user interaction is needed
const preventAutoClose = {
  _preventExitCount: 0,
  
  // Request to prevent app from auto-closing
  prevent: (reason: string = 'unknown') => {
    // @ts-ignore - Add a global flag to make this available everywhere
    process._llamb_prevent_exit = true;
    preventAutoClose._preventExitCount++;
    console.log(chalk.dim(`Auto-close prevented: ${reason}`));
    return preventAutoClose._preventExitCount;
  },
  
  // Release the prevention (when interaction is done)
  release: () => {
    preventAutoClose._preventExitCount = Math.max(0, preventAutoClose._preventExitCount - 1);
    if (preventAutoClose._preventExitCount === 0) {
      // @ts-ignore - Clear the global flag when all preventions are released
      process._llamb_prevent_exit = false;
      console.log(chalk.dim(`Auto-close resumed`));
    }
    return preventAutoClose._preventExitCount;
  },
  
  // Check if app is prevented from closing
  isPrevented: (): boolean => {
    // @ts-ignore - Access the global flag
    return process._llamb_prevent_exit === true;
  }
};
import { KeyManager } from '../utils/keyManager.js';
import { SessionManager } from '../services/sessionManager.js';
import { readFile, writeFile, fileExists, generateUniqueFilename } from '../utils/fileUtils.js';
import config, { LLMProvider } from '../config/index.js';
import { renderStreamingResponse } from '../components/StreamingResponse.js';
import { registerPromptCommands } from './promptCli.js';
import { processPrompt, formatQuestionWithPrompt } from '../services/promptExecution.js';

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
// The ts-ignore is required since the marked-terminal types don't match exactly
// what the marked library expects
//@ts-ignore
const renderer = new TerminalRenderer();

// Configure marked with all our options
//@ts-ignore
marked.setOptions({
  //@ts-ignore
  renderer: renderer,
  gfm: true,
  breaks: true
});

const program = new Command();

// Check for dependencies on startup, but don't block operation
// This provides an early warning to users
checkDependencies();

// Read package version
import { readFileSync } from 'fs';
import * as readline from 'readline';
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

program
  .name('llamb')
  .description('CLI LLM client that answers questions directly from your terminal')
  .version(packageJson.version)
  .addHelpText('after', `
Examples:
  $ llamb "What is the capital of France?"     Ask a simple question
  $ llamb -f script.js "Explain this code"     Include a file with your question
  $ llamb "Summarize this" -f document.txt     Process file contents
  $ llamb -t summarize -f document.txt         Use a saved prompt template
  $ llamb "Generate JSON" -o                   Save response (prompts for filename)
  $ llamb "Generate JSON" -o result.json       Save response to a specific file
  $ llamb -n "What is 2+2?"                    Ask without using conversation history
  $ llamb -c "Tell me about France"            Start in continuous conversation mode
  $ llamb /history                             View conversation history
  $ llamb /clear                               Clear conversation history
  $ llamb /new                                 Start a new conversation
  $ llamb /debug                               Show terminal session debug info
  $ llamb /model                               Change the default model for current provider
  $ llamb model:default                        Select default model for the current provider
  $ llamb model:default -p openai              Select default model for a specific provider

Prompt Management:
  $ llamb prompt:list                          List all saved prompts
  $ llamb prompt:add <name>                    Create a new prompt template
  $ llamb prompt:edit <name>                   Edit a prompt template
  $ llamb prompt:delete <name>                 Delete a prompt template
  $ llamb prompt:show <name>                   Show a prompt template

Provider Management:
  $ llamb provider:add                         Add a new provider interactively
  $ llamb provider:edit                        Edit an existing provider interactively
  $ llamb provider:delete                      Delete a provider interactively
  $ llamb provider:apikey                      Update a provider's API key
  $ llamb provider:default                     Set the default provider
  $ llamb providers                            List all configured providers
  $ llamb provider:edit --name openai --url https://api.openai.com/v1 --model gpt-4o
                                               Edit a provider non-interactively
  $ llamb provider:delete --name openai        Delete a provider non-interactively
  $ llamb provider:delete --name openai --force Delete a provider without confirmation
`);

program
  .arguments('[question...]')
  .description('Ask a question to the LLM')
  .option('-c, --chat', 'Enable continuous conversation mode for follow-up questions')
  .option('--no-chat', 'Disable continuous conversation mode (default)')
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
  .option('-t, --prompt <name>', 'Use a saved prompt template for your question')
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
              console.log(chalk.bold('\nAvailable Models:'));
              models.forEach(model => {
                console.log(`- ${model}`);
              });
              return;
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
              return;
            }

          case 'clear':
            try {
              const sessionManager = SessionManager.getInstance();
              sessionManager.clearSession();
              console.log(chalk.green('Conversation context has been cleared.'));
              return;
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
            }
            return;
            
          case 'new':
            try {
              const sessionManager = SessionManager.getInstance();
              sessionManager.createNewSession();
              console.log(chalk.green('Started a new conversation context.'));
              return;
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
            
          case 'model':
            try {
              console.log(chalk.dim('Fetching models...'));
              const models = await getModels(options.provider);
              
              // Get the current provider info
              const provider = await getProviderWithApiKey(options.provider);
              
              // Format the choices to highlight the current default model
              const formattedChoices = models.map(model => ({
                name: model === provider.defaultModel ? 
                  `${model} ${chalk.green('(current)')}` : 
                  model,
                value: model
              }));
              
              const answers = await inquirer.prompt([
                {
                  type: 'list',
                  name: 'selectedModel',
                  message: `Select a default model for ${provider.name}:`,
                  choices: formattedChoices,
                  default: provider.defaultModel || models[0]
                }
              ]);
              
              // Update the provider's default model
              await setDefaultProvider(provider.name, answers.selectedModel);
              console.log(chalk.green(`✓ Default model for ${provider.name} set to: ${answers.selectedModel}`));
              return;
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
              return;
            }
            
          case 'debug':
            try {
              const sessionManager = SessionManager.getInstance();
              const terminalId = sessionManager.getTerminalId();
              const currentSession = sessionManager.getCurrentSession();
              
              console.log(chalk.bold('Terminal Session Debug Info:'));
              console.log(chalk.dim('────────────────────────────'));
              console.log(`Terminal ID: ${chalk.cyan(terminalId)}`);
              console.log(`Session ID:  ${chalk.cyan(currentSession.id)}`);
              console.log(`Created:     ${chalk.cyan(new Date(currentSession.createdAt).toLocaleString())}`);
              console.log(`Updated:     ${chalk.cyan(new Date(currentSession.updatedAt).toLocaleString())}`);
              console.log(`Messages:    ${chalk.cyan(currentSession.messages.length.toString())}`);
              console.log(`Working Dir: ${chalk.cyan(process.cwd())}`);
              console.log(chalk.dim('────────────────────────────'));
              console.log(chalk.dim('This information can help with troubleshooting.'));
              return;
            } catch (error: any) {
              console.error(chalk.red('Error:'), error.message);
              return;
            }

          default:
            console.log(chalk.yellow(`Unknown command: /${slashCommand}`));
            console.log(chalk.cyan('Available commands:'));
            console.log(chalk.dim('/clear    - Clear conversation history'));
            console.log(chalk.dim('/new      - Start a new conversation'));
            console.log(chalk.dim('/history  - View conversation history'));
            console.log(chalk.dim('/models   - List available models'));
            console.log(chalk.dim('/model    - Change the default model'));
            console.log(chalk.dim('/debug    - Show terminal session debug info'));
            return;
        }
      }

      if (args.length === 0 && !options.prompt) {
        console.log(chalk.yellow('No question provided. Use --help for usage information.'));
        return;
      }

      let question = args.join(' ');

      // Handle file input if provided
      let fileContent: string | undefined;
      if (options.file) {
        try {
          console.log(chalk.dim(`Reading file: ${options.file}`));
          fileContent = readFile(options.file);
          console.log(chalk.green(`✓ File loaded (${(fileContent.length / 1024).toFixed(1)} KB)`));
        } catch (error: any) {
          console.error(chalk.red(`Error reading file: ${error.message}`));
          
          // Exit when done in non-chat mode with error code
          if (!options.chat) {
            exitWhenDone(1);
          }
          return;
        }
      }
      
      // Handle prompt template if specified
      if (options.prompt) {
        try {
          // Process the prompt with placeholders
          const processedPrompt = processPrompt(options.prompt, options.file, options.output);
          // Format the question with the prompt
          question = formatQuestionWithPrompt(question, processedPrompt);
        } catch (error: any) {
          console.error(chalk.red(`Error processing prompt: ${error.message}`));
          console.log(chalk.cyan('Available prompts:'));
          console.log(chalk.bold('  llamb prompt:list'));
          
          // Exit when done in non-chat mode with error code
          if (!options.chat) {
            exitWhenDone(1);
          }
          return;
        }
      }

      // If continuous conversation mode is enabled, use the specialized function
      if (options.chat) {
        console.log(chalk.dim('Starting continuous conversation mode...'));
        await startContinuousConversation(question, options, fileContent);
        return;
      }

      // For one-off questions, just ask and display the answer
      try {
        // Check if the provider has a valid API key
        const provider = await getProviderWithApiKey(options.provider);

        if (provider.requiresAuth && !provider.apiKey) {
          console.log(chalk.yellow(`⚠️  Provider '${provider.name}' requires an API key but none is set.`));
          console.log(chalk.cyan('To add an API key interactively, run:'));
          console.log(chalk.bold('  llamb provider:apikey'));
          console.log(chalk.cyan('To add an API key non-interactively, run:'));
          console.log(chalk.bold(`  llamb provider:apikey --provider ${provider.name} --key YOUR_API_KEY`));
          console.log(chalk.cyan('To add a new provider, run:'));
          console.log(chalk.bold('  llamb provider:add'));
          console.log(chalk.cyan('To list available providers, run:'));
          console.log(chalk.bold('  llamb providers'));
          console.log('');

          // Check if any local provider is available as a fallback
          const localProviders = getProviders().filter(p => !p.requiresAuth);
          if (localProviders.length > 0) {
            console.log(chalk.green(`You can use a local provider without an API key, for example:`));
            console.log(chalk.bold(`llamb -p ${localProviders[0].name} "${question}"`));
          }
          throw new Error("No API key found");
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
        
        // If we're going to save output to a file, register a global flag to prevent auto-exit
        if (options.output !== undefined) {
          // @ts-ignore - Create a flag to ensure we never auto-exit during file operations
          process._llamb_file_output_pending = true;
        }

        let answer = '';

        if (shouldStream) {
          // If using Ink UI, it handles the streaming display
          if (useInkUI) {
            // Create an AbortController for cancellation support
            const abortController = new AbortController();

            // Create a streaming function for Ink to consume
            const streamingFunction = (onChunk: (chunk: string) => void) => {
              return askQuestionWithStreaming(
                question,
                onChunk,
                options.model,
                options.provider,
                options.baseUrl,
                options.history,
                fileContent,
                abortController
              );
            };

            // Use the ink-based UI for display with cancellation support
            const unmount = renderStreamingResponse(
              question,
              streamingFunction,
              async (fullResponse: string) => {
                // Only process this callback once
                if (answer !== '') {
                  console.log(chalk.dim('Duplicate onComplete callback received, ignoring'));
                  return;
                }
                
                answer = fullResponse;
                console.log(chalk.dim(`Debug: onComplete callback received content of length ${fullResponse ? fullResponse.length : 0}`));
                // Make sure fullResponse is actually a string
                if (typeof fullResponse !== 'string') {
                  console.log(chalk.yellow(`Warning: Response is not a string! Type: ${typeof fullResponse}`));
                  answer = String(fullResponse || '');
                } else {
                  answer = fullResponse;
                }
                
                // Handle file output when complete
                if (options.output !== undefined) {
                  try {
                    // Make sure we use await since file handling is asynchronous!
                    await handleFileOutput(answer, options.output, options.overwrite);
                  } catch (error: any) {
                    console.error(chalk.red(`Error saving response: ${error.message}`));
                  }
                }
                
                // Don't exit immediately - allow UI to render properly
              },
              abortController,
              options.chat // Pass the chat mode flag
            );

            // Handle Ctrl+C during streaming
            const sigintHandler = () => {
              // Abort the request
              abortController.abort();
              // Unmount the UI
              unmount();
              console.log(chalk.red('\nRequest cancelled by user'));
              // In continuous conversation mode, we want to throw an error to be caught by the parent
              if (options.chat) {
                throw new Error('User force closed');
              } else {
                // In non-chat mode, exit when done
                exitWhenDone(0);
              }
            };

            process.on('SIGINT', sigintHandler);

            // Wait for the streaming to complete and rendering to finish
            await new Promise<void>((resolve) => {
              // Flags to track different event completion states
              let renderComplete = false;
              let fileComplete = false;
              let contentReady = false;
              
              // Define the event handler functions separately so we can remove them later
              const renderCompleteHandler = () => {
                renderComplete = true;
                console.log(chalk.dim('Render complete event received'));
              };

              // Custom event for file output complete
              const fileCompleteHandler = () => {
                console.log(chalk.dim('File output complete event received'));
                fileComplete = true;
              };
              
              // Custom event for content preparation complete
              const contentReadyHandler = (eventData: any) => {
                contentReady = true;
                console.log(chalk.dim(`Content ready event received - content length: ${eventData?.length || 'unknown'}`));
              };
              
              // Set up listeners for custom events
              process.on('llamb_render_complete', renderCompleteHandler);
              process.on('llamb_file_complete', fileCompleteHandler);
              process.on('llamb_content_ready', contentReadyHandler);
              
              const checkInterval = setInterval(() => {
                // If output to file is requested, wait for all three events
                if (options.output !== undefined) {
                  if (renderComplete && fileComplete && contentReady) {
                    console.log(chalk.dim('All operations complete: render, content, and file'));
                    // Clean up all listeners and intervals
                    clearInterval(checkInterval);
                    process.removeListener('llamb_render_complete', renderCompleteHandler);
                    process.removeListener('llamb_file_complete', fileCompleteHandler);
                    process.removeListener('llamb_content_ready', contentReadyHandler);
                    process.removeListener('SIGINT', sigintHandler);
                    resolve();
                  }
                } else {
                  // No file output, just wait for render complete
                  if (renderComplete) {
                    // Clean up all listeners and intervals
                    clearInterval(checkInterval);
                    process.removeListener('llamb_render_complete', renderCompleteHandler);
                    process.removeListener('llamb_file_complete', fileCompleteHandler);
                    process.removeListener('llamb_content_ready', contentReadyHandler);
                    process.removeListener('SIGINT', sigintHandler);
                    resolve();
                  }
                }
              }, 500); // Check every 500ms to reduce terminal spam
            });

            // Now it's safe to unmount and exit
            unmount();
            // Exit when done in non-chat mode
            if (!options.chat) {
              exitWhenDone();
            }

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
            
            // Keep spinner alive with a periodic update
            const keepSpinnerAlive = setInterval(() => {
              if (spinner.isSpinning) {
                // Update text periodically to ensure animation continues
                spinner.text = chalk.dim(`Thinking${'.'.repeat(Date.now() % 4)}...`);
              } else {
                clearInterval(keepSpinnerAlive);
              }
            }, 250);

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
            const response1 = await askQuestionWithStreaming(
              question,
              handleStreamingChunk,
              options.model,
              options.provider,
              options.baseUrl,
              options.history,
              fileContent
            );
            
            // Handle the case where we get a cancellation object
            answer = typeof response1 === 'object' && 'cancelled' in response1
              ? response1.partialResponse || ''
              : response1;

            // Mark streaming as complete and clear the intervals
            streamComplete = true;
            clearInterval(progressTimer);
            clearInterval(keepSpinnerAlive);

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
            
            // Keep spinner alive with a periodic update
            const keepSpinnerAlive = setInterval(() => {
              if (spinner.isSpinning) {
                // Update text periodically to ensure animation continues
                spinner.text = chalk.dim(`Thinking${'.'.repeat(Date.now() % 4)}...`);
              } else {
                clearInterval(keepSpinnerAlive);
              }
            }, 250);

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
                clearInterval(keepSpinnerAlive); // Clear the keep-alive interval before stopping spinner
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
            const response2 = await askQuestionWithStreaming(
              question,
              handleStreamingChunk,
              options.model,
              options.provider,
              options.baseUrl,
              options.history,
              fileContent
            );
            
            // Handle the case where we get a cancellation object
            answer = typeof response2 === 'object' && 'cancelled' in response2
              ? response2.partialResponse || ''
              : response2;
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
          
          // Keep spinner alive with a periodic update
          const keepSpinnerAlive = setInterval(() => {
            if (spinner.isSpinning) {
              // Update text periodically to ensure animation continues
              spinner.text = chalk.dim(`Thinking${'.'.repeat(Date.now() % 4)}...`);
            } else {
              clearInterval(keepSpinnerAlive);
            }
          }, 250);
          
          // Call without streaming
          answer = await askQuestion(question, options.model, options.provider, options.baseUrl, options.history, fileContent);
          
          // Stop the spinner and clear the interval
          clearInterval(keepSpinnerAlive);
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
            width: maxWidth
          });

          // Display the answer
          console.log(boxedAnswer);

          // Handle file output
          if (options.output !== undefined) {
            console.log(chalk.dim(`Debug: Non-streaming mode has answer of length ${answer ? answer.length : 0}`));
            try {
              await handleFileOutput(answer, options.output, options.overwrite);
            } catch (error: any) {
              console.error(chalk.red(`Error saving response: ${error.message}`));
            }
          }
        }
      } catch (error: any) {
        console.error(chalk.red('Error:'), error.message);
      
        // Exit when done in non-chat mode with error code
        if (!options.chat) {
          exitWhenDone(1); // Exit with error code 1
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      
      // Exit when done in non-chat mode with error code
      if (!options.chat) {
        exitWhenDone(1); // Exit with error code 1
      }
    }
  });

// Register the prompt management commands
registerPromptCommands(program);

// Provider Management Commands
// Provider add command
program
  .command('provider:add')
  .alias('provider add')
  .description('Add a new provider interactively')
  .action(async () => {
    try {
      // Configure ESC key to cancel
      const cleanupEscHandler = setupEscapeKeyHandler();
      
      // Define interface for provider info
      interface ProviderInfo {
        name: string;
        baseUrl: string;
        requiresAuth: boolean;
        apiKey?: string;
      }

      // First collect basic provider info without API key
      const basicInfo = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Provider name:',
          validate: (input) => input.trim() !== '' ? true : 'Name cannot be empty'
        },
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Base URL:',
          default: 'https://api.openai.com/v1'
        },
        {
          type: 'confirm',
          name: 'requiresAuth',
          message: 'Does this provider require authentication?',
          default: false
        }
      ]) as ProviderInfo;
      
      // Ask for API key separately if authentication is required
      // This ensures we get a valid API key before attempting to fetch models
      if (basicInfo.requiresAuth) {
        const apiKeyPrompt = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'API Key:',
            validate: (input) => input.trim() !== '' ? true : 'API key is required for authenticated providers'
          }
        ]);
        if (!apiKeyPrompt.apiKey) {
          console.error(chalk.red('API key is required for authenticated providers. Aborting.'));
          cleanupEscHandler();
          return;
        }
        basicInfo.apiKey = apiKeyPrompt.apiKey;
      }

      // Try to fetch models for this provider
      console.log(chalk.dim(`Checking if we can fetch available models from ${basicInfo.baseUrl}...`));
      
      let models: string[] = [];
      try {
        // Create a direct fetch function that can pass in the URL and API key
        const directFetch = async () => {
          // First try using OpenAI client directly
          try {
            console.log(chalk.dim(`Using OpenAI client to fetch models from ${basicInfo.baseUrl}`));
            // Get API key for OpenAI
            const apiKey = basicInfo.apiKey || 'dummy-key';
            
            const openai = new OpenAI({
              apiKey: apiKey,
              baseURL: basicInfo.baseUrl,
              dangerouslyAllowBrowser: true, // Disable auto env vars
              defaultHeaders: { "llamb-client": "true" } // Add custom header to identify our client
            });
            
            const response = await openai.models.list();
            const modelIds = response.data.map(model => model.id);
            console.log(chalk.dim(`Found ${modelIds.length} models using OpenAI client`));
            return modelIds;
          } catch (clientError: any) {
            console.log(chalk.yellow(`OpenAI client error: ${clientError.message}`));
            
            // Try using fetch directly for compatibility with non-standard APIs
            console.log(chalk.dim(`Trying direct API fetch for ${basicInfo.name}...`));
            
            const modelsUrl = new URL('/v1/models', basicInfo.baseUrl).toString();
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            
            // Get the API key from basicInfo or KeyManager
            let fetchApiKey = null;
            if (basicInfo.apiKey) {
              fetchApiKey = basicInfo.apiKey;
            }
            
            if (fetchApiKey) {
              headers['Authorization'] = `Bearer ${fetchApiKey}`;
            }
            
            const response = await fetch(modelsUrl, {
              method: 'GET',
              headers,
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.log(chalk.red(`API error (${response.status}): ${errorText}`));
              throw new Error(`HTTP error ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            console.log(chalk.dim('Raw API response:'));
            console.log(chalk.dim(JSON.stringify(data, null, 2)));
            
            // Try to extract models from the response based on different API formats
            
            // OpenAI format
            if (data.data && Array.isArray(data.data)) {
              const models = data.data.map((model: any) => model.id || model.name);
              console.log(chalk.dim(`Found ${models.length} models in OpenAI format`));
              return models;
            }
            
            // LM Studio format - models might be in a different location
            if (data.models && Array.isArray(data.models)) {
              const models = data.models.map((model: any) => model.id || model.name);
              console.log(chalk.dim(`Found ${models.length} models in LM Studio format`));
              return models;
            }
            
            // Ollama format - models might be directly in the root
            if (Array.isArray(data)) {
              const models = data.map((model: any) => model.id || model.name);
              console.log(chalk.dim(`Found ${models.length} models in Ollama format`));
              return models;
            }
            
            // If we can't figure out the format, just return empty array
            console.log(chalk.yellow(`Couldn't extract models from response, unknown format`));
            return [];
          }
        };
        
        // Directly fetch models using the URL and API key
        models = await directFetch();
      } catch (error: any) {
        console.warn(chalk.yellow('Could not fetch models. Using manual input instead.'));
        console.warn(chalk.dim(error.message));
      }
      
      // If we have models, let the user select; otherwise, allow manual input
      let modelAnswer;
      if (models.length > 0) {
        modelAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'defaultModel',
            message: 'Select default model:',
            choices: models,
            default: models[0]
          }
        ]);
      } else {
        modelAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'defaultModel',
            message: 'Default model (no models found, enter manually):',
            default: 'gpt-3.5-turbo'
          }
        ]);
      }
      
      // Combine all answers with proper typing
      const answers: ProviderInfo & { defaultModel: string } = {
        ...basicInfo,
        ...modelAnswer
      };

      // Add the provider
      await addProvider({
        name: answers.name,
        baseUrl: answers.baseUrl,
        defaultModel: answers.defaultModel,
        requiresAuth: answers.requiresAuth,
        apiKey: answers.apiKey
      });

      console.log(chalk.green(`✓ Provider '${answers.name}' added successfully`));
      
      // Clean up the escape handler
      cleanupEscHandler();
    } catch (error: any) {
      console.error(chalk.red('Error adding provider:'), error.message);
      
      // No need to clean up the escape handler here as the process will exit
    }
  });

// Provider edit command
program
  .command('provider:edit')
  .alias('provider edit')
  .description('Edit an existing provider interactively')
  .option('--name <name>', 'Provider name to edit')
  .option('--url <url>', 'New base URL')
  .option('--model <model>', 'New default model')
  .action(async (options) => {
    try {
      // Configure ESC key to cancel
      const cleanupEscHandler = setupEscapeKeyHandler();
      
      // Get all providers
      const providers = getProviders();
      if (providers.length === 0) {
        console.log(chalk.yellow('No providers configured yet.'));
        console.log(chalk.cyan('Use this command to add a provider:'));
        console.log(chalk.bold('  llamb provider:add'));
        return;
      }

      // If name is provided directly, use it; otherwise prompt
      let providerName = options.name;
      if (!providerName) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Select a provider to edit:',
            choices: providers.map(p => p.name)
          }
        ]);
        providerName = answers.provider;
      }

      // Find the provider
      const provider = providers.find(p => p.name === providerName);
      if (!provider) {
        console.error(chalk.red(`Provider '${providerName}' not found.`));
        return;
      }

      // If URL and model are provided directly, use them; otherwise prompt
      if (options.url && options.model) {
        // Non-interactive update
        const updatedProvider = {
          ...provider,
          baseUrl: options.url,
          defaultModel: options.model
        };
        
        await addProvider(updatedProvider); // Reuse add provider to update
        console.log(chalk.green(`✓ Provider '${provider.name}' updated successfully`));
        
        // Clean up the escape handler
        cleanupEscHandler();
      } else {
        // Interactive update
        const urlAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseUrl',
            message: 'Base URL:',
            default: provider.baseUrl
          }
        ]);
        
        // Fetch available models with the (potentially updated) base URL
        console.log(chalk.cyan(`\n===== FETCHING MODELS FROM ${provider.name.toUpperCase()} =====`));
        console.log(chalk.cyan(`✓ Base URL: ${urlAnswer.baseUrl}`));
        
        // Directly use the main getModels function which now has detailed logging
        let models: string[] = [];
        try {
          // Create a temporary provider to fetch models from the updated URL
          const tempProvider = {
            name: provider.name + '_temp',
            baseUrl: urlAnswer.baseUrl,
            defaultModel: 'temp',
            requiresAuth: provider.requiresAuth
          };
          
          // Add the temporary provider
          await addProvider(tempProvider);
          
          console.log(chalk.yellow(`\nWILL NOW FETCH MODELS - DETAILED DEBUG OUTPUT FOLLOWS:\n`));
          
          // Get models from the temp provider - this will output all our debug info 
          models = await getModels(tempProvider.name);
          
          // Clean up the temporary provider
          await deleteProvider(tempProvider.name);
          
          console.log(chalk.green(`\n✓ Completed model fetch attempt\n`));
        } catch (error: any) {
          console.warn(chalk.red(`❌ Error fetching models: ${error.message}`));
        }
        
        // If we have models, let the user select; otherwise, allow manual input
        let modelAnswer;
        if (models.length > 0) {
          modelAnswer = await inquirer.prompt([
            {
              type: 'list',
              name: 'defaultModel',
              message: 'Select default model:',
              choices: models,
              default: models.includes(provider.defaultModel) ? provider.defaultModel : models[0]
            }
          ]);
        } else {
          modelAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'defaultModel',
              message: 'Default model (no models found, enter manually):',
              default: provider.defaultModel
            }
          ]);
        }
        
        // Prompt for API key update if needed
        const apiKeyPrompt = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'updateApiKey',
            message: 'Update API key?',
            default: false,
            when: () => provider.requiresAuth
          },
          {
            type: 'password',
            name: 'apiKey',
            message: 'New API Key:',
            when: (answers) => answers.updateApiKey
          }
        ]);
        
        // Combine all answers
        const answers = {
          ...urlAnswer,
          ...modelAnswer,
          ...apiKeyPrompt
        };

        // Get the API key if needed
        const apiKey = answers.updateApiKey ? answers.apiKey : undefined;

        // Update the provider
        const updatedProvider = {
          ...provider,
          baseUrl: answers.baseUrl,
          defaultModel: answers.defaultModel
        };

        if (apiKey) {
          // @ts-ignore - This is fine since we're explicitly adding the apiKey
          updatedProvider.apiKey = apiKey;
        }
        
        await addProvider(updatedProvider);
        console.log(chalk.green(`✓ Provider '${provider.name}' updated successfully`));
        
        // Clean up the escape handler
        cleanupEscHandler();
      }
    } catch (error: any) {
      console.error(chalk.red('Error editing provider:'), error.message);
    }
  });

// Provider delete command
program
  .command('provider:delete')
  .alias('provider delete')
  .description('Delete a provider')
  .option('--name <name>', 'Provider name to delete')
  .option('--force', 'Delete without confirmation')
  .action(async (options) => {
    try {
      // Configure ESC key to cancel
      const cleanupEscHandler = setupEscapeKeyHandler();
      
      // Get all providers
      const providers = getProviders();
      if (providers.length === 0) {
        console.log(chalk.yellow('No providers configured yet.'));
        return;
      }

      // If name is provided directly, use it; otherwise prompt
      let providerName = options.name;
      if (!providerName) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Select a provider to delete:',
            choices: providers.map(p => p.name)
          }
        ]);
        providerName = answers.provider;
      }

      // Find the provider
      const provider = providers.find(p => p.name === providerName);
      if (!provider) {
        console.error(chalk.red(`Provider '${providerName}' not found.`));
        return;
      }

      // Confirm deletion unless forced
      if (!options.force) {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete the provider '${provider.name}'?`,
            default: false
          }
        ]);

        if (!answers.confirm) {
          console.log(chalk.yellow('Delete cancelled.'));
          return;
        }
      }

      // Delete the provider
      await deleteProvider(provider.name);
      console.log(chalk.green(`✓ Provider '${provider.name}' deleted successfully`));
      
      // Clean up the escape handler
      cleanupEscHandler();
    } catch (error: any) {
      console.error(chalk.red('Error deleting provider:'), error.message);
    }
  });

// Provider API key command
program
  .command('provider:apikey')
  .alias('provider apikey')
  .description('Update a provider\'s API key')
  .option('--provider <name>', 'Provider name')
  .option('--key <key>', 'API key')
  .action(async (options) => {
    try {
      // Configure ESC key to cancel
      const cleanupEscHandler = setupEscapeKeyHandler();
      
      // Get all providers
      const providers = getProviders();
      if (providers.length === 0) {
        console.log(chalk.yellow('No providers configured yet.'));
        console.log(chalk.cyan('Use this command to add a provider:'));
        console.log(chalk.bold('  llamb provider:add'));
        return;
      }

      // If provider and key are provided directly, use them; otherwise prompt
      if (options.provider && options.key) {
        // Non-interactive update
        const provider = providers.find(p => p.name === options.provider);
        if (!provider) {
          console.error(chalk.red(`Provider '${options.provider}' not found.`));
          return;
        }

        // Update the provider
        const updatedProvider = {
          ...provider,
          apiKey: options.key
        };
        
        await addProvider(updatedProvider); // Reuse add provider to update
        console.log(chalk.green(`✓ API key for '${provider.name}' updated successfully`));
        
        // Clean up the escape handler
        cleanupEscHandler();
      } else {
        // Interactive update
        const providerAnswers = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Select a provider:',
            choices: providers.map(p => p.name)
          }
        ]);

        const provider = providers.find(p => p.name === providerAnswers.provider);
        if (!provider) {
          console.error(chalk.red(`Provider '${providerAnswers.provider}' not found.`));
          return;
        }

        if (provider.requiresAuth) {
          console.log(chalk.yellow(`Provider '${provider.name}' requires authentication.`));
          return;
        }

        const keyAnswers = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: `Enter API key for ${provider.name}:`,
            validate: (input) => input.trim() !== '' ? true : 'API key cannot be empty'
          }
        ]);

        // Update the provider
        const updatedProvider = {
          ...provider,
          apiKey: keyAnswers.apiKey
        };
        
        await addProvider(updatedProvider);
        console.log(chalk.green(`✓ API key for '${provider.name}' updated successfully`));
        
        // Clean up the escape handler
        cleanupEscHandler();
      }
    } catch (error: any) {
      console.error(chalk.red('Error updating API key:'), error.message);
    }
  });

// Provider list command
program
  .command('providers')
  .description('List all configured providers')
  .action(async () => {
    try {
      // For listing providers, we don't need escape handling as this is a quick command
      const providers = getProviders();

      if (providers.length === 0) {
        console.log(chalk.yellow('No providers configured yet.'));
        console.log(chalk.cyan('Use this command to add a provider:'));
        console.log(chalk.bold('  llamb provider:add'));
        return;
      }

      // Show a spinner while we collect data
      const spinner = ora({
        text: chalk.dim('Checking providers...'),
        spinner: {
          frames: ['🐑', '🦙'],
          interval: 400
        },
        color: 'yellow'
      }).start();
      
      // Get terminal width
      const termWidth = process.stdout.columns || 80;
      
      // Adjust column widths based on terminal size
      const totalWidth = Math.min(termWidth - 4, 120); // Cap at reasonable max width
      
      // Calculate percentages of total width for each column
      const nameWidth = Math.floor(totalWidth * 0.45); // 45% for name+URL
      const modelWidth = Math.floor(totalWidth * 0.25); // 25% for model
      const modelsWidth = Math.floor(totalWidth * 0.10); // 10% for models count
      const statusWidth = Math.floor(totalWidth * 0.15); // 15% for status
      
      // Get the default provider name
      const defaultProviderName = await getDefaultProvider();
      
      // Update spinner text
      spinner.text = chalk.dim('Collecting provider data...');
      
      // Create a shared abort controller for all health checks
      const abortController = new AbortController();
      
      // Collect provider data in parallel with faster timeouts
      const providerData = await Promise.all(providers.map(async (provider) => {
        // Is this the default provider?
        const isDefault = provider.name === defaultProviderName;
        
        // Use a shorter timeout of 2 seconds for health checks to make the command more responsive
        const healthCheckTimeout = 2000; // 2 seconds
        
        // Run both status check and model count in parallel for online providers
        const [isOnline, modelCount] = await Promise.all([
          checkProviderStatus(provider.name, abortController.signal, healthCheckTimeout),
          getModelCount(provider.name, abortController.signal)
        ]);
        
        const statusDisplay = isOnline ? chalk.green('✓ Online') : chalk.red('✗ Offline');
        const modelCountDisplay = (isOnline && modelCount !== null) ? modelCount.toString() : '-';
        
        return {
          name: provider.name,
          displayName: provider.name + (isDefault ? ' ' + chalk.dim('(default)') : ''),
          model: provider.defaultModel,
          url: provider.baseUrl,
          models: modelCountDisplay,
          status: statusDisplay,
          isDefault
        };
      }));
      
      // Function to format text with ellipsis if too long
      function formatText(text: string, maxLength: number): string {
        if (!text) return '';
        
        // For URLs, try to preserve the domain part
        if (text.startsWith('http')) {
          // If text is a URL and too long for the column
          if (text.length > maxLength - 3) {
            try {
              // Parse the URL to extract meaningful parts
              const url = new URL(text);
              // Extract hostname and path
              const origin = url.origin; // e.g., https://api.openai.com
              const path = url.pathname; // e.g., /v1
              
              // If even the origin is too long, truncate it
              if (origin.length > maxLength - 3) {
                return origin.slice(0, maxLength - 3) + '...';
              }
              
              // If we have some path but the whole URL is too long
              if (path && path !== '/') {
                // Show origin + start of path with ellipsis
                const availableSpace = maxLength - origin.length - 3;
                if (availableSpace > 1) {
                  return origin + path.slice(0, availableSpace) + '...';
                } else {
                  return origin + '...';
                }
              }
              
              // Otherwise just return the origin (base URL without path)
              return origin;
            } catch (e) {
              // If URL parsing fails, fall back to simple truncation
              return text.slice(0, maxLength - 3) + '...';
            }
          }
        }
        
        // Default case for non-URLs or URLs that fit
        return text.length > maxLength - 3 
          ? text.slice(0, maxLength - 3) + '...'
          : text;
      }
      
      // Stop the spinner completely
      spinner.stop();
      
      // Just use console.dir to print provider info directly to avoid formatting issues
      console.log(chalk.bold('\nProvider Information:\n'));
      
      // Display the providers one by one with all their details
      for (const data of providerData) {
        const defaultLabel = data.isDefault ? chalk.yellow(' (default)') : '';
        console.log(chalk.cyan.bold(`Provider: ${data.name}${defaultLabel}`));
        console.log(`URL:      ${data.url}`);
        console.log(`Model:    ${data.model}`);
        console.log(`Models:   ${data.models}`);
        console.log(`Status:   ${data.status}`);
        console.log(''); // Empty line between providers
      }
      
      // Show usage information
      console.log(chalk.cyan('\nUsage:'));
      console.log(`  ${chalk.bold('llamb -p <provider-name>')}          Use a specific provider`);
      console.log(`  ${chalk.bold('llamb provider:edit <provider>')}    Edit a provider`);
      console.log(`  ${chalk.bold('llamb provider:apikey')}             Update API key`);
      console.log(`  ${chalk.bold('llamb provider:default')}            Set default provider\n`);
      
      // We don't need this anymore as the empty providers case is handled at the beginning
    } catch (error: any) {
      console.error(chalk.red('Error listing providers:'), error.message);
    }
  });

// Set default provider command
program
  .command('provider:default')
  .alias('provider default')
  .description('Set the default provider')
  .option('-p, --provider <name>', 'Provider name to set as default')
  .action(async (options) => {
    try {
      // Configure ESC key to cancel
      const cleanupEscHandler = setupEscapeKeyHandler();
      
      // Get all providers
      const providers = getProviders();
      if (providers.length === 0) {
        console.log(chalk.yellow('No providers configured yet.'));
        console.log(chalk.cyan('Use this command to add a provider:'));
        console.log(chalk.bold('  llamb provider:add'));
        return;
      }

      // If provider is provided directly, use it; otherwise prompt
      let providerName = options.provider;
      if (!providerName) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Select default provider:',
            choices: providers.map(p => p.name)
          }
        ]);
        providerName = answers.provider;
      }

      // Check if provider exists
      const provider = providers.find(p => p.name === providerName);
      if (!provider) {
        console.error(chalk.red(`Provider '${providerName}' not found.`));
        return;
      }

      // Now let's update the default model for this provider too
      console.log(chalk.dim(`Fetching models for ${providerName}...`));
      
      // Get current provider to see current URL and API key for direct fetch
      const currentProvider = providers.find(p => p.name === providerName);
      
      if (!currentProvider) {
        console.error(chalk.red(`Provider '${providerName}' not found.`));
        return;
      }
      
      console.log(chalk.dim(`Using URL: ${currentProvider.baseUrl}`));
      
      let models: string[] = [];
      try {
        // Create a direct fetch function that can pass in the URL and API key
        const directFetch = async () => {
          // First try using OpenAI client directly
          try {
            console.log(chalk.dim(`Using OpenAI client to fetch models from ${currentProvider.baseUrl}`));
            // Get the API key from KeyManager
            let apiKey = 'dummy-key';
            if (!currentProvider.requiresAuth) {
              try {
                const providerKey = await KeyManager.getApiKey(currentProvider.name);
                if (providerKey) {
                  apiKey = providerKey;
                }
              } catch (error) {
                console.log(chalk.yellow('Could not get API key, using dummy key'));
              }
            }
            
            const openai = new OpenAI({
              apiKey: apiKey,
              baseURL: currentProvider.baseUrl,
            });
            
            const response = await openai.models.list();
            const modelIds = response.data.map(model => model.id);
            console.log(chalk.dim(`Found ${modelIds.length} models using OpenAI client`));
            return modelIds;
          } catch (clientError: any) {
            console.log(chalk.yellow(`OpenAI client error: ${clientError.message}`));
            
            // Try using fetch directly for compatibility with non-standard APIs
            console.log(chalk.dim(`Trying direct API fetch for ${currentProvider.name}...`));
            
            const modelsUrl = new URL('/v1/models', currentProvider.baseUrl).toString();
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            
            // Get the API key from KeyManager if available
            let fetchApiKey = null;
            try {
              fetchApiKey = await KeyManager.getApiKey(provider.name);
            } catch (error) {
              console.log(chalk.yellow('Could not get API key'));
            }
            
            if (fetchApiKey) {
              headers['Authorization'] = `Bearer ${fetchApiKey}`;
            }
            
            const response = await fetch(modelsUrl, {
              method: 'GET',
              headers,
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.log(chalk.red(`API error (${response.status}): ${errorText}`));
              throw new Error(`HTTP error ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            console.log(chalk.dim('Raw API response:'));
            console.log(chalk.dim(JSON.stringify(data, null, 2)));
            
            // Try to extract models from the response based on different API formats
            
            // OpenAI format
            if (data.data && Array.isArray(data.data)) {
              const models = data.data.map((model: any) => model.id || model.name);
              console.log(chalk.dim(`Found ${models.length} models in OpenAI format`));
              return models;
            }
            
            // LM Studio format - models might be in a different location
            if (data.models && Array.isArray(data.models)) {
              const models = data.models.map((model: any) => model.id || model.name);
              console.log(chalk.dim(`Found ${models.length} models in LM Studio format`));
              return models;
            }
            
            // Ollama format - models might be directly in the root
            if (Array.isArray(data)) {
              const models = data.map((model: any) => model.id || model.name);
              console.log(chalk.dim(`Found ${models.length} models in Ollama format`));
              return models;
            }
            
            // If we can't figure out the format, just return empty array
            console.log(chalk.yellow(`Couldn't extract models from response, unknown format`));
            return [];
          }
        };
        
        // Directly fetch models using the URL and API key
        models = await directFetch();
      } catch (error: any) {
        console.warn(chalk.yellow('Could not fetch models. Using current default model.'));
        console.warn(chalk.dim(error.message));
      }
      
      // If we have models, let the user select a default model
      if (models.length > 0) {
        // currentProvider is already defined above
        
        if (!currentProvider) {
          console.error(chalk.red(`Provider '${providerName}' not found.`));
          return;
        }
        
        const modelAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'defaultModel',
            message: `Select default model for ${providerName}:`,
            choices: models,
            default: models.includes(currentProvider.defaultModel) ? 
                    currentProvider.defaultModel : models[0]
          }
        ]);
        
        // Update the provider with the new default model
        await addProvider({
          name: currentProvider.name,
          baseUrl: currentProvider.baseUrl,
          defaultModel: modelAnswer.defaultModel,
          requiresAuth: currentProvider.requiresAuth
        });
        
        // Set as default provider
        setDefaultProvider(providerName);
        console.log(chalk.green(`✓ Default provider set to '${providerName}' with model '${modelAnswer.defaultModel}'`));
        
        // Clean up the escape handler
        cleanupEscHandler();
      } else {
        // Just set the default provider without changing model
        setDefaultProvider(providerName);
        console.log(chalk.green(`✓ Default provider set to '${providerName}'`));
        
        // Clean up the escape handler
        cleanupEscHandler();
      }
    } catch (error: any) {
      console.error(chalk.red('Error setting default provider:'), error.message);
    }
  });

// Process the command line arguments
program.parse(process.argv);

// If no arguments, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

/**
 * Handle file output based on user preferences with prompts
 */
async function handleFileOutput(content: string, outputPath: string | true, overwrite: boolean = false): Promise<void> {
  // Debug content received with more details
  console.log(chalk.dim(`Debug: handleFileOutput received content of length ${content ? content.length : 0} characters`));
  console.log(chalk.dim(`Debug: Content type: ${typeof content}, First 50 chars: ${content ? content.substring(0, 50).replace(/\n/g, '\\n') + '...' : 'empty'}`));
  
  // Format and clean the content for file output with automatic code block detection
  // The formatOutputContent function will detect code blocks and their language
  const formatResult = formatOutputContent(content, { isFileOutput: true });
  const cleanedContent = formatResult.content;
  const detectedLanguage = formatResult.detectedLanguage;
  const isPureCodeBlock = formatResult.isPureCodeBlock;
  
  // Log the detected language and content type
  if (detectedLanguage) {
    if (isPureCodeBlock) {
      console.log(chalk.dim(`Detected pure code block with language: ${detectedLanguage}`));
    } else {
      console.log(chalk.dim(`Detected code block with language: ${detectedLanguage}, but it's not the only content`));
    }
  }
  try {
    // Prevent auto-close using our new global system
    preventAutoClose.prevent('file output');
    
    // Set up special SIGINT handling just for this operation
    const oldSIGINTListeners = process.listeners('SIGINT');
    process.removeAllListeners('SIGINT');
    
    // Add our own SIGINT handler that only shows a message
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nPlease wait for file operations to complete...'));
    });
    
    let finalPath = typeof outputPath === 'string' ? outputPath : '';

    // If no path is specified (just -o flag), prompt for a filename
    if (!finalPath) {
      let promptResolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      // Generate default filename with appropriate extension based on content
      let defaultExtension = 'txt';
      
      // Only use a different extension if this is a pure code block
      if (detectedLanguage && isPureCodeBlock) {
        // Import the function directly to avoid circular dependencies
        const { getExtensionForLanguage } = await import('../utils/fileUtils.js');
        defaultExtension = getExtensionForLanguage(detectedLanguage);
        console.log(chalk.dim(`Using detected language '${detectedLanguage}' for file extension: .${defaultExtension}`));
      } else if (detectedLanguage && !isPureCodeBlock) {
        console.log(chalk.dim(`Content contains code but also other text, defaulting to .txt extension`));
      }
      
      const defaultFilename = `llamb-response-${Date.now()}.${defaultExtension}`;
      
      try {
        // Set up a promise that will automatically resolve to the default filename after 10 seconds
        const timeoutPromise = new Promise<{filename: string}>((resolve) => {
          timeoutId = setTimeout(() => {
            if (!promptResolved) {
              console.log(chalk.yellow(`\nFilename prompt timed out, using default: ${defaultFilename}`));
              resolve({filename: defaultFilename});
            }
          }, 10000); // 10 seconds timeout for file prompts
        });
        
        // Set up the actual prompt
        const promptPromise = inquirer.prompt([
          {
            type: 'input',
            name: 'filename',
            message: 'Enter filename to save response:',
            default: defaultFilename,
            validate: (input: string) => input.length > 0 ? true : 'Filename cannot be empty'
          }
        ]);
        
        // Race between the user response and the timeout
        const answer = await Promise.race([promptPromise, timeoutPromise]);
        promptResolved = true;
        
        // Clear the timeout if it's still running
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        finalPath = answer.filename;
        
        // Check if the user provided a filename without extension
        if (finalPath && !path.extname(finalPath)) {
          // Only apply a language-specific extension if it's a pure code block
          if (detectedLanguage && isPureCodeBlock) {
            const { getExtensionForLanguage } = await import('../utils/fileUtils.js');
            const suggestedExt = getExtensionForLanguage(detectedLanguage);
            // Add the appropriate extension
            finalPath = `${finalPath}.${suggestedExt}`;
            console.log(chalk.cyan(`Added .${suggestedExt} extension based on detected language: ${finalPath}`));
          } else {
            // For mixed content or no detected language, default to .txt
            finalPath = `${finalPath}.txt`;
            console.log(chalk.cyan(`Added .txt extension to filename: ${finalPath}`));
          }
        }
        
        console.log(chalk.cyan(`Using filename: ${finalPath}`));
      } catch (err) {
        // Clear the timeout if it was interrupted
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // If prompt fails, fall back to a default filename
        finalPath = defaultFilename;
        console.log(chalk.yellow(`Prompt interrupted, using default filename: ${finalPath}`));
      }
    } else if (finalPath && typeof finalPath === 'string' && !path.extname(finalPath)) {
      // If the user specified a filename without extension
      if (detectedLanguage && isPureCodeBlock) {
        // Only use language extension for pure code blocks
        const { getExtensionForLanguage } = await import('../utils/fileUtils.js');
        const suggestedExt = getExtensionForLanguage(detectedLanguage);
        
        // Create a new filename with the detected extension
        const newPath = `${finalPath}.${suggestedExt}`;
        console.log(chalk.cyan(`Added .${suggestedExt} extension based on detected language: ${newPath}`));
        finalPath = newPath;
      } else {
        // For mixed content or no detected language, default to .txt
        const newPath = `${finalPath}.txt`;
        console.log(chalk.cyan(`Added .txt extension to filename: ${newPath}`));
        finalPath = newPath;
      }
    }

    
    // Handle existing files with prompt
    let shouldWrite = true;
    
    if (fileExists(finalPath) && !overwrite) {
      // For the file exists prompt, give the user a chance to respond
      // but don't wait infinitely - set up a timer to auto-select a reasonable default
      let promptResolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      try {
        // Set up a promise that will automatically resolve to "new" after 10 seconds
        const timeoutPromise = new Promise<{action: string}>((resolve) => {
          timeoutId = setTimeout(() => {
            if (!promptResolved) {
              console.log(chalk.yellow('\nPrompt timed out, automatically choosing "Generate a new filename"'));
              resolve({action: 'new'});
            }
          }, 10000); // 10 seconds timeout for file prompts
        });
        
        // Set up the actual prompt
        const promptPromise = inquirer.prompt([
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
        
        // Race between the user response and the timeout
        const answer = await Promise.race([promptPromise, timeoutPromise]);
        promptResolved = true;
        
        // Clear the timeout if it's still running
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (answer.action === 'cancel') {
          console.log(chalk.yellow('File save cancelled.'));
          shouldWrite = false;
        } else if (answer.action === 'new') {
          // Generate a unique filename
          finalPath = generateUniqueFilename(finalPath);
          console.log(chalk.cyan(`Using new filename: ${finalPath}`));
        } else {
          // Overwrite case
          console.log(chalk.cyan(`Overwriting existing file: ${finalPath}`));
        }
      } catch (err) {
        // Clear the timeout if it was interrupted
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // If prompt fails for any reason, automatically use a new filename
        const newPath = generateUniqueFilename(finalPath);
        console.log(chalk.yellow(`Prompt interrupted, using new filename: ${newPath}`));
        finalPath = newPath;
      }
    }

    // Write the file if we should
    if (shouldWrite) {
      try {
        // Debug the content to make sure it's not empty
        console.log(chalk.dim(`Content length: ${cleanedContent.length} characters`));
        if (cleanedContent.length === 0) {
          console.log(chalk.yellow('Warning: Content is empty!'));
          // For debugging
          console.log(chalk.dim(`Original content length: ${content.length} characters`));
        }
        
        // Make sure we don't write empty content
        // If the cleaned content is empty but the original had content, use the original
        const finalContent = cleanedContent.length > 0 ? cleanedContent : content;
        console.log(chalk.dim(`Debug: Final content length: ${finalContent.length}, Using: ${cleanedContent.length > 0 ? 'cleaned' : 'original'}`));
        
        // Write the file with the content
        if (finalContent.length === 0) {
          console.log(chalk.red(`Error: Cannot write empty content to file.`));
          throw new Error('Content is empty, cannot write file');
        }
        writeFile(finalPath, finalContent, true);
        console.log(chalk.green(`✓ Response saved to: ${finalPath} (${finalContent.length} characters)`));
        
        // Signal that file output is complete with file info
        // @ts-ignore - Using custom event
        process.emit('llamb_file_complete', { path: finalPath, size: finalContent.length });
      } catch (error: any) {
        console.error(chalk.red(`Error saving file: ${error.message}`));
        
        // Signal that file output failed but the operation is complete
        // @ts-ignore - Using custom event
        process.emit('llamb_file_complete', { error: error.message });
        
        // Emit content ready event in case it wasn't emitted elsewhere
        // @ts-ignore - Using custom event
        process.emit('llamb_content_ready', { error: 'File operation failed' });
      }
    }
    
    // Restore original SIGINT handlers
    process.removeAllListeners('SIGINT');
    oldSIGINTListeners.forEach(listener => {
      process.on('SIGINT', listener);
    });
    
    // Final exit
    console.log(chalk.dim('File operation complete.'));
    
    // Release the auto-close prevention
    preventAutoClose.release();
    
    // Exit now that everything is complete
    process.exit(0);
  } catch (error: any) {
    // Catch any other errors
    console.error(chalk.red(`Error saving response: ${error.message}`));
    
    // Release the auto-close prevention even on error
    preventAutoClose.release();
    
    process.exit(1);
  }
}

/**
 * Custom prompt helper for continuous conversation
 */
function customPrompt(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  return new Promise((resolve, reject) => {
    rl.question(chalk.bold(prompt) + ' ', (answer) => {
      rl.close();
      resolve(answer);
    });

    // Handle Ctrl+C properly
    rl.on('SIGINT', () => {
      rl.close();
      console.log(chalk.red('\nConversation cancelled by user'));
      exitWhenDone();
      reject(new Error('User cancelled'));
    });
  });
}

/**
 * Handle a single question in the conversation
 */
async function handleQuestion(question: string, options: any, fileContent?: string) {
  try {
    // Check if the provider has a valid API key if needed
    const provider = await getProviderWithApiKey(options.provider);

    if (provider.requiresAuth && !provider.apiKey) {
      console.log(chalk.yellow(`⚠️  Provider '${provider.name}' requires an API key but none is set.`));
      console.log(chalk.cyan('To add an API key interactively, run:'));
      console.log(chalk.bold('  llamb provider:apikey'));
      console.log(chalk.cyan('To add an API key non-interactively, run:'));
      console.log(chalk.bold(`  llamb provider:apikey --provider ${provider.name} --key YOUR_API_KEY`));
      console.log(chalk.cyan('To add a new provider, run:'));
      console.log(chalk.bold('  llamb provider:add'));
      console.log(chalk.cyan('To list available providers, run:'));
      console.log(chalk.bold('  llamb providers'));
      console.log('');

      // Check if any local provider is available as a fallback
      const localProviders = getProviders().filter(p => !p.requiresAuth);
      if (localProviders.length > 0) {
        console.log(chalk.green(`You can use a local provider without an API key, for example:`));
        console.log(chalk.bold(`llamb -p ${localProviders[0].name} "${question}"`));
      }
      throw new Error("No API key found");
    }

    // Get terminal width for the output box
    const terminalWidth = process.stdout.columns || 80;
    const maxWidth = Math.min(terminalWidth - 10, 100);

    // Determine if we should stream (default to true unless explicitly set to false)
    const shouldStream = options.stream !== false;

    // In continuous mode, we'll use the simpler streaming option
    const response = await askQuestionWithStreaming(
      question,
      (chunk: string) => {
        // Simple handling - just print the chunk directly
        process.stdout.write(chunk);
      },
      options.model,
      options.provider,
      options.baseUrl,
      options.history,
      fileContent
    );

    // Handle the case where we get a cancellation object
    const answer = typeof response === 'object' && 'cancelled' in response
      ? response.partialResponse || ''
      : response;

    // If it was cancelled, show a message
    if (typeof response === 'object' && 'cancelled' in response) {
      console.log(chalk.red('\nRequest cancelled by user'));
    }

    console.log('\n');

    // Handle file output if requested
    if (options.output !== undefined) {
      try {
        await handleFileOutput(answer, options.output, options.overwrite);
      } catch (error: any) {
        console.error(chalk.red(`Error saving response: ${error.message}`));
      }
    }

    return answer;
  } catch (error: any) {
    console.error(chalk.red('Error:'), error.message);
    throw error; // Re-throw to allow the parent to handle it
  }
}

/**
 * Starts a continuous conversation mode with the LLM
 */
async function startContinuousConversation(
  initialQuestion: string,
  options: any,
  fileContent?: string
) {
  let conversationActive = true;
  let currentQuestion = initialQuestion;
  let currentFileContent = fileContent;

  // Force disable Ink UI in continuous conversation mode to avoid issues
  if (options.ink !== false) {
    console.log(chalk.dim('Note: Ink UI is disabled in continuous conversation mode for better terminal compatibility.'));
    options.ink = false;
  }

  // Start the conversation with the initial question
  try {
    await handleQuestion(currentQuestion, options, currentFileContent);

    // Continue the conversation until the user exits
    while (conversationActive) {
      // Prompt for the next question
      try {
        console.log(chalk.dim('Ready for follow-up questions. Type /exit to end the conversation.'));
        const followUp = await customPrompt('🦙 Follow-up question (type /exit to end conversation):');

        // Check if the user wants to exit
        if (followUp.toLowerCase() === '/exit' ||
            followUp.toLowerCase() === '/quit' ||
            followUp.trim() === '') {
          console.log(chalk.green('Conversation ended. Thanks for using LLaMB!'));
          conversationActive = false;
          continue;
        }

        // Handle slash commands
        if (followUp.startsWith('/')) {
          const command = followUp.substring(1).toLowerCase();
          
          switch (command) {
            case 'clear':
              const sessionManager = SessionManager.getInstance();
              sessionManager.clearSession();
              console.log(chalk.green('Conversation history cleared.'));
              continue;
              
            case 'new':
              const newSessionManager = SessionManager.getInstance();
              newSessionManager.createNewSession();
              console.log(chalk.green('Started a new conversation.'));
              continue;
              
            case 'history':
              const historySessionManager = SessionManager.getInstance();
              const messages = historySessionManager.getMessages();
              
              if (messages.length === 0) {
                console.log(chalk.yellow('No conversation history yet.'));
                continue;
              }
              
              console.log(chalk.bold('Conversation History:'));
              messages.forEach((message, index) => {
                const role = message.role === 'user' ? 'You' : 'Assistant';
                console.log(`${chalk.bold(role)}: ${message.content}`);
                if (index < messages.length - 1) console.log('');
              });
              continue;
              
            default:
              if (command !== 'exit' && command !== 'quit') {
                console.log(chalk.yellow(`Unknown command: /${command}`));
                console.log(chalk.dim('Available commands: /exit, /clear, /new, /history'));
              } else {
                console.log(chalk.green('Conversation ended. Thanks for using LLaMB!'));
                conversationActive = false;
              }
              continue;
          }
        }

        // Update the current question and file content
        currentQuestion = followUp;
        currentFileContent = undefined; // Only use the file for the initial question
        
        // Process the follow-up question
        await handleQuestion(currentQuestion, options);
      } catch (error: any) {
        if (error.message === 'User cancelled') {
          conversationActive = false;
        } else {
          console.error(chalk.red('Error:'), error.message);
        }
      }
    }
  } catch (error: any) {
    console.error(chalk.red('Error:'), error.message);
  } finally {
    // Ensure we exit when done
    // This helps avoid hanging processes
    exitWhenDone();
  }
}

/**
 * Helper function to exit after a delay
 * This gives the event loop time to finish any ongoing tasks and allows
 * the user to see the content before exiting
 */
function exitWhenDone(code: number = 0) {
  // First, log an empty line to create some separation
  console.log('');
  
  // Add a small visual indicator that we're done
  if (code === 0) {
    console.log(chalk.green('✅ Response complete'));
  }
  
  // Set up a SIGINT handler so we can gracefully exit
  const sigintHandler = () => {
    // Force exit on second SIGINT (Ctrl+C)
    console.log(chalk.yellow('\nForce exiting on user request (Ctrl+C)'));
    process.exit(130); // Standard exit code for SIGINT
  };
  
  // Register SIGINT handler temporarily
  process.once('SIGINT', sigintHandler);
  
  // Check if auto-close is globally prevented by any feature
  if (preventAutoClose.isPrevented()) {
    console.log(chalk.dim('Auto-close prevented, waiting for interactive operations to complete...'));
    return;
  }
  
  // Legacy check for file operations (backwards compatibility)
  // @ts-ignore - accessing custom properties for file handling check
  if (process._llamb_file_output_pending || process._llamb_handling_file) {
    console.log(chalk.dim('File operation pending, waiting to complete...'));
    return;
  }
  
  // Check if inquirer is active (user is being prompted)
  // @ts-ignore - accessing private property for safety check
  const inquirerActive = inquirer.prompts && inquirer.prompts.length > 0;
  
  if (inquirerActive) {
    // Don't exit if there's an active prompt - let the user complete their input
    console.log(chalk.dim('Waiting for user input before exit...'));
    return;
  }
  
  // Wait a short time for the user to read the response before exiting
  setTimeout(() => {
    // Remove our SIGINT handler since we're about to exit
    process.removeListener('SIGINT', sigintHandler);
    
    // Check again if auto-close became prevented
    if (preventAutoClose.isPrevented()) {
      console.log(chalk.dim('Interactive operation started, canceling exit...'));
      return;
    }
    
    // Legacy check for file operations (backwards compatibility)
    // @ts-ignore - accessing custom properties for file handling check
    if (process._llamb_handling_file || process._llamb_file_output_pending) {
      console.log(chalk.dim('File operation started, canceling exit...'));
      return;
    }
    
    // Check one more time if inquirer became active during the timeout
    // @ts-ignore - accessing private property for safety check
    if (inquirer.prompts && inquirer.prompts.length > 0) {
      console.log(chalk.dim('User prompt detected, canceling exit...'));
      return;
    }
    
    process.exit(code);
  }, 500); // 0.5 second delay is enough to ensure output is flushed
}

/**
 * Configure ESC key to cancel inquirer prompts
 * This is used by provider management commands to allow ESC to exit
 */
function setupEscapeKeyHandler() {
  // Set up ESC key to cancel
  console.log(chalk.dim('Press ESC at any time to cancel'));
  
  // Configure inquirer to allow ESC to exit
  // Handle keypress events to detect ESC
  const keypressHandler = (str: string, key: {name: string}) => {
    if (key && key.name === 'escape') {
      // Remove the handler to avoid memory leaks
      process.stdin.off('keypress', keypressHandler);
      console.log(chalk.yellow('\nOperation cancelled.'));
      process.exit(0);
    }
  };
  
  // Add the handler
  process.stdin.on('keypress', keypressHandler);
  
  // Set raw mode if possible
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  
  // Return a function to remove the handler
  return () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.off('keypress', keypressHandler);
  };
}

// Migration: Convert old 'noAuth' to 'requiresAuth' for all providers
(function migrateProviderAuthFlag() {
  const providers = config.get('providers');
  let migrated = false;
  for (const provider of providers) {
    if ('noAuth' in provider) {
      provider.requiresAuth = !provider.noAuth;
      delete provider.noAuth;
      migrated = true;
    }
  }
  if (migrated) {
    config.set('providers', providers);
    console.log(chalk.yellow('Migrated old provider config to new format (requiresAuth).'));
  }
})();