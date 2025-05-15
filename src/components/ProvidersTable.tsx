import React, { FC } from 'react';
import { Box, Text } from 'ink';
import { SimpleTable } from './SimpleTable.js';
import chalk from 'chalk';

interface ProviderInfo {
  provider: {
    name: string;
    defaultModel: string;
    baseUrl: string;
    noAuth?: boolean;
  };
  modelCount: number | null;
  isOnline: boolean;
  isDefault: boolean;
}

interface ProviderTableProps {
  providers: ProviderInfo[];
}

const formatModelCount = (count: number | null): string => {
  return count !== null ? count.toString() : '-';
};

const truncate = (text: string, length: number): string => {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.slice(0, length - 3) + '...';
};

export const ProvidersTable: FC<ProviderTableProps> = ({ providers }) => {
  // Define columns
  const columns = [
    { name: 'Provider', width: 18 },
    { name: 'Model', width: 20 },
    { name: 'Models', width: 8 },
    { name: 'Status', width: 10 }
  ];
  
  // Create formatted data for display
  const tableData: Array<Record<string, string>> = [];
  
  providers.forEach((info) => {
    // Provider cell: name (with default) and base URL below
    const nameWithDefault = info.isDefault 
      ? `${info.provider.name} ${chalk.dim('(default)')}` 
      : info.provider.name;
    const providerCell = `${nameWithDefault}\n${chalk.dim(`  ↳ ${truncate(info.provider.baseUrl, columns[0].width - 4)}`)}`;
    tableData.push({
      'Provider': providerCell,
      'Model': truncate(info.provider.defaultModel, columns[1].width - 2),
      'Models': formatModelCount(info.modelCount),
      'Status': info.isOnline ? chalk.green('✓ Online') : chalk.red('✗ Offline')
    });
  });
  
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Configured Providers:</Text>
      </Box>
      <SimpleTable data={tableData} columns={columns} />
    </Box>
  );
};