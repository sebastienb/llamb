import React from 'react';
import { render } from 'ink';
import { ProvidersTable } from './ProvidersTable.js';
import { LLMProvider } from '../config/index.js';

interface ProviderInfo {
  provider: LLMProvider;
  modelCount: number | null;
  isOnline: boolean;
  isDefault: boolean;
}

export async function renderProvidersTable(
  providers: ProviderInfo[]
): Promise<void> {
  // Create a promise to track when rendering is complete
  return new Promise((resolve) => {
    // Render the component
    const { unmount } = render(<ProvidersTable providers={providers} />);
    
    // Set a small timeout to ensure rendering is complete
    setTimeout(() => {
      unmount();
      resolve();
    }, 100);
  });
}