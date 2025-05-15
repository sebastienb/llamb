import React from 'react';
import { render } from 'ink';
import ProviderTable from './ProviderTable.js';
import { LLMProvider } from '../config/index.js';

interface ProviderData {
  name: string;
  model: string;
  url: string;
  models: string;
  status: string;
  isDefault: boolean;
}

export async function renderProviderTable(
  providers: Array<{
    provider: LLMProvider,
    modelCount: number | null,
    isOnline: boolean
  }>,
  defaultProvider: string
): Promise<void> {
  // Format the data for the table
  const data: ProviderData[] = providers.map(item => {
    const { provider, modelCount, isOnline } = item;

    return {
      name: provider.name,
      model: provider.defaultModel,
      url: provider.baseUrl,
      models: modelCount !== null ? modelCount.toString() : '-',
      status: isOnline ? '✓ Online' : '✗ Offline',
      isDefault: provider.name === defaultProvider
    };
  });

  // Create a promise to track when rendering is done
  return new Promise((resolve) => {
    // Render the table
    const { unmount } = render(<ProviderTable providers={data} defaultProvider={defaultProvider} />);

    // Set a small delay to ensure render completes
    setTimeout(() => {
      unmount();
      resolve();
    }, 100);
  });
}