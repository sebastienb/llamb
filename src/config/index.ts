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
        },
      ],
    },
    defaultProvider: {
      type: 'string',
      default: 'openai',
    },
  },
});

// If there's an API key in the environment, store it securely
if (process.env.OPENAI_API_KEY) {
  // We'll implement this connection in the services/llm.js file
}

export default config;