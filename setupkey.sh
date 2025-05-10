#!/bin/bash
# Simple script to set up provider API key non-interactively
node -e "
const { KeyManager } = require('./dist/utils/keyManager.js');
async function main() {
  try {
    console.log('Setting API key for provider \"$1\" to \"$2\"...');
    await KeyManager.storeApiKey('$1', '$2');
    console.log('API key stored successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}
main();
"