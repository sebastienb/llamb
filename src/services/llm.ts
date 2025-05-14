import OpenAI from 'openai';
import config, { LLMProvider } from '../config/index.js';
import { KeyManager } from '../utils/keyManager.js';
import { SessionManager, Message } from './sessionManager.js';
import chalk from 'chalk';

// We no longer automatically set API keys from environment variables.
// Users should explicitly set them using the provider:add or provider:apikey commands.
// This gives users more control and visibility over their configuration.

export async function getModels(providerName?: string): Promise<string[]> {
  const provider = await getProviderWithApiKey(providerName);
  
  // Validate base URL using WHATWG URL API
  try {
    new URL(provider.baseUrl);
  } catch (e) {
    console.warn(`Invalid URL format for provider ${provider.name}: ${provider.baseUrl}`);
    throw new Error(`Invalid base URL for provider ${provider.name}`);
  }
  
  try {
    const openai = new OpenAI({
      apiKey: provider.apiKey || 'dummy-key',
      baseURL: provider.baseUrl,
    });
    
    const models = await openai.models.list();
    return models.data.map(model => model.id);
  } catch (error) {
    console.error('Error fetching models:', error);
    throw new Error(`Failed to fetch models from ${provider.name}`);
  }
}

// Define a callback type for streaming
export type StreamCallbackFn = (chunk: string) => void;

// Non-streaming version with file content support
export async function askQuestion(
  question: string,
  modelName?: string,
  providerName?: string,
  customBaseUrl?: string,
  useHistory: boolean = true,
  fileContent?: string
): Promise<string> {
  const fullResponse = await askQuestionWithStreaming(question, null, modelName, providerName, customBaseUrl, useHistory, fileContent);
  return fullResponse;
}

