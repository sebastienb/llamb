import OpenAI from 'openai';
import config, { LLMProvider } from '../config/index.js';
import { KeyManager } from '../utils/keyManager.js';
import { SessionManager, Message } from './sessionManager.js';

// Initialize OpenAI API with the OpenAI API key from environment if available
if (process.env.OPENAI_API_KEY) {
  KeyManager.storeApiKey('openai', process.env.OPENAI_API_KEY);
}

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
  fileContent?: string
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

      const stream = await openai.chat.completions.create({
        model,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          streamCallback(content);
          fullResponse += content;
        }
      }

      // Save the assistant's response to the session
      if (fullResponse) {
        sessionManager.addAssistantMessage(fullResponse);
      }

      return fullResponse || 'No response from LLM';
    } else {
      // Non-streaming version
      const response = await openai.chat.completions.create({
        model,
        messages,
      });

      // Ensure we always return a string
      const content = response.choices[0]?.message?.content;
      const result = content ? String(content) : 'No response from LLM';

      // Save the assistant's response to the session
      if (content) {
        sessionManager.addAssistantMessage(result);
      }

      return result;
    }
  } catch (error) {
    console.error('Error asking question:', error);
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