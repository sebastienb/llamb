import config from '../config/index.js';
import chalk from 'chalk';

/**
 * Fetches content from a URL using Jina Reader
 * @param url URL to fetch content from
 * @returns Markdown content from the URL
 */
export async function fetchJinaReader(url: string): Promise<string> {
  try {
    // Get API key from config if available
    const apiKey = config.get('jinaReaderApiKey');
    
    // Construct the Jina Reader URL
    const jinaUrl = `https://r.jina.ai/${url}`;
    
    // Set up headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add authorization header if API key is available
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    // Make the request to Jina Reader
    const response = await fetch(jinaUrl, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch content: ${response.status} ${response.statusText}`);
    }
    
    // Get response text
    const content = await response.text();
    
    return content;
  } catch (error: any) {
    console.error(chalk.red('Error fetching content from Jina Reader:'), error.message);
    throw new Error(`Failed to fetch content from ${url}: ${error.message}`);
  }
}

/**
 * Set the Jina Reader API key
 * @param apiKey The API key to set
 */
export function setJinaReaderApiKey(apiKey: string): void {
  config.set('jinaReaderApiKey', apiKey);
}

/**
 * Get the Jina Reader API key
 * @returns The API key or an empty string if not set
 */
export function getJinaReaderApiKey(): string {
  return config.get('jinaReaderApiKey') || '';
}