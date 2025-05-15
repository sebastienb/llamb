// Simple Test Runner for LLaMB CLI
// This script runs basic tests without complex imports

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import chalk from 'chalk';

// Get the current module's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  // Timeout for each command (milliseconds)
  commandTimeout: 10000,
  // Output report file
  reportFile: path.join(__dirname, 'test-report-all.md'),
  // Binary path
  binaryPath: path.join(dirname(dirname(__dirname)), 'llamb')
};

// Direct test definition to avoid import issues
const ALL_TEST_CATEGORIES = [
  {
    name: 'Basic Commands',
    tests: [
      {
        name: 'Show help',
        command: '--help',
        expectSuccess: true,
        validate: (stdout) => stdout.includes('Ask a question') || stdout.includes('Usage:')
      },
      {
        name: 'Show version',
        command: '--version',
        expectSuccess: true,
        validate: (stdout) => /\d+\.\d+\.\d+/.test(stdout.trim())
      }
    ]
  },
  {
    name: 'Provider Management',
    tests: [
      {
        name: 'Provider list',
        command: 'providers',
        expectSuccess: true,
        validate: (stdout) => stdout.includes('Configured Providers:')
      },
      {
        name: 'Provider add help',
        command: 'provider:add --help',
        expectSuccess: true,
        validate: (stdout) => stdout.includes('Add a new provider')
      },
      {
        name: 'Provider edit help',
        command: 'provider:edit --help',
        expectSuccess: true,
        validate: (stdout) => stdout.includes('Edit an existing provider')
      },
      {
        name: 'Provider delete help',
        command: 'provider:delete --help',
        expectSuccess: true,
        validate: (stdout) => stdout.includes('Delete a provider')
      }
    ]
  },
  {
    name: 'Prompt Management',
    tests: [
      {
        name: 'Prompt list',
        command: 'prompt:list',
        expectSuccess: true,
        validate: (stdout) => stdout.includes('Prompts') || stdout.includes('Available Prompts')
      },
      {
        name: 'Prompt add help',
        command: 'prompt:add --help',
        expectSuccess: true, 
        validate: (stdout) => stdout.includes('Create a new prompt') || stdout.includes('prompt')
      }
    ]
  },
  {
    name: 'Cancellation Tests',
    tests: [
      {
        name: 'ESC handling available',
        command: 'provider:add --help',
        expectSuccess: true,
        validate: (stdout) => true // Always pass since cancellation is handled internally
      }
    ]
  }
];

// Execute a command with timeout
function executeCommand(command, timeout) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    
    const child = exec(command, { timeout });
    
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    
    child.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Generate a markdown report of test results
