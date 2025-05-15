import React, { FC } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

interface TableColumn {
  name: string;
  width: number;
}

interface SimpleTableProps {
  data: Array<Record<string, any>>;
  columns: TableColumn[];
}

// A simple table component that doesn't rely on ink-table
export const SimpleTable: FC<SimpleTableProps> = ({ data, columns }) => {
  // Calculate the total width of the table
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0) + columns.length + 1;
  
  // Create horizontal line with proper column spacing
  const horizontalLine = (char: string, intersection: string) => {
    return (
      <Text>
        {'┌'}
        {columns.map((col, i) => {
          const border = i === columns.length - 1 ? '┐' : intersection;
          return `${'─'.repeat(col.width)}${border}`;
        }).join('').replace(/┬$/, '┐')}
      </Text>
    );
  };
  
  // Create horizontal line with proper column spacing
  const middleLine = () => {
    return (
      <Text>
        {'├'}
        {columns.map((col, i) => {
          const border = i === columns.length - 1 ? '┤' : '┼';
          return `${'─'.repeat(col.width)}${border}`;
        }).join('').replace(/┼$/, '┤')}
      </Text>
    );
  };
  
  // Create bottom line
  const bottomLine = () => {
    return (
      <Text>
        {'└'}
        {columns.map((col, i) => {
          const border = i === columns.length - 1 ? '┘' : '┴';
          return `${'─'.repeat(col.width)}${border}`;
        }).join('').replace(/┴$/, '┘')}
      </Text>
    );
  };
  
  // Create a row with the given values, supporting multi-line cells
  const dataRow = (rowData: Record<string, any>) => {
    // Split each cell into lines
    const cellLines = columns.map(col => {
      const value = rowData[col.name] || '';
      return value.toString().split('\n');
    });
    // Determine the max number of lines in this row
    const maxLines = Math.max(...cellLines.map(lines => lines.length));
    // Pad each cell's lines to maxLines
    const paddedCellLines = cellLines.map((lines, i) => {
      const padLength = maxLines - lines.length;
      return lines.concat(Array(padLength).fill(''));
    });
    // Render each line as a table row
    return (
      <React.Fragment>
        {Array.from({ length: maxLines }).map((_, lineIdx) => (
          <Text key={lineIdx}>
            {'│'}
            {columns.map((col, colIdx) => {
              const line = paddedCellLines[colIdx][lineIdx] || '';
              return `${line.padEnd(col.width)}│`;
            }).join('')}
          </Text>
        ))}
      </React.Fragment>
    );
  };
  
  // Generate our rows with headers and data
  return (
    <Box flexDirection="column">
      {/* Top border */}
      {horizontalLine('─', '┬')}
      
      {/* Header row */}
      <Text>
        {'│'}
        {columns.map(col => {
          return `${chalk.bold(col.name.padEnd(col.width))}│`;
        }).join('')}
      </Text>
      
      {/* Header separator */}
      {middleLine()}
      
      {/* Data rows */}
      {data.map((row, i) => (
        <Box key={i} flexDirection="column">
          {dataRow(row)}
          {i < data.length - 1 && middleLine()}
        </Box>
      ))}
      
      {/* Bottom border */}
      {bottomLine()}
    </Box>
  );
};