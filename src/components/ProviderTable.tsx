import React, { FC } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

// ink-table has TypeScript issues, so we'll use a simple table component instead
// This is a simplified version of what we want to achieve
interface TableRow {
  [key: string]: string;
}

interface ProviderData {
  name: string;
  model: string;
  url: string;
  models: string;
  status: string;
  isDefault: boolean;
}

interface ProviderTableProps {
  providers: ProviderData[];
  defaultProvider: string;
}

const ProviderTable: FC<ProviderTableProps> = ({ providers, defaultProvider }) => {
  // Format data for display
  const tableData = providers.map(provider => {
    const isDefaultIndicator = provider.isDefault ? ' (default)' : '';

    return {
      'Provider': chalk.bold(provider.name) + chalk.dim(isDefaultIndicator),
      'Model': provider.model,
      'Models': provider.models,
      'Status': provider.status,
      // Hidden column for sorting, not displayed
      '_url': provider.url
    };
  });

  const tableConfig = {
    columns: [
      { name: 'Provider', width: 20 },
      { name: 'Model', width: 20 },
      { name: 'Models', width: 8 },
      { name: 'Status', width: 10 }
    ],
    padding: {
      top: 0,
      bottom: 0,
      left: 1,
      right: 1
    }
  };

  // If we have URL info, show it as subtable rows
  const urlRows = providers.map(provider => {
    return {
      'Provider': chalk.dim(`↳ ${provider.url}`),
      'Model': '',
      'Models': '',
      'Status': ''
    };
  });

  // Interleave the main rows with URL rows
  const combinedData: Record<string, string>[] = [];
  tableData.forEach((row, index) => {
    combinedData.push(row);
    combinedData.push(urlRows[index]);
  });

  // Instead of complex table borders, let's use a simpler approach with Text components
  // to ensure consistent rendering across different terminals
  
  // Create column widths for table layout
  const colWidths = {
    provider: 20,
    model: 20,
    models: 8,
    status: 10
  };
  const totalWidth = colWidths.provider + colWidths.model + colWidths.models + colWidths.status + 5; // +5 for border chars
  
  // Helper to create horizontal borders
  const horizontalBorder = (char: string, start: string, middle: string, end: string) => {
    return (
      <Text>
        {start}
        {char.repeat(colWidths.provider)}
        {middle}
        {char.repeat(colWidths.model)}
        {middle}
        {char.repeat(colWidths.models)}
        {middle}
        {char.repeat(colWidths.status)}
        {end}
      </Text>
    );
  };

  // Helper for creating data rows
  const createDataRow = (p: React.ReactNode | string, m: React.ReactNode | string, count: React.ReactNode | string, s: React.ReactNode | string) => {
    return (
      <Box>
        <Text>{'│ '}</Text>
        <Box width={colWidths.provider - 1}>{p}</Box>
        <Text>{'│ '}</Text>
        <Box width={colWidths.model - 1}>{m}</Box>
        <Text>{'│ '}</Text>
        <Box width={colWidths.models - 1}>{count}</Box>
        <Text>{'│ '}</Text>
        <Box width={colWidths.status - 1}>{s}</Box>
        <Text>{'│'}</Text>
      </Box>
    );
  };
  
  // Create table rows
  const rows: React.ReactNode[] = [];
  
  // Top border
  rows.push(horizontalBorder('─', '┌', '┬', '┐'));
  
  // Header row
  rows.push(createDataRow(
    <Text bold>Provider</Text>,
    <Text bold>Model</Text>,
    <Text bold>Models</Text>,
    <Text bold>Status</Text>
  ));
  
  // Header separator
  rows.push(horizontalBorder('─', '├', '┼', '┤'));
  
  // Provider rows
  for (let i = 0; i < tableData.length; i++) {
    // Provider data
    rows.push(createDataRow(
      tableData[i].Provider,
      tableData[i].Model,
      tableData[i].Models,
      tableData[i].Status
    ));
    
    // URL data
    rows.push(createDataRow(
      urlRows[i].Provider,
      urlRows[i].Model,
      urlRows[i].Models,
      urlRows[i].Status
    ));
    
    // Add separator between providers (except after last one)
    if (i < tableData.length - 1) {
      rows.push(horizontalBorder('─', '├', '┼', '┤'));
    }
  }
  
  // Bottom border
  rows.push(horizontalBorder('─', '└', '┴', '┘'));
  
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Configured Providers:</Text>
      </Box>
      {rows.map((row, i) => (
        <Box key={i}>{row}</Box>
      ))}
    </Box>
  );
};

export default ProviderTable;