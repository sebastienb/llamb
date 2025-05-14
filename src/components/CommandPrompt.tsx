import React, { FC, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import clipboard from 'clipboardy';
import { extractCommand } from '../utils/commandUtils.js';

interface CommandPromptProps {
  codeBlock: string;
  language: string;
}

/**
 * A component that displays a console prompt icon next to code blocks
 * and provides functionality to copy commands to clipboard or prepare them
 * for execution in the terminal.
 */
const CommandPrompt: FC<CommandPromptProps> = ({ codeBlock, language }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  // Extract the actual command from the code block
  const command = extractCommand(codeBlock);

  // Handle keyboard input for interaction
  useInput((input, key) => {
    if (isHovered && key.return) {
      handleCopyToClipboard();
    } else if (input === 'c' && isHovered) {
      handleCopyToClipboard();
    }
  });

  // Copy the command to clipboard
  const handleCopyToClipboard = async () => {
    try {
      await clipboard.write(command);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <Box marginLeft={1} marginTop={1} marginBottom={1} flexDirection="column">
      <Box>
        {/* Console prompt icon (>_) with hover effect */}
        <Text
          color={isHovered ? 'green' : 'gray'}
          backgroundColor={isHovered ? 'black' : undefined}
          bold
        >
          {'>_'}
        </Text>

        {/* Label text showing hint */}
        <Text color={isCopied ? 'green' : 'gray'} dimColor={!isCopied}>
          {isCopied
            ? ' ✓ Copied to clipboard!'
            : ' Click to copy command'}
        </Text>
      </Box>

      {/* Show tooltip explaining what this does */}
      {isHovered && (
        <Box marginTop={1}>
          <Text dimColor italic>
            Copy command to clipboard for pasting into terminal
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default CommandPrompt;