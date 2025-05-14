import fs from 'fs';
import path from 'path';

/**
 * Read a file from the specified path
 * 
 * @param filePath - Path to the file to read
 * @returns File content as string
 * @throws Error if file cannot be read or does not exist
 */
export function readFile(filePath: string): string {
  try {
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    // Get file stats to check it's not a directory and to get size
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filePath}`);
    }
    
    // Check the file size
    const fileSizeMB = stats.size / (1024 * 1024);
    const MAX_SIZE_MB = 10; // 10MB limit
    if (fileSizeMB > MAX_SIZE_MB) {
      throw new Error(`File is too large (${fileSizeMB.toFixed(2)}MB). Maximum size is ${MAX_SIZE_MB}MB.`);
    }
    
    // Read the file as a string
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (error: any) {
    // Re-throw with a clearer message
    throw new Error(`Failed to read file: ${error.message}`);
  }
}

/**
 * Check if a file exists
 *
 * @param filePath - Path to check
 * @returns true if file exists, false otherwise
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Write content to a file
 *
 * @param filePath - Path to write the file to
 * @param content - Content to write
 * @param overwrite - Whether to overwrite existing files (default: false)
 * @throws Error if file cannot be written or already exists and overwrite is false
 */
export function writeFile(filePath: string, content: string, overwrite: boolean = false): void {
  try {
    // Check if the file exists and we're not overwriting
    if (fs.existsSync(filePath) && !overwrite) {
      throw new Error(`File already exists: ${filePath}. Use --overwrite to replace it.`);
    }

    // Ensure the directory exists
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    // Write the file
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (error: any) {
    // Re-throw with a clearer message
    throw new Error(`Failed to write file: ${error.message}`);
  }
}

/**
 * Generate a new filename if the original file exists
 *
 * @param filePath - Original file path
 * @returns New file path that doesn't exist yet
 */
export function generateUniqueFilename(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const dir = path.dirname(filePath);

  let counter = 1;
  let newPath: string;

  do {
    newPath = path.join(dir, `${baseName}-${counter}${ext}`);
    counter++;
  } while (fs.existsSync(newPath));

  return newPath;
}

/**
 * Get info about a file (size, type, etc.)
 * 
 * @param filePath - Path to the file
 * @returns Object with file information 
 */
/**
 * Maps programming language identifiers to appropriate file extensions
 * This is used for automatic extension detection when saving code blocks
 */
export const languageToExtension: Record<string, string> = {
  // JavaScript and TypeScript
  'js': 'js',
  'javascript': 'js',
  'ts': 'ts',
  'typescript': 'ts',
  'jsx': 'jsx',
  'tsx': 'tsx',
  
  // HTML/CSS/Web
  'html': 'html',
  'htm': 'html',
  'css': 'css',
  'scss': 'scss',
  'sass': 'sass',
  'less': 'less',
  'xml': 'xml',
  'svg': 'svg',
  
  // Python
  'py': 'py',
  'python': 'py',
  'py3': 'py',
  'python3': 'py',
  'ipynb': 'ipynb',
  
  // Ruby
  'rb': 'rb',
  'ruby': 'rb',
  
  // Java
  'java': 'java',
  
  // C-family
  'c': 'c',
  'cpp': 'cpp',
  'c++': 'cpp',
  'cc': 'cpp',
  'h': 'h',
  'hpp': 'hpp',
  'cs': 'cs',
  'csharp': 'cs',
  
  // PHP
  'php': 'php',
  
  // Go
  'go': 'go',
  'golang': 'go',
  
  // Rust
  'rs': 'rs',
  'rust': 'rs',
  
  // Shell/Bash
  'sh': 'sh',
  'bash': 'sh',
  'shell': 'sh',
  'zsh': 'sh',
  
  // Swift
  'swift': 'swift',
  
  // Kotlin
  'kt': 'kt',
  'kotlin': 'kt',
  
  // Data formats
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yml',
  'toml': 'toml',
  'csv': 'csv',
  'tsv': 'tsv',
  
  // Markdown
  'md': 'md',
  'markdown': 'md',
  
  // SQL
  'sql': 'sql',
  
  // Config
  'ini': 'ini',
  'cfg': 'cfg',
  'conf': 'conf',
  
  // Docker
  'dockerfile': 'Dockerfile',
  'docker': 'Dockerfile',
  
  // Text
  'txt': 'txt',
  'text': 'txt',
  
  // Other
  'diff': 'diff',
  'patch': 'patch',
};

/**
 * Get extension for a language identifier
 * @param language The language identifier from a code block
 * @returns The appropriate file extension (without the dot)
 */
export function getExtensionForLanguage(language: string): string {
  // Normalize the language by removing any leading/trailing whitespace and converting to lowercase
  const normalizedLanguage = language.trim().toLowerCase();
  
  // Check if we have a direct mapping
  if (languageToExtension[normalizedLanguage]) {
    return languageToExtension[normalizedLanguage];
  }
  
  // Handle common variations
  for (const [key, ext] of Object.entries(languageToExtension)) {
    // Check if language starts with one of our keys (useful for variants like "javascript (node)")
    if (normalizedLanguage.startsWith(key)) {
      return ext;
    }
  }
  
  // Default to txt if no match found
  return 'txt';
}

export function getFileInfo(filePath: string): { size: number, extension: string, isText: boolean } {
  try {
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filePath}`);
    }
    
    // Get file extension
    const extension = path.extname(filePath).toLowerCase().substring(1);
    
    // Determine if it's likely a text file
    const textExtensions = Object.values(languageToExtension);
    const isText = textExtensions.includes(extension);
    
    return {
      size: stats.size,
      extension,
      isText
    };
  } catch (error: any) {
    // Re-throw with a clearer message
    throw new Error(`Failed to get file info: ${error.message}`);
  }
}