// Streaming version that can handle both streaming and non-streaming
export async function askQuestionWithStreaming(
  question: string,
  streamCallback: StreamCallbackFn | null = null,
  modelName?: string,
  providerName?: string,
  customBaseUrl?: string,
  useHistory: boolean = true,
  fileContent?: string,
  abortController?: AbortController
): Promise<string> {
  const provider = await getProviderWithApiKey(providerName);
  const model = modelName || provider.defaultModel;

  // Use URL API to validate and normalize the base URL
  let actualBaseUrl = customBaseUrl || provider.baseUrl;
  try {
    // Validate URL format using WHATWG URL API
    new URL(actualBaseUrl);
  } catch (e) {
    console.warn(`Invalid URL format: ${actualBaseUrl}, falling back to provider URL`);
    actualBaseUrl = provider.baseUrl;
  }

  try {
    console.log(`🤖 Using model: ${model} from provider: ${provider.name}`);

    const openai = new OpenAI({
      apiKey: provider.apiKey || 'dummy-key',
      baseURL: actualBaseUrl,
    });

    // Get session manager for conversation history
    const sessionManager = SessionManager.getInstance();

    // Prepare messages for the API call
    let messages: Message[] = [];

    // Include conversation history if requested
    if (useHistory) {
      messages = sessionManager.getMessages();
    }

    // Add the current question, possibly with file content
    if (fileContent) {
      const formattedContent = `${question}\n\nFile content:\n\`\`\`\n${fileContent}\n\`\`\``;
      messages.push({ role: 'user', content: formattedContent });
      // Add to session history
      sessionManager.addUserMessage(formattedContent);
    } else {
      // Add just the question if no file content
      messages.push({ role: 'user', content: question });
      // Add to session history
      sessionManager.addUserMessage(question);
    }

    // If streamCallback is provided, use streaming
    if (streamCallback) {
      let fullResponse = '';

      // Create a local AbortController if none was provided
      const localAbortController = abortController || new AbortController();
      
      // Create a flag to track if we've gotten any response
      let hasReceivedResponse = false;
      let providerCheckStarted = false;
      let providerCheckComplete = false;
      let providerIsOnline = false;
      
      // Set up a timeout to check if the provider is online after 3 seconds of no response
      const providerCheckTimeout = setTimeout(async () => {
        if (!hasReceivedResponse && !providerCheckStarted) {
          providerCheckStarted = true;
          
          // Instead of adding to streamCallback, we'll print directly to console
          // This keeps the response area clean and shows status below it
          console.log(chalk.dim('\nChecking if provider is online...'));
          
          try {
            // Create a new client just for the check
            const checkClient = new OpenAI({
              apiKey: provider.apiKey || 'dummy-key',
              baseURL: actualBaseUrl,
            });
            
            // Try to list models as a quick health check
            await checkClient.models.list();
            
            // If we get here, the provider is online but might be processing the request
            providerIsOnline = true;
            console.log(chalk.yellow('Provider is online but taking longer than expected to respond.'));
            console.log(chalk.dim('You can press ESC to cancel or wait for the response.'));
          } catch (checkError) {
            // Provider appears to be offline
            console.log(chalk.yellow('⚠️ Provider appears to be offline or unreachable.'));
            console.log(chalk.dim('You can press ESC to cancel or try another provider with:'));
            console.log(chalk.cyan('llamb provider:default'));
          } finally {
            providerCheckComplete = true;
          }
        }
      }, 3000);

      // Store the original console.error outside the try block
      const originalConsoleError = console.error;
      
      try {
        // Prevent default error logging in OpenAI library
        // This is necessary to avoid showing the verbose stack trace
        console.error = function(err: any, ...args: any[]) {
          // Only suppress errors from OpenAI library
          if (typeof err === 'string' && (
              err.includes('node-fetch') || 
              err.includes('openai') || 
              err.includes('APIConnectionError') ||
              err.includes('Connection error')
            )) {
            // Suppress verbose errors
            return;
          }
          originalConsoleError.call(console, err, ...args);
        };
        
        // Create options object with the abort signal
        const requestOptions = {
          signal: localAbortController.signal
        };

        const stream = await openai.chat.completions.create({
          model,
          messages,
          stream: true,
        }, requestOptions);

        for await (const chunk of stream) {
          // When we get the first chunk, clear the timeout and set the flag
          if (!hasReceivedResponse) {
            hasReceivedResponse = true;
            clearTimeout(providerCheckTimeout);
            
            // If we were in the middle of checking, add a note that response is now streaming
            if (providerCheckStarted) {
              console.log(chalk.green('Response started streaming.'));
            }
          }
          
          // Check if aborted before processing chunk
          if (localAbortController.signal.aborted) {
            break;
          }

          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            streamCallback(content);
            fullResponse += content;
          }
        }
      } catch (error: any) {
        // Clean up the timeout
        clearTimeout(providerCheckTimeout);
        
        // Restore original console.error
        if (typeof originalConsoleError === 'function') {
          console.error = originalConsoleError;
        }
        
        // If the error is due to abort, just return the response so far
        if (error.name === 'AbortError' || localAbortController.signal.aborted) {
          return fullResponse;
        }
        
        // Check if this is a network-related error indicating the provider is offline
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || 
            error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' ||
            error.message?.includes('timeout') || error.type === 'request-timeout' ||
            (error.cause && (
              error.cause.code === 'ECONNREFUSED' || 
              error.cause.code === 'ETIMEDOUT' ||
              error.cause.code === 'ECONNRESET'
            ))) {
          // Print error directly to console
          console.log(chalk.yellow(`\n⚠️ Provider ${provider.name} appears to be offline or unreachable`));
          console.log(chalk.cyan(`Try switching providers: ${chalk.bold('llamb provider:default')}`));
          
          // Force process exit after 500ms to prevent hanging but allow message to be seen
          setTimeout(() => process.exit(1), 500);
          
          // Still throw the error for upstream handlers
          throw new Error(`Provider ${provider.name} appears to be offline or unreachable`);
        }
        
        // For other errors, print a simple message
        console.log(chalk.red(`\n❌ Error with provider ${provider.name}: ${error.message}`));
        
        // Force process exit after 500ms to prevent hanging
        setTimeout(() => process.exit(1), 500);
        throw error;
      }

      // Clean up the timeout
      clearTimeout(providerCheckTimeout);

      // Save the assistant's response to the session
      if (fullResponse) {
        // No need to clean the response since we're not adding status messages to it
        sessionManager.addAssistantMessage(fullResponse);
        return fullResponse;
      }

      return fullResponse || 'No response from LLM';
    } else {
      // Non-streaming version
      // Add a simple timeout for the non-streaming case
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timed out, provider may be offline'));
        }, 10000); // 10 second timeout for non-streaming
      });
      
      // Race between the actual request and the timeout
      const response = await Promise.race([
        openai.chat.completions.create({
          model,
          messages,
        }),
        timeoutPromise
      ]);

      // Ensure we always return a string
      const content = response.choices[0]?.message?.content;
      const result = content ? String(content) : 'No response from LLM';

      // Save the assistant's response to the session
      if (content) {
        sessionManager.addAssistantMessage(result);
      }

      return result;
    }
  } catch (error: any) {
    // Check if this is a network-related error indicating the provider is offline
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || 
        error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' ||
        error.message?.includes('timeout') || error.type === 'request-timeout' ||
        (error.cause && (
          error.cause.code === 'ECONNREFUSED' || 
          error.cause.code === 'ETIMEDOUT' ||
          error.cause.code === 'ECONNRESET'
        ))) {
      throw new Error(`Provider ${provider.name} appears to be offline or unreachable. Try switching providers with 'llamb provider:default'`);
    }
    
    throw new Error(`Failed to get response from ${provider.name}`);
  }
}

