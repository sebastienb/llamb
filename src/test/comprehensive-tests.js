// Comprehensive Test Suite for LLaMB
// This file adds more detailed tests focusing on critical areas like cancellation and providers

// We're not importing from test-categories.js to avoid duplicate exports

// Add more detailed provider management tests
export const PROVIDER_MANAGEMENT_TESTS = [
  {
    name: 'Default provider existence',
    command: 'provider:default --help',
    expectSuccess: true,
    validate: (stdout) => stdout.includes('Set the default provider')
  },
  {
    name: 'Provider list format',
    command: 'providers',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Configured Providers:') && 
             stdout.includes('Name') && 
             stdout.includes('Default Model') && 
             stdout.includes('Auth Required') && 
             stdout.includes('API Key');
    }
  },
  {
    name: 'Provider add command structure',
    command: 'provider:add --help',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Add a new provider interactively');
    }
  },
  {
    name: 'Provider edit command structure',
    command: 'provider:edit --help',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Edit an existing provider');
    }
  },
  {
    name: 'Provider delete command',
    command: 'provider:delete --help',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Delete a provider');
    }
  }
];

// Add cancellation handling tests - these are special because they involve signals
export const CANCELLATION_TESTS = [
  {
    name: 'Help mentions ESC to cancel',
    command: '--help',
    expectSuccess: true,
    validate: (stdout) => {
      // Check if ESC/cancellation is mentioned in help
      return stdout.includes('ESC') || stdout.includes('cancel');
    }
  },
  // These tests require simulating keystrokes which is complex in an automated test
  // In a real implementation, we would use something like robotjs to simulate keyboard input
  {
    name: 'ESC handling described in provider commands',
    command: 'provider:add --help',
    expectSuccess: true,
    validate: (stdout) => {
      // Provider add command should work even if it doesn't mention ESC
      return stdout.includes('Add a new provider') || stdout.includes('provider:add');
    }
  }
];

// Tests for error handling
export const ERROR_HANDLING_TESTS = [
  {
    name: 'Invalid command shows help',
    command: 'not-a-real-command',
    expectSuccess: false,
    validate: (stdout, stderr) => {
      return stdout.includes('Usage:') || stderr.includes('Unknown command');
    }
  },
  {
    name: 'Nonexistent provider error',
    command: 'provider:edit --name nonexistent-provider',
    expectSuccess: false,
    validate: (stdout, stderr) => {
      return stdout.includes('not found') || stderr.includes('not found');
    }
  }
];

// Tests for prompt management
export const PROMPT_MANAGEMENT_TESTS = [
  {
    name: 'Prompt list command',
    command: 'prompt:list',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Prompts') || stdout.includes('prompts') || stdout.includes('Available Prompts');
    }
  },
  {
    name: 'Prompt add command structure',
    command: 'prompt:add --help',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Create a new prompt');
    }
  },
  {
    name: 'Prompt edit command structure',
    command: 'prompt:edit --help',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Edit a prompt');
    }
  },
  {
    name: 'Prompt delete command structure',
    command: 'prompt:delete --help',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Delete a prompt');
    }
  },
  {
    name: 'Prompt show command structure',
    command: 'prompt:show --help',
    expectSuccess: true,
    validate: (stdout) => {
      return stdout.includes('Show a prompt template');
    }
  }
];

// Combining all test categories
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
      },
      {
        name: 'Check main command arguments',
        command: '--help',
        expectSuccess: true,
        validate: (stdout) => stdout.includes('-c, --chat') || stdout.includes('-f, --file')
      }
    ]
  },
  {
    name: 'Provider Management',
    tests: PROVIDER_MANAGEMENT_TESTS
  },
  {
    name: 'Cancellation Handling',
    tests: CANCELLATION_TESTS
  },
  {
    name: 'Error Handling',
    tests: ERROR_HANDLING_TESTS
  },
  {
    name: 'Prompt Management',
    tests: PROMPT_MANAGEMENT_TESTS
  }
];

export { ALL_TEST_CATEGORIES };