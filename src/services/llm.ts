import OpenAI from 'openai';
import config, { LLMProvider } from '../config/index.js';
import { KeyManager } from '../utils/keyManager.js';
import { SessionManager, Message } from './sessionManager.js';
import chalk from 'chalk';

/**
 * Process response text to ensure thinking and reasoning blocks are visible
 * This ensures that models that include thinking or reasoning blocks still show output
 */
function filterThinkBlocks(text: string): string {
  // Check for various reasoning block formats
  const reasoningPatterns = [
    '<reasoning', '</reasoning>', 
    '<reasoning_content>', '</reasoning_content>',
    '[reasoning]', '[/reasoning]',
    '[reasoning_content]', '[/reasoning_content]',
    '<thinking>', '</thinking>',
    '<thinking>', '</thinking>',
    '```reasoning', '```'
  ];
  
  // Log if we find any of the patterns
  for (const pattern of reasoningPatterns) {
    if (text.includes(pattern)) {
      console.log(`Found reasoning pattern "${pattern}" in response`);
      console.log('Content snippet around pattern:', 
        text.substring(Math.max(0, text.indexOf(pattern) - 50), 
                      Math.min(text.length, text.indexOf(pattern) + 100)));
    }
  }
  
  // No filtering - we want to show both the thinking blocks and reasoning_content blocks
  return text;
}

/**
 * Format output content for display or file saving
 * This function:
 * 1. Removes thinking/reasoning blocks and debugging tags
 * 2. Removes code block delimiters when appropriate for file output
 * 3. Cleans up formatting issues like excessive newlines
 * 
 * @param text The text content to format
 * @param options Options to control formatting behavior
 * @returns Formatted text content
 */
