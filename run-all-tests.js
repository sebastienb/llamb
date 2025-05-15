#!/usr/bin/env node

// LLaMB Test Suite Runner
// This script orchestrates running all the test suites for the LLaMB CLI

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import fs from 'fs';
import chalk from 'chalk';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  // Test timeouts (milliseconds)
  timeout: 120000,
  // Output directory for reports
  reportDir: join(__dirname, 'test-reports'),
  // Test runners to execute
  testRunners: [
    {
      name: 'CLI Tests',
      script: join(__dirname, 'src', 'test', 'cli-test-runner.js'),
      reportFile: 'cli-test-report.md'
    },
    {
      name: 'Comprehensive Tests',
      script: join(__dirname, 'src', 'test', 'simple-runner.js'), // Use the simple runner
      reportFile: 'comprehensive-test-report.md'
    },
    {
      name: 'Interaction Tests',
      script: join(__dirname, 'src', 'test', 'interaction-tests.js'),
      reportFile: 'interaction-report.md',
      optional: true // Mark as optional since it requires actual LLM access
    },
    {
      name: 'LLM Interaction Tests',
      script: join(__dirname, 'src', 'test', 'llm-interaction-tests.js'),
      reportFile: 'llm-interaction-report.md',
      optional: true // Mark as optional since it requires actual LLM access with default provider
    }
  ]
};

// Ensure report directory exists
if (!fs.existsSync(CONFIG.reportDir)) {
  fs.mkdirSync(CONFIG.reportDir, { recursive: true });
}

// Function to run a test script
function runTestScript(scriptPath, name, isOptional = false) {
  console.log(chalk.bold.blue(`\n🧪 Running ${name}${isOptional ? ' (optional)' : ''}...\n`));
  
  try {
    console.log(chalk.dim(`Executing: node ${scriptPath}`));
    
    // Use pipe instead of inherit to be able to show output on error
    const result = spawnSync('node', [scriptPath], {
      stdio: ['inherit', 'pipe', 'pipe'],
      timeout: CONFIG.timeout,
      encoding: 'utf8'
    });
    
    if (result.error) {
      console.error(chalk.red(`Error running ${name}: ${result.error.message}`));
      if (isOptional) {
        console.log(chalk.yellow(`Skipping optional test suite: ${name}`));
        return true; // Optional test failures don't affect overall results
      }
      return false;
    }
    
    // If the script failed, show the output for debugging
    if (result.status !== 0) {
      console.error(chalk.red(`\n${name} failed with exit code ${result.status}`));
      
      if (result.stdout && result.stdout.trim()) {
        console.error(chalk.yellow(`\nStandard output (first 300 chars):`));
        console.error(chalk.yellow(result.stdout.substring(0, 300) + '...'));
      }
      
      if (result.stderr && result.stderr.trim()) {
        console.error(chalk.red(`\nError output (first 300 chars):`));
        console.error(chalk.red(result.stderr.substring(0, 300) + '...'));
      }
      
      if (isOptional) {
        console.log(chalk.yellow(`\nSkipping optional test failure: ${name}`));
        return true; // Optional test failures don't affect overall results
      }
    }
    
    return result.status === 0;
  } catch (error) {
    console.error(chalk.red(`Failed to execute ${name}: ${error.message}`));
    if (isOptional) {
      console.log(chalk.yellow(`Skipping optional test suite: ${name}`));
      return true; // Optional test failures don't affect overall results
    }
    return false;
  }
}

