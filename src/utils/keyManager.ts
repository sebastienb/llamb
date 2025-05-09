import keytar from 'keytar';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import chalk from 'chalk';

const SERVICE_NAME = 'llamb';

/**
 * Check if the system has the required dependencies for keytar
 */
function checkSystemDependencies(): { hasRequiredDeps: boolean; installCommand: string } {
  // Only check dependencies on Linux
  if (os.platform() !== 'linux') {
    return { hasRequiredDeps: true, installCommand: '' };
  }

  let hasRequiredDeps = true;
  let installCommand = '';

  try {
    // Try to detect the Linux distribution
    const isDebian = existsSync('/etc/debian_version');
    const isRHEL = existsSync('/etc/redhat-release');
    const isArch = existsSync('/etc/arch-release');

    // Check for libsecret
    try {
      execSync('ldconfig -p | grep libsecret', { stdio: 'pipe' });
    } catch (error) {
      hasRequiredDeps = false;
      
      if (isDebian) {
        installCommand = 'sudo apt-get install libsecret-1-dev';
      } else if (isRHEL) {
        installCommand = 'sudo dnf install libsecret-devel';
      } else if (isArch) {
        installCommand = 'sudo pacman -S libsecret';
      } else {
        installCommand = 'Install libsecret-1-dev or equivalent for your distribution';
      }
    }
  } catch (error) {
    // If we can't check, assume dependencies are not met
    hasRequiredDeps = false;
    installCommand = 'Install libsecret-1-dev or equivalent for your Linux distribution';
  }

  return { hasRequiredDeps, installCommand };
}

/**
 * KeyManager - Provides secure storage for API keys using the system's keychain
 */
export class KeyManager {
  /**
   * Store an API key securely in the system keychain
   * @param providerName Provider name (used as account identifier)
   * @param apiKey The API key to store
   * @returns Promise that resolves when the operation is complete
   */
  static async storeApiKey(providerName: string, apiKey: string): Promise<void> {
    if (!apiKey) return; // Don't store empty keys
    
    // Check system dependencies
    const { hasRequiredDeps, installCommand } = checkSystemDependencies();
    if (!hasRequiredDeps) {
      console.error(chalk.red('Error: Missing system dependencies required for secure credential storage.'));
      console.error(chalk.yellow('To fix this issue, please install the required dependencies:'));
      console.error(chalk.cyan(installCommand));
      console.error(chalk.yellow('After installing dependencies, run: npm rebuild keytar'));
      throw new Error('Missing system dependencies for secure credential storage');
    }
    
    try {
      await keytar.setPassword(SERVICE_NAME, providerName, apiKey);
    } catch (error) {
      console.error(`Error storing API key for ${providerName}:`, error);
      throw new Error(`Failed to securely store API key for ${providerName}`);
    }
  }

  /**
   * Retrieve an API key from the system keychain
   * @param providerName Provider name (used as account identifier)
   * @returns Promise that resolves with the API key or null if not found
   */
  static async getApiKey(providerName: string): Promise<string | null> {
    // Check system dependencies
    const { hasRequiredDeps, installCommand } = checkSystemDependencies();
    if (!hasRequiredDeps) {
      console.error(chalk.red('Error: Missing system dependencies required for secure credential storage.'));
      console.error(chalk.yellow('To fix this issue, please install the required dependencies:'));
      console.error(chalk.cyan(installCommand));
      console.error(chalk.yellow('After installing dependencies, run: npm rebuild keytar'));
      throw new Error('Missing system dependencies for secure credential storage');
    }
    
    try {
      return await keytar.getPassword(SERVICE_NAME, providerName);
    } catch (error) {
      console.error(`Error retrieving API key for ${providerName}:`, error);
      return null;
    }
  }

  /**
   * Delete an API key from the system keychain
   * @param providerName Provider name (used as account identifier)
   * @returns Promise that resolves with true if deleted successfully, false otherwise
   */
  static async deleteApiKey(providerName: string): Promise<boolean> {
    // Check system dependencies
    const { hasRequiredDeps, installCommand } = checkSystemDependencies();
    if (!hasRequiredDeps) {
      console.error(chalk.red('Error: Missing system dependencies required for secure credential storage.'));
      console.error(chalk.yellow('To fix this issue, please install the required dependencies:'));
      console.error(chalk.cyan(installCommand));
      console.error(chalk.yellow('After installing dependencies, run: npm rebuild keytar'));
      throw new Error('Missing system dependencies for secure credential storage');
    }
    
    try {
      return await keytar.deletePassword(SERVICE_NAME, providerName);
    } catch (error) {
      console.error(`Error deleting API key for ${providerName}:`, error);
      return false;
    }
  }
  
  /**
   * Check if the system has all required dependencies for the keytar module
   * @returns Promise that resolves with true if all dependencies are met, false otherwise
   */
  static checkDependencies(): { hasRequiredDeps: boolean; installCommand: string } {
    return checkSystemDependencies();
  }
}