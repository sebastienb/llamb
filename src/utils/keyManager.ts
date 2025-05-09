import keytar from 'keytar';

const SERVICE_NAME = 'llamb';

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
    try {
      return await keytar.deletePassword(SERVICE_NAME, providerName);
    } catch (error) {
      console.error(`Error deleting API key for ${providerName}:`, error);
      return false;
    }
  }
}