// Generate a summary report combining all test results
function generateSummaryReport() {
  console.log(chalk.blue('\n📊 Generating Summary Report...'));
  
  let summaryContent = `# LLaMB Test Suite Summary Report\n\n`;
  summaryContent += `Generated on: ${new Date().toLocaleString()}\n\n`;
  
  // Track overall statistics
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  
  // Read all the individual reports and extract pass/fail information
  for (const runner of CONFIG.testRunners) {
    const reportPath = join(CONFIG.reportDir, runner.reportFile);
    
    if (fs.existsSync(reportPath)) {
      const reportContent = fs.readFileSync(reportPath, 'utf8');
      
      // Extract test counts using regex
      const totalMatch = reportContent.match(/Total tests: (\d+)/);
      const passedMatch = reportContent.match(/Passed: (\d+)/);
      const failedMatch = reportContent.match(/Failed: (\d+)/);
      
      if (totalMatch && passedMatch && failedMatch) {
        const tests = parseInt(totalMatch[1]);
        const passed = parseInt(passedMatch[1]);
        const failed = parseInt(failedMatch[1]);
        
        totalTests += tests;
        totalPassed += passed;
        totalFailed += failed;
        
        const successRate = Math.round((passed / tests) * 100);
        
        summaryContent += `## ${runner.name}\n\n`;
        summaryContent += `- Total tests: ${tests}\n`;
        summaryContent += `- Passed: ${passed}\n`;
        summaryContent += `- Failed: ${failed}\n`;
        summaryContent += `- Success rate: ${successRate}%\n`;
        summaryContent += `- [Detailed Report](${runner.reportFile})\n\n`;
      }
    } else {
      summaryContent += `## ${runner.name}\n\n`;
      summaryContent += `No report found for this test runner.\n\n`;
    }
  }
  
  // Add overall statistics
  const overallSuccessRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
  
  summaryContent += `## Overall Statistics\n\n`;
  summaryContent += `- Total tests: ${totalTests}\n`;
  summaryContent += `- Passed: ${totalPassed}\n`;
  summaryContent += `- Failed: ${totalFailed}\n`;
  summaryContent += `- Overall success rate: ${overallSuccessRate}%\n\n`;
  
  // Add checklist for quick review
  summaryContent += `## Test Suite Checklist\n\n`;
  for (const runner of CONFIG.testRunners) {
    const reportPath = join(CONFIG.reportDir, runner.reportFile);
    const exists = fs.existsSync(reportPath);
    const icon = exists ? '✅' : '❌';
    summaryContent += `${icon} ${runner.name}\n`;
  }
  
  // Add environment information
  summaryContent += `\n## Environment\n\n`;
  summaryContent += `- Node.js: ${process.version}\n`;
  summaryContent += `- OS: ${process.platform} ${process.arch}\n`;
  summaryContent += `- Test suite runner: ${__filename}\n`;
  
  // Write the summary report
  const summaryReportPath = join(CONFIG.reportDir, 'summary-report.md');
  fs.writeFileSync(summaryReportPath, summaryContent, 'utf8');
  
  console.log(chalk.green(`📝 Summary report saved to: ${summaryReportPath}`));
  return summaryReportPath;
}

// Main function to run all tests
async function main() {
  console.log(chalk.bold.blue('🚀 Starting LLaMB Test Suite 🚀\n'));
  
  let allPassed = true;
  
  // Run each test script
  for (const runner of CONFIG.testRunners) {
    const isOptional = runner.optional === true;
    const passed = runTestScript(runner.script, runner.name, isOptional);
    
    // Only count non-optional test failures
    if (!isOptional) {
      allPassed = allPassed && passed;
    }
    
    // Copy the test report to the reports directory if it exists
    const originalReportPath = join(dirname(runner.script), 'test-report.md');
    // For special tests, use their specific report filenames
    const alternateReportPath = join(dirname(runner.script), 'interaction-report.md');
    const llmReportPath = join(dirname(runner.script), 'llm-interaction-report.md');
    
    let sourceReportPath = '';
    if (fs.existsSync(originalReportPath)) {
      sourceReportPath = originalReportPath;
    } else if (fs.existsSync(alternateReportPath)) {
      sourceReportPath = alternateReportPath;
    } else if (fs.existsSync(llmReportPath)) {
      sourceReportPath = llmReportPath;
    }
    
    if (sourceReportPath) {
      const destinationPath = join(CONFIG.reportDir, runner.reportFile);
      fs.copyFileSync(sourceReportPath, destinationPath);
      console.log(chalk.dim(`📋 Copied report to: ${destinationPath}`));
    }
  }
  
  // Generate summary report
  const summaryReportPath = generateSummaryReport();
  
  // Display final result
  if (allPassed) {
    console.log(chalk.bold.green('\n✅ All test suites passed!'));
  } else {
    console.log(chalk.bold.red('\n❌ Some test suites failed!'));
  }
  
  console.log(chalk.bold.blue(`\n📊 Summary report: ${summaryReportPath}`));
  
  // Return appropriate exit code
  process.exit(allPassed ? 0 : 1);
}

// Run the main function
main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});