// Get provider from config and attach API key from secure storage
export async function getProviderWithApiKey(providerName?: string): Promise<LLMProvider & { apiKey: string | null }> {
  const providers = config.get('providers');
  const defaultProviderName = config.get('defaultProvider');
  const name = providerName || defaultProviderName;
  
  const provider = providers.find((p: LLMProvider) => p.name === name);
  if (!provider) {
    throw new Error(`Provider ${name} not found`);
  }
  
  // Get API key from secure storage
  let apiKey = null;
  if (!provider.noAuth) {
    apiKey = await KeyManager.getApiKey(provider.name);
    
    if (!apiKey) {
      console.warn(`No API key found for provider ${provider.name}. If this is not a local provider, authentication will fail.`);
    }
  }
  
  // Return provider with API key
  return {
    ...provider,
    apiKey: apiKey || null
  };
}

// Standard provider without API key
function getProvider(providerName?: string): LLMProvider {
  const providers = config.get('providers');
  const defaultProviderName = config.get('defaultProvider');
  const name = providerName || defaultProviderName;
  
  const provider = providers.find((p: LLMProvider) => p.name === name);
  if (!provider) {
    throw new Error(`Provider ${name} not found`);
  }
  
  return provider;
}

export function getProviders(): LLMProvider[] {
  // Get providers from config
  const providers = config.get('providers');
  
  // Use URL constructor from WHATWG URL API for URL handling (avoiding punycode)
  // This won't change functionality but will use modern URL processing
  providers.forEach(provider => {
    if (provider.baseUrl) {
      try {
        // Validate URL format using WHATWG URL API
        new URL(provider.baseUrl);
      } catch (e) {
        // If URL is invalid, we just keep the original
        console.warn(`Invalid URL format for provider ${provider.name}: ${provider.baseUrl}`);
      }
    }
  });
  
  return providers;
}

export function getDefaultProvider(): string {
  return config.get('defaultProvider');
}

export async function addProvider(provider: LLMProvider & { apiKey?: string }): Promise<void> {
  const providers = config.get('providers');
  const existingIndex = providers.findIndex((p: LLMProvider) => p.name === provider.name);
  
  // Extract apiKey before storing provider in config
  const apiKey = provider.apiKey;
  const { apiKey: _, ...providerWithoutApiKey } = provider as any;
  
  // Store provider in config (without API key)
  if (existingIndex >= 0) {
    providers[existingIndex] = providerWithoutApiKey;
  } else {
    providers.push(providerWithoutApiKey);
  }
  
  config.set('providers', providers);
  
  // If API key is provided, store it securely
  if (apiKey) {
    await KeyManager.storeApiKey(provider.name, apiKey);
  }
}

export function setDefaultProvider(providerName: string): void {
  const providers = config.get('providers');
  const provider = providers.find((p: LLMProvider) => p.name === providerName);
  
  if (!provider) {
    throw new Error(`Provider ${providerName} not found`);
  }
  
  config.set('defaultProvider', providerName);
}

// Delete a provider by name
export async function deleteProvider(providerName: string): Promise<void> {
  // Get current providers
  const providers = config.get('providers');
  const defaultProvider = config.get('defaultProvider');
  
  // Find the provider to delete
  const providerIndex = providers.findIndex((p: LLMProvider) => p.name === providerName);
  
  if (providerIndex === -1) {
    throw new Error(`Provider ${providerName} not found`);
  }
  
  // Delete the provider from the list
  providers.splice(providerIndex, 1);
  
  // Update providers list
  config.set('providers', providers);
  
  // If we're deleting the default provider, set a new default if available
  if (defaultProvider === providerName) {
    if (providers.length > 0) {
      config.set('defaultProvider', providers[0].name);
    } else {
      config.set('defaultProvider', '');
    }
  }
  
  // Delete the API key from secure storage
  try {
    await KeyManager.deleteApiKey(providerName);
  } catch (error) {
    // Continue even if key deletion fails - it might not exist
    console.warn(`Could not delete API key for ${providerName}, it may not exist`);
  }
}