export function formatOutputContent(
  text: string, 
  options: { isFileOutput?: boolean } = {}
): { content: string, detectedLanguage?: string, isPureCodeBlock: boolean } {
  // Handle null/undefined input gracefully
  if (!text) return { content: '', isPureCodeBlock: false };
  
  // Ensure text is a string
  const inputText = typeof text === 'string' ? text : String(text || '');
  
  // Log info about the input text for debugging
  console.log(chalk.dim(`Debug: formatOutputContent received ${inputText.length} characters`));
  if (inputText.length > 0) {
    console.log(chalk.dim(`Debug: First 40 chars: ${inputText.substring(0, 40).replace(/\n/g, '\\n')}...`));
  } else {
    console.log(chalk.yellow('Warning: Empty text passed to formatOutputContent'));
    return { content: inputText, isPureCodeBlock: false }; // Return the original text if it's empty
  }
  
  try {
    let cleanedText = inputText;
    
    // Remove 🧠 Reasoning: blocks which are added for streaming
    cleanedText = cleanedText.replace(/\n🧠 Reasoning:.+?(?=\n\n)/gs, '');
    
    // Remove <reasoning>...</reasoning> blocks
    cleanedText = cleanedText.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    
    // Remove <reasoning_content>...</reasoning_content> blocks
    cleanedText = cleanedText.replace(/<reasoning_content>[\s\S]*?<\/reasoning_content>/gi, '');
    
    // Remove <thinking>...</thinking> blocks
    cleanedText = cleanedText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    
    // Remove <claude:...> tags and all content between them
    cleanedText = cleanedText.replace(/<claude:[\s\S]*?>/gi, '');
    
    // Remove [reasoning]...[/reasoning] blocks
    cleanedText = cleanedText.replace(/\[reasoning\][\s\S]*?\[\/reasoning\]/gi, '');
    
    // Remove [reasoning_content]...[/reasoning_content] blocks
    cleanedText = cleanedText.replace(/\[reasoning_content\][\s\S]*?\[\/reasoning_content\]/gi, '');
    
    // Remove ```reasoning...``` blocks
    cleanedText = cleanedText.replace(/```reasoning[\s\S]*?```/gi, '');
    
    // Clean up any remaining double newlines caused by removing blocks
    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
    
    // Variables for code block detection
    let detectedLanguage: string | undefined;
    let isPureCodeBlock = false;
    
    // If cleaning removed all content, log a warning and return original
    if (cleanedText.trim().length === 0 && inputText.trim().length > 0) {
      console.log(chalk.yellow('Warning: Cleaning removed all content! Returning original text.'));
      return { content: inputText, isPureCodeBlock: false };
    }
    
    // Special handling for code blocks - only apply for file outputs
    if (options.isFileOutput) {
      // First check if the entire content is a single code block
      const singleCodeBlockRegex = /^\s*```(?:[\w-]*)?[\s\S]*?```\s*$/;
      
      if (singleCodeBlockRegex.test(cleanedText.trim())) {
        console.log(chalk.dim('Content appears to be a single code block. Removing markdown delimiters...'));
        
        // This is a pure code block response
        isPureCodeBlock = true;
        
        // Extract the content between ``` markers, keeping language identifier if present
        const match = cleanedText.trim().match(/^\s*```(?:[\w-]*)?[\s\n]*([\s\S]*?)```\s*$/);
        
        if (match && match[1]) {
          // Look for language identifier
          const languageMatch = cleanedText.trim().match(/^\s*```([\w-]+)/);
          if (languageMatch && languageMatch[1]) {
            detectedLanguage = languageMatch[1];
            console.log(chalk.dim(`Detected language: ${detectedLanguage}`));
          }
          
          // Use the content inside the code block
          cleanedText = match[1].trim();
          console.log(chalk.dim(`Removed code block delimiters. Content length: ${cleanedText.length} characters`));
        }
      } else {
        // If it's not a single code block, check if it's 95% code blocks by content
        // This helps with responses that are mostly code with minimal explanations
        const codeBlockPattern = /```(?:[\w-]*)?[\s\n]*([\s\S]*?)```/g;
        let match;
        let codeBlocksContent = '';
        const codeBlocks = [];
        
        // Extract all code blocks
        while ((match = codeBlockPattern.exec(cleanedText)) !== null) {
          if (match[1] && match[1].trim().length > 0) {
            codeBlocksContent += match[1];
            codeBlocks.push({
              full: match[0],
              content: match[1],
              start: match.index,
              end: match.index + match[0].length
            });
          }
        }
        
        // Check if code blocks make up more than 95% of the content (by character count)
        if (codeBlocks.length > 0 && codeBlocksContent.length > 0) {
          const codeBlocksPercentage = (codeBlocksContent.length / cleanedText.length) * 100;
          
          console.log(chalk.dim(`Found ${codeBlocks.length} code blocks (${codeBlocksPercentage.toFixed(1)}% of content)`));
          
          // If it's a single code block that makes up almost all of the content (>95%)
          if (codeBlocks.length === 1 && codeBlocksPercentage > 95) {
            // Set pure code block flag - if it's almost 100% code with no significant text around it
            isPureCodeBlock = codeBlocksPercentage > 98;
            
            // Check for language identifier in the code block
            const singleBlockMatch = cleanedText.match(/```([\w-]+)/);
            if (singleBlockMatch && singleBlockMatch[1]) {
              detectedLanguage = singleBlockMatch[1];
              console.log(chalk.dim(`Detected language in dominant code block: ${detectedLanguage}`));
            }
            
            console.log(chalk.dim('Content is dominated by a single code block. Removing markdown delimiters...'));
            cleanedText = codeBlocks[0].content.trim();
          }
          // If there are multiple code blocks and they make up almost all the content
          else if (codeBlocks.length > 1 && codeBlocksPercentage > 95) {
            // Multiple code blocks are NOT considered a "pure" code block for extension purposes
            isPureCodeBlock = false;
            
            // Try to detect language from the first code block
            const firstBlockMatch = cleanedText.match(/```([\w-]+)/);
            if (firstBlockMatch && firstBlockMatch[1]) {
              detectedLanguage = firstBlockMatch[1];
              console.log(chalk.dim(`Detected language from first code block: ${detectedLanguage}`));
            }
            
            console.log(chalk.dim('Content consists mostly of code blocks. Removing markdown delimiters...'));
            
            // If blocks are separated by empty lines, keep the separation
            const processedContent = cleanedText.replace(codeBlockPattern, function(match, codeContent) {
              return codeContent.trim();
            });
            
            cleanedText = processedContent;
          }
        }
      }
    }
    
    console.log(chalk.dim(`Debug: formatOutputContent returning ${cleanedText.length} characters`));
    return { content: cleanedText, detectedLanguage, isPureCodeBlock };
  } catch (error) {
    console.log(chalk.yellow(`Error in formatOutputContent: ${error}`));
    return { content: inputText, isPureCodeBlock: false }; // Return original text on error
  }
}

// We no longer automatically set API keys from environment variables.
// Users should explicitly set them using the provider:add or provider:apikey commands.
// This gives users more control and visibility over their configuration.

export async function getModels(providerName?: string): Promise<string[]> {
  try {
    const provider = await getProviderWithApiKey(providerName);
    
    // Get API key
    let apiKey = 'dummy-key';
    if (!provider.requiresAuth) {
      try {
        apiKey = await KeyManager.getApiKey(provider.name) || 'dummy-key';
      } catch (e) {
        // Silent fail - we'll try with dummy key
      }
    }
    
    // Validate base URL
    try {
      new URL(provider.baseUrl);
    } catch (e) {
      throw new Error(`Invalid base URL for provider ${provider.name}`);
    }
    
    try {
      // Try /v1/models endpoint
      let modelsUrl = new URL('/v1/models', provider.baseUrl).toString();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (!provider.requiresAuth && apiKey !== 'dummy-key') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      // Make the request
      let response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
      });
      
      // Try alternative endpoint if first one fails
      if (!response.ok && response.status === 404) {
        modelsUrl = new URL('/models', provider.baseUrl).toString();
        response = await fetch(modelsUrl, {
          method: 'GET',
          headers,
        });
      }
      
      // Parse response if successful
      if (response.ok) {
        const responseText = await response.text();
        const data = JSON.parse(responseText);
        
        // Extract models from standard OpenAI format
        if (data.object === 'list' && data.data && Array.isArray(data.data)) {
          return data.data.map((model: any) => model.id || model.name);
        }
        
        // Extract models from direct array format
        if (Array.isArray(data)) {
          return data.map((model: any) => model.id || model.name);
        }
        
        // Try other common formats
        for (const key of ['models', 'model_names', 'model_list', 'available_models']) {
          if (data[key] && Array.isArray(data[key])) {
            return data[key].map((item: any) => {
              if (typeof item === 'string') return item;
              if (item && (item.id || item.name)) return item.id || item.name;
              return JSON.stringify(item);
            });
          }
        }
        
        // Deep search for model IDs
        const extractedModels = new Set<string>();
        function findPotentialModels(obj: any) {
          if (!obj) return;
          
          if (typeof obj === 'string' && obj.length > 0) {
            if (obj.match(/^(gpt|llama|gemma|mistral|phi|claude|falcon|orca|yi|qwen)/i)) {
              extractedModels.add(obj);
            }
          } else if (Array.isArray(obj)) {
            obj.forEach(item => findPotentialModels(item));
          } else if (typeof obj === 'object') {
            for (const key in obj) {
              if (key === 'id' || key === 'name' || key === 'model') {
                const value = obj[key];
                if (typeof value === 'string' && value.length > 0) {
                  extractedModels.add(value);
                }
              } else {
                findPotentialModels(obj[key]);
              }
            }
          }
        }
        
        findPotentialModels(data);
        
        if (extractedModels.size > 0) {
          return Array.from(extractedModels);
        }
      }
      
      // Fallback to default model if available
      if (provider.defaultModel) {
        return [provider.defaultModel];
      }
      
      return [];
    } catch (fetchError: any) {
      // Return provider default model if available
      if (provider.defaultModel) {
        return [provider.defaultModel];
      }
      return [];
    }
  } catch (error: any) {
    console.error(chalk.red(`Error fetching models: ${error.message}`));
    return [];
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
  const response = await askQuestionWithStreaming(question, null, modelName, providerName, customBaseUrl, useHistory, fileContent);
  
  // Handle the case where we get a cancellation object
  if (typeof response === 'object' && 'cancelled' in response) {
    return response.partialResponse || '';
  }
  
  return response;
}

// Add static property to function
interface AskQuestionWithStreamingFunction {
  (
    question: string,
    streamCallback: StreamCallbackFn | null,
    modelName?: string,
    providerName?: string,
    customBaseUrl?: string,
    useHistory?: boolean,
    fileContent?: string,
    abortController?: AbortController
  ): Promise<string | { cancelled: boolean, partialResponse: string }>;
  hasShownModelInfo?: boolean;
}

// Streaming version that can handle both streaming and non-streaming
export const askQuestionWithStreaming: AskQuestionWithStreamingFunction = async function(
  question: string,
  streamCallback: StreamCallbackFn | null = null,
  modelName?: string,
  providerName?: string,
  customBaseUrl?: string,
  useHistory: boolean = true,
  fileContent?: string,
  abortController?: AbortController
): Promise<string | { cancelled: boolean, partialResponse: string }> {
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
    // Log for non-streaming only - streaming has its own log
    if (!streamCallback) {
      console.log(`🤖 Using model: ${model} from provider: ${provider.name}`);
    }

    const openai = new OpenAI({
      apiKey: provider.apiKey || 'dummy-key',
      baseURL: actualBaseUrl,
      timeout: 300000, // 5 minutes timeout for GhostLM and other slower providers
      dangerouslyAllowBrowser: true, // Disable auto env vars
      defaultHeaders: { "llamb-client": "true" } // Add custom header to identify our client
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
      
      // Increase the max listeners to avoid warnings
      if (localAbortController.signal && typeof (localAbortController.signal as any).setMaxListeners === 'function') {
        (localAbortController.signal as any).setMaxListeners(50);
      }
      
      // Create a flag to track model info and responses
      // Use a static variable that persists across function calls to prevent duplicate model info
      if (typeof askQuestionWithStreaming.hasShownModelInfo === 'undefined') {
        askQuestionWithStreaming.hasShownModelInfo = false;
      }
      let hasReceivedResponse = false;
      let providerCheckStarted = false;
      let providerCheckComplete = false;
      let providerIsOnline = false;
      
      // Set up a timeout to check if the provider is online after 15 seconds of no response
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
              timeout: 0, // No timeout - allow unlimited time for slow providers
              dangerouslyAllowBrowser: true, // Disable auto env vars
              defaultHeaders: { "llamb-client": "true" } // Add custom header to identify our client
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
      }, 15000); // 15 seconds instead of 3 - GhostLM and other local LLMs might be slower to respond

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
        
        // Don't create a new AbortController if one was provided to avoid memory leaks
        const requestOptions = localAbortController ? {
          signal: localAbortController.signal
        } : {};

        // Set up to collect the streaming reasoning content separately
        let streamedReasoningContent = '';
        let isShowingReasoning = false;
        let previousWasReasoning = false;
        
        // Log once at the start instead of for every chunk - but only if we haven't shown model info in this session
        if (!askQuestionWithStreaming.hasShownModelInfo) {
          console.log(`🤖 Using model: ${model} from provider: ${provider.name}`);
          askQuestionWithStreaming.hasShownModelInfo = true;
        }
        
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

          // Check for content in the standard content field
          const content = chunk.choices[0]?.delta?.content || '';
          
          // Check for reasoning_content in the delta message
          // Use type assertion to handle custom properties in the API response
          const reasoningContent = (chunk.choices[0]?.delta as any)?.reasoning_content || '';
          
          // Track if this chunk contains reasoning content
          const hasReasoningInThisChunk = !!reasoningContent;
          
          // Handle the streaming of both content types
          if (content || reasoningContent) {
            let streamedChunk = '';
            
            // Process reasoning content
            if (reasoningContent) {
              // If this is the first reasoning chunk, add the header
              if (!isShowingReasoning) {
                streamedChunk += '\n🧠 Reasoning: ';
                isShowingReasoning = true;
              }
              
              // Accumulate the reasoning content
              streamedReasoningContent += reasoningContent;
              streamedChunk += reasoningContent;
              previousWasReasoning = true;
            } 
            // Process regular content - but add a separator if switching from reasoning
            else if (content) {
              // If we're transitioning from reasoning to regular content, add a separator
              if (previousWasReasoning && isShowingReasoning) {
                streamedChunk += '\n\n';
                previousWasReasoning = false;
              }
              
              // Check for various formats of reasoning blocks within the content itself
              if (content.includes('<reasoning') || content.includes('</reasoning') || 
                  content.includes('<reasoning_content') || content.includes('</reasoning_content') ||
                  content.includes('thinking:') || content.includes('reasoning:') ||
                  content.includes('<thinking>') || content.includes('</thinking>') ||
                  content.includes('<reasoning>') || content.includes('</reasoning>') ||
                  content.includes('<claude:')) {
                console.log('Found reasoning/thinking block in content chunk:', content);
              }
              
              streamedChunk += content;
            }
            
            if (streamedChunk) {
              streamCallback(streamedChunk);
              fullResponse += streamedChunk;
            }
          }
        }
      } catch (error: any) {
        // Clean up the timeout
        clearTimeout(providerCheckTimeout);
        
        // Restore original console.error
        if (typeof originalConsoleError === 'function') {
          console.error = originalConsoleError;
        }
        
        // If the error is due to abort, add cancelled flag to the response
        if (error.name === 'AbortError' || localAbortController.signal.aborted) {
          // Add a special marker to indicate the response was cancelled
          // This will be used by StreamingResponse to properly handle cancellation
          return { cancelled: true, partialResponse: fullResponse };
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
          // Print warning to console but don't terminate
          console.log(chalk.yellow(`\n⚠️ Provider ${provider.name} appears to be offline or unreachable`));
          console.log(chalk.cyan(`Try switching providers: ${chalk.bold('llamb provider:default')}`));
          console.log(chalk.yellow(`Continuing to wait for a response... Press ESC to cancel.`));
          
          // Return the current response instead of exiting or throwing
          return fullResponse;
        }
        
        // For other errors, print a warning message but don't terminate
        console.log(chalk.red(`\n❌ Error with provider ${provider.name}: ${error.message}`));
        console.log(chalk.yellow(`Continuing to wait for a response... Press ESC to cancel.`));
        
        // Return what we have instead of exiting
        return fullResponse;
      }

      // Clean up the timeout
      clearTimeout(providerCheckTimeout);

      // Save the assistant's response to the session
      if (fullResponse) {
        // Process the response, including <think>...</think> and reasoning_content blocks
        // We're keeping all content visible to the user as it can be useful for debugging and understanding
        const filteredResponse = filterThinkBlocks(fullResponse);
        sessionManager.addAssistantMessage(filteredResponse);
        return filteredResponse;
      }

      return fullResponse || 'No response from LLM';
    } else {
      // Non-streaming version
      // No timeout - just direct API call
      const response = await openai.chat.completions.create({
        model,
        messages,
      });

      // Ensure we always return a string
      const content = response.choices[0]?.message?.content || '';
      // Use type assertion to handle custom properties in the API response
      const reasoningContent = (response.choices[0]?.message as any)?.reasoning_content || '';
      
      // Combine both content and reasoning_content if present
      let result = '';
      
      if (reasoningContent) {
        console.log('Found reasoning_content in non-streaming response:', reasoningContent);
        result += `\n🧠 Reasoning: ${reasoningContent}\n\n`;
      }
      
      result += content || 'No response from LLM';
      
      // Process the response, including <think>...</think> and reasoning_content blocks
      // We keep these blocks visible as they can be useful to the user
      if (result) {
        result = filterThinkBlocks(result);
      }

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
  if (provider.requiresAuth) {
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
  if (provider.requiresAuth && apiKey) {
    await KeyManager.storeApiKey(provider.name, apiKey);
  }
}

export function setDefaultProvider(providerName: string, modelName?: string): void {
  const providers = config.get('providers');
  const provider = providers.find((p: LLMProvider) => p.name === providerName);
  
  if (!provider) {
    throw new Error(`Provider ${providerName} not found`);
  }
  
  // If a model was provided, update the provider's default model
  if (modelName) {
    // Find the provider in the array
    const providerIndex = providers.findIndex((p: LLMProvider) => p.name === providerName);
    
    // Update the provider with the new default model
    if (providerIndex >= 0) {
      providers[providerIndex] = {
        ...providers[providerIndex],
        defaultModel: modelName
      };
      
      // Save the updated providers array
      config.set('providers', providers);
    }
  }
  
  // Set the default provider
  config.set('defaultProvider', providerName);
}

// Check if a provider is online/accessible
export async function checkProviderStatus(providerName?: string, abortSignal?: AbortSignal, timeoutMs: number = 5000): Promise<boolean> {
  try {
    const provider = await getProviderWithApiKey(providerName);
    
    // Use faster DNS/reachability check first before attempting a full API request
    try {
      const controller = new AbortController();
      // Create a local abort controller if none provided
      const signal = abortSignal || controller.signal;
      
      // Set a timeout to abort the request after the specified time
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      // Do a simple HEAD request to check basic connectivity
      const urlObj = new URL(provider.baseUrl);
      const pingResponse = await fetch(urlObj.origin, {
        method: 'HEAD',
        signal,
        // Very short timeout for the initial connectivity check
        headers: { "llamb-client": "true" }
      });
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      // If we can't even reach the host, the provider is definitely offline
      if (!pingResponse.ok && pingResponse.status >= 500) {
        return false;
      }
    } catch (pingError) {
      // If we can't connect at all, the provider is offline
      return false;
    }
    
    // If basic connectivity works, proceed with the API check
    // Create a client for the check
    const openai = new OpenAI({
      apiKey: provider.apiKey || 'dummy-key',
      baseURL: provider.baseUrl,
      timeout: timeoutMs, // Use specified timeout for model list check
      dangerouslyAllowBrowser: true, // Disable auto env vars
      defaultHeaders: { "llamb-client": "true" } // Add custom header to identify our client
    });
    
    // Try to list models as a quick health check
    await openai.models.list();
    
    // If we get here, the provider is online
    return true;
  } catch (error) {
    // Provider is offline or unreachable
    return false;
  }
}

// Get model count for a provider
export async function getModelCount(providerName?: string, abortSignal?: AbortSignal): Promise<number | null> {
  try {
    const provider = await getProviderWithApiKey(providerName);
    
    // Create a client for direct model listing
    let apiKey = null;
    try {
      apiKey = provider.requiresAuth ? await KeyManager.getApiKey(provider.name) : 'dummy-key';
    } catch (e) {
      // Silent fail - we'll try with dummy key if needed
      apiKey = 'dummy-key';
    }
    
    // Create a client with appropriate timeout
    const openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: provider.baseUrl,
      timeout: 5000, // 5 second timeout for model list
      dangerouslyAllowBrowser: true,
      defaultHeaders: { "llamb-client": "true" }
    });
    
    try {
      // Try to get models directly to count them
      const modelsResponse = await openai.models.list();
      return modelsResponse.data.length;
    } catch (error) {
      // Fall back to standard getModels which has more robust parsing
      const models = await getModels(providerName);
      return models.length;
    }
  } catch (error) {
    return null;
  }
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