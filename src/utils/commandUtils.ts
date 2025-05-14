/**
 * Utilities for handling command detection and execution in code blocks
 */

/**
 * Languages that are likely to contain executable terminal commands
 */
const EXECUTABLE_LANGUAGES = [
  'bash',
  'sh',
  'shell',
  'zsh',
  'console',
  'terminal',
  'cmd',
  'powershell',
  'ps1',
  'command',
  'commandline'
];

/**
 * Detects if a code block contains executable commands
 * @param language The language specified for the code block
 * @param code The content of the code block
 * @returns Boolean indicating if this looks like an executable command
 */
export function isExecutableCodeBlock(language: string | null | undefined, code: string | null | undefined): boolean {
  console.log(`isExecutableCodeBlock checking - language: ${language}, code length: ${code?.length || 0}`);

  // First check for code existence
  if (!code || typeof code !== 'string') {
    console.log('Code is null, undefined, or not a string - not executable');
    return false;
  }

  // Check if the language is in our list of executable languages - force truthy comparison
  if (language && EXECUTABLE_LANGUAGES.indexOf(language.toLowerCase()) >= 0) {
    console.log(`Language ${language} is recognized as executable`);
    return true;
  }

  // Check if the code is empty
  if (code.trim().length === 0) {
    console.log('Code is empty - not executable');
    return false;
  }

  // If it's not labeled or not a shell language but starts with common
  // shell prompt characters, it might still be a command
  if (code.trim().match(/^[$>]\s+.+/)) {
    console.log('Code starts with shell prompt character - executable');
    return true;
  }

  // Make a more generous pattern for common commands
  const commonCommandPattern = /(^|\n)(ls|mkdir|cd|cp|mv|rm|git|npm|yarn|docker|kubectl|cat|echo|touch|wget|curl)\s+/;
  if (code.match(commonCommandPattern)) {
    console.log('Code contains common command pattern - executable');
    return true;
  }

  // Any line with a pipe is likely a command
  if (code.match(/\|\s*(grep|awk|sed|sort|tee|cut|tr|head|tail)/)) {
    console.log('Code contains pipe with common utilities - executable');
    return true;
  }

  console.log('Not recognized as an executable command');
  return false;
}

/**
 * Extracts the actual command from a code block
 * Removes prompt symbols and comment lines
 * @param code The content of the code block
 * @returns Cleaned command string
 */
export function extractCommand(code: string | null | undefined): string {
  // Handle null or undefined
  if (!code || typeof code !== 'string') {
    return '';
  }

  // Split into lines
  const lines = code.split('\n');

  // Filter out comments and process each line
  const commandLines = lines
    .filter(line => !line.trim().startsWith('#') && line.trim().length > 0)
    .map(line => {
      // Remove common prompt indicators like '$ ', '> ', etc.
      return line.replace(/^[$>]\s+/, '');
    });

  // Join back into a multiline command if needed
  return commandLines.join('\n');
}

/**
 * Formats a command for display with a prompt indicator
 * @param command The command to format
 * @returns Formatted command with prompt indicator
 */
export function formatCommandWithPrompt(command: string | null | undefined): string {
  // Handle null or undefined
  if (!command || typeof command !== 'string') {
    return '';
  }

  const lines = command.split('\n');

  // Add prompt to each line
  return lines
    .map((line) => `$ ${line}`)
    .join('\n');
}