import Conf from 'conf';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface LLMProvider {
  name: string;
  baseUrl: string;
  // apiKey will be stored securely and not in this config
  defaultModel: string;
  // Used only for local providers with no auth
  noAuth?: boolean;
}

export interface ConfigSchema {
  providers: LLMProvider[];
  defaultProvider: string;
  useProgressOnly: boolean;
  useInkUI: boolean;
}

const config = new Conf<ConfigSchema>({
  projectName: 'llamb',
  schema: {
    providers: {
      type: 'array',
      default: [
        {
          name: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          defaultModel: 'gpt-3.5-turbo',
          noAuth: false, // Explicitly mark as requiring auth
        },
        {
          name: 'ollama',
          baseUrl: 'http://localhost:11434/v1',
          defaultModel: 'llama2',
          noAuth: true, // Local provider that doesn't need auth
        }
      ],
    },
    defaultProvider: {
      type: 'string',
      default: 'ollama', // Set default to local provider that doesn't need auth
    },
    useProgressOnly: {
      type: 'boolean',
      default: false, // By default, stream content rather than showing progress-only
    },
    useInkUI: {
      type: 'boolean',
      default: true, // Use the ink UI by default
    }
  },
});

// If there's an API key in the environment, store it securely
if (process.env.OPENAI_API_KEY) {
  // We'll implement this connection in the services/llm.js file
}

export default config;