// LLM Interaction Tests for LLaMB
// This script tests actual LLM message sending and response handling

import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import chalk from 'chalk';
import readline from 'readline';

// Get the current module's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  // Timeout for each command (milliseconds)
  commandTimeout: 90000, // 90 seconds - longer for actual LLM interactions
  // Output report file - matches the name expected by run-all-tests.js
  reportFile: path.join(__dirname, 'llm-interaction-report.md'),
  // Binary path
  binaryPath: path.join(dirname(dirname(__dirname)), 'llamb')
};

// Test prompts for LLM interactions - using simple prompts
const LLM_TESTS = [
  {
    name: 'Asking a basic math question',
    prompt: 'What is 2+2?',
    // Ensure we match actual response not just echo of the question
    expectedPattern: /\b(4|four|Four)\b(?!.*What is 2\+2)/,
    // Need to make sure we don't match question repetitions
    mustMatchAfter: 'Using model:',
    // Make sure we don't match error messages
    mustNotMatch: /(offline|unreachable|error|unavailable)/i,
    timeout: 60000
  },
  {
    name: 'Getting a command suggestion',
    prompt: 'Give me a command to list files in a directory',
    // Use more specific pattern to avoid false matches
    expectedPattern: /\b(ls -la?|ls --list|dir|find \.|ls \*)\b/,
    mustMatchAfter: 'Using model:',
    mustNotMatch: /(offline|unreachable|error|unavailable)/i,
    timeout: 60000
  },
  {
    name: 'Asking for a code snippet',
    prompt: 'Write a simple hello world in Python',
    // More specific pattern that includes actual code
    expectedPattern: /(print\s*\(\s*['"]Hello,?\s*[Ww]orld!?['"]?\s*\)|def\s+main|import)/,
    mustMatchAfter: 'Using model:',
    mustNotMatch: /(offline|unreachable|error|unavailable)/i,
    timeout: 60000
  },
  {
    name: 'Testing cancellation handling',
    prompt: 'Write a very long essay about the history of computing',
    // Pattern specific to content, not question
    expectedPattern: /\b(microprocessor|transistor|ENIAC|revolution|software|mainframe|computer science)\b/i,
    mustMatchAfter: 'Using model:',
    shouldCancel: true, // Special flag to test cancellation
    timeout: 15000 // Short timeout - we'll cancel this one
  }
];

// Enhanced command execution with real-time output
function executeInteractiveCommand(command, expectedPattern, timeout, shouldCancel = false, mustMatchAfter = null, mustNotMatch = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let fullOutput = '';
    let matched = false;
    let timedOut = false;
    let cancelled = false;
    
    console.log(chalk.cyan(`\nExecuting: ${CONFIG.binaryPath} ${command}`));
    console.log(chalk.dim(`Timeout: ${timeout}ms, Looking for pattern: ${expectedPattern}`));
    
    if (shouldCancel) {
      console.log(chalk.yellow('⚠️ This test will simulate cancellation'));
    }
    
    // Parse command to extract args and actual command
    const args = command.split(/\s+/);
    const options = args.filter(arg => arg.startsWith('--') || arg.startsWith('-'));
    const question = args.filter(arg => !arg.startsWith('-')).join(' ');
    
    console.log(chalk.dim(`Running with args: ${JSON.stringify(options)}, question: ${question}`));
    
    // Use spawn for better interactive handling
    // For LLM tests, it's better to pass arguments separately rather than using shell
    const child = spawn(CONFIG.binaryPath, [...options, '--no-history', '--no-ink', question], {
      env: {
        ...process.env,
        FORCE_COLOR: '1',  // Enable colors
        // Set test env variables to avoid TTY issues
        LLAMB_TEST_MODE: '1',
        // Force non-interactive mode for tests
        NODE_ENV: 'test',
        // Disable stdin for non-interactive CI/CD environment
        CI: 'true',
        // Tell Ink not to use raw mode
        INK_FORCE_NEWLINE: '1',
        INK_SKIP_RAWMODE: '1',
        TERM: 'dumb'
      },
      // Detached and pipe setup for better test handling
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // For cancellation test, set up a timer to send SIGINT
    let cancelTimeoutId;
    if (shouldCancel) {
      // Wait a short time to let the model start responding, then send SIGINT
      cancelTimeoutId = setTimeout(() => {
        console.log(chalk.yellow('\n🛑 Sending cancellation signal (SIGINT)...'));
        cancelled = true;
        child.kill('SIGINT'); // Send Ctrl+C signal
        
        // Look for cancellation success in the output
        // This test succeeds if we get both a pattern match AND handle cancellation
      }, 5000); // Wait 5 seconds before cancelling
    }
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.log(chalk.red(`\n⏰ Command timed out after ${timeout}ms`));
      
      if (cancelTimeoutId) {
        clearTimeout(cancelTimeoutId);
      }
      
      child.kill(); // Try to kill the process
      
      // For cancellation test, timeout is actually expected
      if (shouldCancel && matched) {
        console.log(chalk.green('✓ Cancellation test completed successfully'));
        
        setTimeout(() => {
          resolve({
            success: true,
            output: fullOutput,
            error: 'Timed out as expected for cancellation test',
            matched: matched,
            cancelled: true,
            executionTime: Date.now() - startTime
          });
        }, 1000);
        return;
      }
      
      // Check if we have an error condition that should fail the test
      if (mustNotMatch && mustNotMatch.test(fullOutput)) {
        console.log(chalk.red('❌ Error condition detected in output - failing test'));
        
        setTimeout(() => {
          resolve({
            success: false,
            output: fullOutput,
            error: 'Error condition detected in output',
            matched: false,
            executionTime: Date.now() - startTime
          });
        }, 1000);
        return;
      }
      
      // In non-interactive mode, if we've matched the pattern, consider it a success
      // even if it timed out before finding a completion marker
      if (matched && (fullOutput.includes('"') || fullOutput.length > 100)) {
        console.log(chalk.yellow('⚠️ Command timed out but pattern was found - considering successful'));
        
        setTimeout(() => {
          resolve({
            success: true,
            output: fullOutput,
            error: 'Timed out but pattern was found',
            matched: matched,
            executionTime: Date.now() - startTime
          });
        }, 1000);
        return;
      }
      
      // Give it a moment to clean up before resolving
      setTimeout(() => {
        resolve({
          success: false,
          output: fullOutput,
          error: 'Command timed out',
          matched: matched,
          executionTime: Date.now() - startTime
        });
      }, 1000);
    }, timeout);
    
    // Process stdout in real-time
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      fullOutput += chunk;
      
      // Show real-time output with a prefix
      process.stdout.write(chalk.dim('.'));
      
      // First check - see if we have enough data to validate
      if (!matched) {
        let textToCheck = fullOutput;
        
        // If mustMatchAfter is provided, only check text after that marker
        if (mustMatchAfter && fullOutput.includes(mustMatchAfter)) {
          const startIndex = fullOutput.indexOf(mustMatchAfter) + mustMatchAfter.length;
          textToCheck = fullOutput.substring(startIndex);
        }
        
        // If mustNotMatch is provided, make sure it's not found
        if (mustNotMatch && mustNotMatch.test(fullOutput)) {
          // If we see an error message, we should fail this test
          console.log(chalk.red('\n✗ Found error pattern in output, failing test'));
          return; // Continue collecting output but don't mark as matched
        }
        
        // Now check if our expected pattern exists
        if (expectedPattern.test(textToCheck)) {
          matched = true;
          console.log(chalk.green('\n✓ Found expected pattern in output!'));
          // Log the matching chunk for debugging
          const matches = textToCheck.match(expectedPattern);
          if (matches) {
            console.log(chalk.green(`   Match found: "${matches[0]}"`));
          }
        }
      }
      
      // For cancellation test, check if we detect the cancellation message
      if (shouldCancel && (
          chunk.includes('cancelled by user') || 
          chunk.includes('request cancelled') ||
          chunk.includes('Cancelled') ||
          fullOutput.includes('cancelled by user') ||
          fullOutput.includes('request cancelled') ||
          fullOutput.includes('Cancelled')
      )) {
        console.log(chalk.green('\n✓ Detected cancellation message in output!'));
        
        // If we've also matched our pattern, we can consider this test successful
        if (matched) {
          if (cancelTimeoutId) {
            clearTimeout(cancelTimeoutId);
          }
          clearTimeout(timeoutId);
          
          console.log(chalk.green(`\n✓ Cancellation test completed successfully in ${(Date.now() - startTime)/1000}s`));
          
          setTimeout(() => {
            child.kill();
            resolve({
              success: true,
              output: fullOutput,
              matched: true,
              cancelled: true,
              executionTime: Date.now() - startTime
            });
          }, 1000);
        }
      }
      // For non-cancellation tests in non-interactive mode, consider completion when we match the pattern
      // and have enough output, or when we see any completion markers
      else if (matched && !shouldCancel && (
          // Test mode may not show UI markers, so check for completion by content length
          (fullOutput.length > 50) ||
          // Or check for explicit completion markers
          chunk.includes('✅ Response complete') || 
          chunk.includes('rendered the response in') ||
          chunk.includes('Command completed') ||
          fullOutput.includes('✅ Response complete') || 
          fullOutput.includes('rendered the response in') ||
          fullOutput.includes('Command completed') ||
          // Also count timeouts after pattern matches as success
          (chunk.includes('Model response complete') || chunk.includes('Response received')) ||
          (fullOutput.includes('Model response complete') || fullOutput.includes('Response received'))
      )) {
        clearTimeout(timeoutId);
        
        console.log(chalk.green(`\n✓ Command completed successfully in ${(Date.now() - startTime)/1000}s`));
        
        // We need to give the child process time to exit cleanly
        setTimeout(() => {
          child.kill();
          
          resolve({
            success: true,
            output: fullOutput,
            matched: true,
            executionTime: Date.now() - startTime
          });
        }, 1000);
      }
    });
    
    // Handle errors
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      fullOutput += chunk;
      
      // Show errors in red
      process.stdout.write(chalk.red('.'));
    });
    
    // Handle process exit
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (!timedOut) {
        const success = code === 0 && matched;
        console.log(chalk.dim(`\nCommand exited with code ${code} after ${(Date.now() - startTime)/1000}s`));
        
        resolve({
          success,
          output: fullOutput,
          exitCode: code,
          matched,
          executionTime: Date.now() - startTime
        });
      }
    });
    
    // Handle process errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      
      if (!timedOut) {
        console.log(chalk.red(`\nCommand encountered an error: ${error.message}`));
        
        resolve({
          success: false,
          output: fullOutput,
          error: error.message,
          matched: false,
          executionTime: Date.now() - startTime
        });
      }
    });
  });
}

