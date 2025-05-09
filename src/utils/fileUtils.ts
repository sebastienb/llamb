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
    const textExtensions = ['txt', 'md', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'conf'];
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