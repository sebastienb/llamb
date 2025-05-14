// Basic test file for PromptManager
// Run with: node src/test/promptManager.test.js

import { PromptManager } from '../services/promptManager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';

// Test directory where test prompts will be stored
const TEST_DIR = path.join(os.homedir(), '.llamb', 'prompts', 'test');

// Create test directory if it doesn't exist
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

// Clean up any existing test files
function cleanupTestFiles() {
  if (fs.existsSync(TEST_DIR)) {
    const files = fs.readdirSync(TEST_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(TEST_DIR, file));
    }
    console.log('✓ Cleaned up test files');
  }
}

// Function to run all tests
async function runTests() {
  console.log('Running PromptManager tests...');
  
  const promptManager = PromptManager.getInstance();
  
  // Get the initial prompt count for comparison
  const initialPrompts = promptManager.listPrompts();
  const initialCount = initialPrompts.length;
  
  console.log(`Initial prompt count: ${initialCount}`);
  
  // Test 1: Create a new prompt
  try {
    const testPromptName = 'test-prompt';
    const testContent = 'This is a test prompt with {input} placeholder for testing.';
    
    promptManager.createPrompt(testPromptName, testContent);
    console.log('✓ Created test prompt');
    
    // Test 2: Verify prompt exists
    assert(promptManager.promptExists(testPromptName), 'Prompt should exist after creation');
    console.log('✓ Prompt exists check passed');
    
    // Test 3: Get prompt content
    const retrievedContent = promptManager.getPrompt(testPromptName);
    assert.strictEqual(retrievedContent, testContent, 'Retrieved content should match created content');
    console.log('✓ Get prompt content test passed');
    
    // Test 4: Update prompt
    const updatedContent = 'This is an updated test prompt with {input} and {output} placeholders.';
    promptManager.updatePrompt(testPromptName, updatedContent);
    const retrievedUpdatedContent = promptManager.getPrompt(testPromptName);
    assert.strictEqual(retrievedUpdatedContent, updatedContent, 'Updated content should match');
    console.log('✓ Update prompt test passed');
    
    // Test 5: Process prompt with placeholders
    const inputFile = path.join(TEST_DIR, 'test-input.txt');
    const outputFile = 'test-output.txt';
    
    // Create a test input file
    fs.writeFileSync(inputFile, 'Test input content');
    
    const processedPrompt = promptManager.processPrompt(testPromptName, inputFile, outputFile);
    assert(processedPrompt.includes('Test input content'), 'Processed prompt should include input file content');
    assert(processedPrompt.includes('test-output.txt'), 'Processed prompt should include output file path');
    console.log('✓ Process prompt test passed');
    
    // Test 6: List prompts
    const prompts = promptManager.listPrompts();
    assert(prompts.length >= initialCount + 1, 'Should have at least one more prompt than initially');
    assert(prompts.some(p => p.name === testPromptName), 'Test prompt should be in the list');
    console.log('✓ List prompts test passed');
    
    // Test 7: Delete prompt
    promptManager.deletePrompt(testPromptName);
    assert(!promptManager.promptExists(testPromptName), 'Prompt should not exist after deletion');
    console.log('✓ Delete prompt test passed');
    
    // Clean up the test input file
    if (fs.existsSync(inputFile)) {
      fs.unlinkSync(inputFile);
    }
    
    console.log('\nAll tests passed successfully! ✅');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests and clean up afterward
try {
  cleanupTestFiles();
  await runTests();
} catch (error) {
  console.error('Error running tests:', error);
  process.exit(1);
}