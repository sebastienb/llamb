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
  requiresAuth?: boolean;
}

export interface ConfigSchema {
  providers: LLMProvider[];
  defaultProvider: string;
  useProgressOnly: boolean;
  useInkUI: boolean;
  jinaReaderApiKey?: string;
}

const config = new Conf<ConfigSchema>({
  projectName: 'llamb',
  schema: {
    providers: {
      type: 'array',
      default: [], // Start with no providers - let users add them
    },
    defaultProvider: {
      type: 'string',
      default: '', // No default provider - will prompt user to add one
    },
    useProgressOnly: {
      type: 'boolean',
      default: false, // By default, stream content rather than showing progress-only
    },
    useInkUI: {
      type: 'boolean',
      default: true, // Use the ink UI by default
    },
    jinaReaderApiKey: {
      type: 'string',
      default: '', // No default Jina Reader API key
    }
  },
});

// If there's an API key in the environment, store it securely
if (process.env.OPENAI_API_KEY) {
  // We'll implement this connection in the services/llm.js file
}

export default config;