#!/usr/bin/env node

// ES modules-compatible debug script

// Import at the top for ES modules
import { spawnSync } from 'child_process';

// Simple debug script to print out command line arguments and then execute the actual command
console.log('Debug: process.argv =', JSON.stringify(process.argv));

// Extract the real command
const args = process.argv.slice(2);
console.log('Debug: args passed to child process =', JSON.stringify(args));

// Execute the actual command
const result = spawnSync('node', ['dist/cli/index.js', ...args], {
  stdio: 'inherit'
});

if (result.error) {
  console.error('Error executing command:', result.error);
  process.exit(1);
}

process.exit(result.status || 0);