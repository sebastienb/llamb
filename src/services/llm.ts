import OpenAI from 'openai';
import config, { LLMProvider } from '../config/index.js';
import { KeyManager } from '../utils/keyManager.js';

// Initialize OpenAI API with the OpenAI API key from environment if available
if (process.env.OPENAI_API_KEY) {
  KeyManager.storeApiKey('openai', process.env.OPENAI_API_KEY);
}

export async function getModels(providerName?: string): Promise<string[]> {
  const provider = await getProviderWithApiKey(providerName);
  
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

export async function askQuestion(question: string, modelName?: string, providerName?: string, customBaseUrl?: string): Promise<string> {
  const provider = await getProviderWithApiKey(providerName);
  const model = modelName || provider.defaultModel;
  const actualBaseUrl = customBaseUrl || provider.baseUrl;
  
  try {
    console.log(`🤖 Using model: ${model} from provider: ${provider.name}`);
    
    const openai = new OpenAI({
      apiKey: provider.apiKey || 'dummy-key',
      baseURL: actualBaseUrl,
    });
    
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: question }],
    });
    
    // Ensure we always return a string
    const content = response.choices[0]?.message?.content;
    return content ? String(content) : 'No response from LLM';
  } catch (error) {
    console.error('Error asking question:', error);
    throw new Error(`Failed to get response from ${provider.name}`);
  }
}

// Get provider from config and attach API key from secure storage
async function getProviderWithApiKey(providerName?: string): Promise<LLMProvider & { apiKey: string | null }> {
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
  return config.get('providers');
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