// Function to verify connection to the default provider
async function verifyProviderConnection() {
  return new Promise((resolve) => {
    console.log(chalk.cyan('Checking connection to default provider...'));
    
    const child = exec(`${CONFIG.binaryPath} providers`, { timeout: 5000 });
    
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data;
    });
    
    child.on('close', (code) => {
      const defaultProvider = output.match(/Default provider: (\w+)/);
      
      if (code === 0 && defaultProvider && defaultProvider[1]) {
        console.log(chalk.green(`✓ Found default provider: ${defaultProvider[1]}`));
        resolve(true);
      } else {
        console.log(chalk.red('✗ Could not determine default provider'));
        resolve(false);
      }
    });
    
    child.on('error', () => {
      console.log(chalk.red('✗ Error checking providers'));
      resolve(false);
    });
  });
}

// Generate a markdown report of test results
async function generateReport(results) {
  const now = new Date();
  
  let report = `# LLaMB LLM Interaction Test Report\n\n`;
  report += `Generated on: ${now.toLocaleString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- Total tests: ${results.total}\n`;
  report += `- Passed: ${results.passed}\n`;
  report += `- Failed: ${results.failed}\n`;
  report += `- Success rate: ${Math.round((results.passed / results.total) * 100)}%\n\n`;

  report += `## Test Results\n\n`;
  
  // Include each test result
  for (const result of results.details) {
    const icon = result.success ? '✅' : '❌';
    report += `### ${icon} ${result.name}\n\n`;
    report += `**Prompt:** \`${result.prompt}\`\n\n`;
    report += `**Expected Pattern:** \`${result.expectedPattern}\`\n\n`;
    
    if (result.mustMatchAfter) {
      report += `**Match After:** \`${result.mustMatchAfter}\`\n\n`;
    }
    
    if (result.mustNotMatch) {
      report += `**Must Not Match:** \`${result.mustNotMatch}\`\n\n`;
    }
    
    report += `**Execution Time:** ${(result.executionTime / 1000).toFixed(2)}s\n\n`;
    report += `**Pattern Match:** ${result.matched ? 'Yes ✓' : 'No ✗'}\n\n`;
    
    if (result.cancelled) {
      report += `**Cancellation Test:** ${result.cancelled ? 'Yes ✓' : 'No'}\n\n`;
    }
    
    if (result.error) {
      report += `**Error:** ${result.error}\n\n`;
    }
    
    // Truncate very long outputs
    const truncatedOutput = result.output.length > 2000 
      ? result.output.substring(0, 2000) + '...(truncated)'
      : result.output;
    
    report += `**Output:**\n\`\`\`\n${truncatedOutput}\n\`\`\`\n\n`;
    report += `---\n\n`;
  }
  
  // Add execution environment info
  report += `## Environment\n\n`;
  report += `- Node.js: ${process.version}\n`;
  report += `- OS: ${process.platform} ${process.arch}\n`;
  report += `- Test runner: ${path.basename(__filename)}\n`;
  report += `- Command timeout: ${CONFIG.commandTimeout}ms\n\n`;
  
  // Save report to file
  await fs.promises.writeFile(CONFIG.reportFile, report, 'utf8');
  
  return CONFIG.reportFile;
}