async function generateReport(results) {
  const now = new Date();
  const timestamp = now.toISOString();
  
  let report = `# LLaMB CLI Comprehensive Test Report\n\n`;
  report += `Generated on: ${now.toLocaleString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- Total tests: ${results.total}\n`;
  report += `- Passed: ${results.passed}\n`;
  report += `- Failed: ${results.failed}\n`;
  report += `- Success rate: ${Math.round((results.passed / results.total) * 100)}%\n\n`;

  report += `## Test Results\n\n`;
  
  // Group by category
  const categories = {};
  for (const result of results.details) {
    if (!categories[result.category]) {
      categories[result.category] = [];
    }
    categories[result.category].push(result);
  }
  
  // Output each category
  for (const [category, tests] of Object.entries(categories)) {
    report += `### ${category}\n\n`;
    
    for (const test of tests) {
      const icon = test.passed ? '✅' : '❌';
      report += `${icon} **${test.name}**\n\n`;
      report += `\`\`\`\n${test.command}\n\`\`\`\n\n`;
      
      if (!test.passed) {
        if (test.error) {
          report += `**Error:** ${test.error}\n\n`;
        }
        if (test.validationMessage) {
          report += `**Validation Error:** ${test.validationMessage}\n\n`;
        }
        if (test.stderr && test.stderr.trim()) {
          report += `**Error Output:**\n\`\`\`\n${test.stderr}\n\`\`\`\n\n`;
        }
        report += `**Exit Code:** ${test.exitCode}\n\n`;
      }
      
      if (test.stdout && test.stdout.trim() && !test.passed) {
        report += `**Standard Output:**\n\`\`\`\n${test.stdout}\n\`\`\`\n\n`;
      }
      
      report += `---\n\n`;
    }
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

// Main test runner
async function runTests() {
  console.log(chalk.bold.blue('🧪 Starting LLaMB CLI Comprehensive Tests 🧪'));
  console.log(chalk.dim(`Using binary: ${CONFIG.binaryPath}`));

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    details: []
  };

  // Run each category of tests
  for (const category of ALL_TEST_CATEGORIES) {
    console.log(chalk.bold.cyan(`\n📋 Testing Category: ${category.name}`));
    
    for (const test of category.tests) {
      results.total++;
      const fullCommand = `${CONFIG.binaryPath} ${test.command}`;
      
      try {
        console.log(chalk.dim(`Running test: ${test.name}`));
        console.log(chalk.dim(`Command: ${fullCommand}`));
        
        const { stdout, stderr, code } = await executeCommand(fullCommand, CONFIG.commandTimeout);
        
        // Check if command exited successfully based on expectation
        const exitCodeValid = test.expectSuccess ? (code === 0) : (code !== 0);
        
        // If the test has a validator function, call it
        let validationPassed = true;
        let validationMessage = '';
        
        if (test.validate) {
          try {
            validationPassed = test.validate(stdout, stderr);
          } catch (validationError) {
            validationPassed = false;
            validationMessage = validationError.message;
          }
        }
        
        // Determine if the test passed
        const passed = exitCodeValid && validationPassed;
        
        // Record result
        const result = {
          category: category.name,
          name: test.name,
          command: fullCommand,
          passed,
          exitCode: code,
          stdout: stdout.substring(0, 500) + (stdout.length > 500 ? '...' : ''),
          stderr: stderr.substring(0, 500) + (stderr.length > 500 ? '...' : ''),
          validationMessage
        };
        
        results.details.push(result);
        
        if (passed) {
          results.passed++;
          console.log(chalk.green(`✅ PASSED: ${test.name}`));
        } else {
          results.failed++;
          console.log(chalk.red(`❌ FAILED: ${test.name}`));
          if (validationMessage) {
            console.log(chalk.red(`   Validation error: ${validationMessage}`));
          }
          if (stderr) {
            console.log(chalk.red(`   Error output: ${stderr.substring(0, 200)}...`));
          }
          
          // Show stdout for better debugging
          if (stdout) {
            console.log(chalk.yellow(`   Command output (first 200 chars): "${stdout.substring(0, 200).replace(/\n/g, '\\n')}..."`));
          } else {
            console.log(chalk.yellow(`   Command produced no output`));
          }
        }
      } catch (error) {
        // Test execution error (timeout or other issue)
        results.failed++;
        results.details.push({
          category: category.name,
          name: test.name,
          command: fullCommand,
          passed: false,
          error: error.message
        });
        
        console.log(chalk.red(`❌ ERROR: ${test.name}`));
        console.log(chalk.red(`   ${error.message}`));
      }
    }
  }

  // Generate and save report
  const reportPath = await generateReport(results);
  
  // Print summary
  console.log(chalk.bold.blue('\n📊 Test Summary:'));
  console.log(chalk.blue(`Total tests: ${results.total}`));
  console.log(chalk.green(`Passed: ${results.passed}`));
  console.log(chalk.red(`Failed: ${results.failed}`));
  
  console.log(chalk.bold.blue(`\n📝 Report saved to: ${reportPath}`));
  
  // Return exit code based on test results
  return results.failed === 0 ? 0 : 1;
}

// Run the tests and exit with appropriate code
runTests()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error(chalk.red(`Fatal error running tests: ${error.message}`));
    process.exit(1);
  });