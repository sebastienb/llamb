#!/usr/bin/env node

// This is a test script to verify the dependency checks work properly
import { KeyManager } from './dist/utils/keyManager.js';

// Run the check
const { hasRequiredDeps, installCommand } = KeyManager.checkDependencies();

console.log('Dependency check results:');
console.log('------------------------');
console.log(`Required dependencies installed: ${hasRequiredDeps ? 'Yes' : 'No'}`);
if (!hasRequiredDeps) {
  console.log(`Installation command: ${installCommand}`);
}