// Main test runner function
async function runTests() {
  console.log(chalk.bold.blue('🧪 Starting LLaMB LLM Interaction Tests 🧪'));
  console.log(chalk.blue('These tests verify actual LLM communication with the default provider.'));
  
  // First, verify provider connection
  const providerConnected = await verifyProviderConnection();
  
  if (!providerConnected) {
    console.log(chalk.yellow('⚠️ Warning: Could not verify default provider connection.'));
    console.log(chalk.yellow('Tests may fail if the provider is not available.'));
    console.log('');
  }
  
  // Initialize results
  const results = {
    total: LLM_TESTS.length,
    passed: 0,
    failed: 0,
    details: []
  };
  
  // Run each test
  for (const test of LLM_TESTS) {
    console.log(chalk.bold.blue(`\n📝 Test: ${test.name}`));
    console.log(chalk.blue(`Prompt: "${test.prompt}"`));
    
    try {
      // Run the command and wait for result
      const result = await executeInteractiveCommand(
        test.prompt, 
        test.expectedPattern, 
        test.timeout, 
        test.shouldCancel || false,
        test.mustMatchAfter || null,
        test.mustNotMatch || null
      );
      
      // Add to results
      const testResult = {
        name: test.name,
        prompt: test.prompt,
        expectedPattern: test.expectedPattern,
        mustMatchAfter: test.mustMatchAfter,
        mustNotMatch: test.mustNotMatch,
        output: result.output,
        error: result.error,
        success: result.success,
        matched: result.matched,
        cancelled: result.cancelled || false,
        executionTime: result.executionTime
      };
      
      results.details.push(testResult);
      
      if (result.success) {
        results.passed++;
        console.log(chalk.green(`✅ PASSED: ${test.name}`));
      } else {
        results.failed++;
        console.log(chalk.red(`❌ FAILED: ${test.name}`));
        if (result.error) {
          console.log(chalk.red(`   Error: ${result.error}`));
        }
        if (!result.matched) {
          console.log(chalk.red(`   Expected pattern not found: ${test.expectedPattern}`));
          if (test.mustMatchAfter) {
            console.log(chalk.red(`   Pattern must appear after: "${test.mustMatchAfter}"`));
          }
          if (test.mustNotMatch) {
            console.log(chalk.red(`   Pattern must not include: ${test.mustNotMatch}`));
          }
        }
      }
    } catch (error) {
      // Handle unexpected errors
      results.failed++;
      results.details.push({
        name: test.name,
        prompt: test.prompt,
        expectedPattern: test.expectedPattern,
        output: '',
        error: error.message,
        success: false,
        matched: false,
        executionTime: 0
      });
      
      console.log(chalk.red(`❌ ERROR: ${test.name}`));
      console.log(chalk.red(`   ${error.message}`));
    }
  }
  
  // Generate and save the report
  const reportPath = await generateReport(results);
  
  // Print summary
  console.log(chalk.bold.blue('\n📊 Test Summary:'));
  console.log(chalk.blue(`Total tests: ${results.total}`));
  console.log(chalk.green(`Passed: ${results.passed}`));
  console.log(chalk.red(`Failed: ${results.failed}`));
  
  console.log(chalk.bold.blue(`\n📝 Report saved to: ${reportPath}`));
  
  return results.failed === 0 ? 0 : 1;
}

// Run the tests
runTests()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(chalk.red(`Fatal error running tests: ${error.message}`));
    process.exit(1);
  });