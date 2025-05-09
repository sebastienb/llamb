#!/usr/bin/env node

// Simple debug script to print out command line arguments and then execute the actual command
console.log('Debug: process.argv =', JSON.stringify(process.argv));

// Extract the real command
const args = process.argv.slice(2);
console.log('Debug: args passed to child process =', JSON.stringify(args));

// Now execute the actual Node.js command - this needs to be at the top for ES modules
import { spawnSync } from 'child_process';

// Now let's execute the command
const result = spawnSync('node', ['dist/cli/index.js', ...args], {
  stdio: 'inherit'
});

if (result.error) {
  console.error('Error executing command:', result.error);
  process.exit(1);
}

process.exit(result.status || 0);