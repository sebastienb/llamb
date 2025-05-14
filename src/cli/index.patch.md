# Changes to implement prompt feature

## 1. Import prompt-related modules at the top:

```typescript
// Add after other imports
import { registerPromptCommands } from './promptCli.js';
import { processPrompt, formatQuestionWithPrompt } from '../services/promptExecution.js';
```

## 2. Add prompt command-line flag:

```typescript
// Add after line 108 (after other options)
  .option('-t, --prompt <name>', 'Use a saved prompt template for your question')
```

## 3. Update help text to include prompt management:

```typescript
// Add to the Examples section (after line 90)
  $ llamb -t summarize -f document.txt     Use a saved prompt template
  $ llamb prompt:list                      List all saved prompts
  $ llamb prompt:add <name>                Create a new prompt template
  $ llamb prompt:edit <name>               Edit a prompt template
  $ llamb prompt:delete <name>             Delete a prompt template

Prompt Management:
  $ llamb prompt list                      List all saved prompts
  $ llamb prompt add                       Create a new prompt interactively
  $ llamb prompt edit                      Edit a prompt interactively
  $ llamb prompt delete                    Delete a prompt interactively
  $ llamb prompt show                      Show the content of a prompt
```

## 4. Update question handling in the action function:

```typescript
// In the main action handler, before calling askQuestion or askQuestionWithStreaming
// Add this logic after the question is assembled:

// Handle prompt template if specified
if (options.prompt) {
  try {
    // Process the prompt with placeholders
    const processedPrompt = processPrompt(options.prompt, options.file, options.output);
    // Format the question with the prompt
    question = formatQuestionWithPrompt(question, processedPrompt);
  } catch (error: any) {
    console.error(chalk.red(`Error processing prompt: ${error.message}`));
    console.log(chalk.cyan('Available prompts:'));
    console.log(chalk.bold('  llamb prompt:list'));
    
    // Exit when done in non-chat mode with error code
    if (!options.chat) {
      exitWhenDone(1);
    }
    return;
  }
}
```

## 5. Register prompt commands:

```typescript
// Add before program.parse(process.argv)
// Register prompt management commands
registerPromptCommands(program);
```