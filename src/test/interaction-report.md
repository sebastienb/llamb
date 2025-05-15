# LLaMB Interaction Test Report

Generated on: 5/15/2025, 12:15:07 PM

## Summary

- Total tests: 6
- Passed: 4
- Failed: 2
- Success rate: 67%

- Notes: Some tests may fail if the LLM provider is unavailable or rate-limited.

## Test Results

### Basic Question & Answer

✅ **Check version**

```
/Users/sebs/Projects/llamb/llamb --version
```

**Output:**
```
2.0.0

```

---

✅ **Try a simple request**

```
/Users/sebs/Projects/llamb/llamb --help
```

**Output:**
```
Usage: llamb [options] [command] [question...]

Ask a question to the LLM

Options:
  -V, --version                                 output the version number
  -c, --chat                                    Enable continuous conversation mode for follow-up questions
  --no-chat                                     Disable continuous conversation mode (default)
  -m, --model <model>                           Specify the model to use
  -p, --provider <provider>                     Specify the provider to use
  -u, --baseUrl <baseUrl>                       Specify a custom base URL for this request
  -s, --stream                                  Stream the response as it arrives (default: true)
  --progress-only                               Show progress indicator without streaming content (prevents scrollback artifacts)
  --live-stream                                 Force live streaming of content even if progress-only mode is enabled
  --ink                                         Use i...
```

---

### Command Line Options

✅ **Check provider listing**

```
/Users/sebs/Projects/llamb/llamb providers
```

**Output:**
```
[1m[22m
[1mConfigured Providers:[22m
[2m┌─────────────────────┬─────────────────────┬─────────────────┬────────────────┐[22m
[2m│ [22m[1mName                [22m[2m │ [22m[1mDefault Model       [22m[2m │ [22m[1mAuth Required  [22m[2m │ [22m[1mAPI Key        [22m[2m │[22m
[2m├─────────────────────┼─────────────────────┼─────────────────┼────────────────┤[22m
[2m└─────────────────────┴─────────────────────┴─────────────────┴────────────────┘[22m
[2m│ [22mollama              [2m │ [22m[2mllama3.2:latest     [22m[2m │ [22m[2mNo             [22m[2m │ [22m[2mN/A            [22m[2m │[22m
[2m│ [22mGhostLM             [2m │ [22m[2mmeta-llama-3.1-8b-instruct[22m[2m │ [22m[2mNo             [22m[2m │ [22m[2mN/A            [22m[2m │[22m
[36m[39m
[36mDefault provider: GhostLM[39m

[36mUsage:[39m
  [1mllamb -p <provider-name>[22m          Use a specific provider
  [1mllamb provider:edit <provider>[22m    Edit a provider
  [1mllamb...
```

---

✅ **Check prompt listing**

```
/Users/sebs/Projects/llamb/llamb prompt:list
```

**Output:**
```
[1m[22m
[1mAvailable Prompts:[22m
[2m┌─────────────────────┬─────────────────────┬─────────────────────┐[22m
[2m│ [22m[1mName                [22m[2m │ [22m[1mCreated             [22m[2m │ [22m[1mUpdated             [22m[2m │[22m
[2m├─────────────────────┼─────────────────────┼─────────────────────┤[22m
[2m│ [22m10tweets            [2m │ [22m[2m5/14/2025, 5:36:49 PM[22m[2m │ [22m[2m5/14/2025, 5:37:51 PM[22m[2m │[22m
[2m│ [22mcode-review         [2m │ [22m[2m5/14/2025, 10:56:53 AM[22m[2m │ [22m[2m5/14/2025, 10:58:11 AM[22m[2m │[22m
[2m│ [22mexplain-code        [2m │ [22m[2m5/14/2025, 10:58:55 AM[22m[2m │ [22m[2m5/14/2025, 10:58:55 AM[22m[2m │[22m
[2m└─────────────────────┴─────────────────────┴─────────────────────┘[22m

[36mUsage:[39m
  [1mllamb -t <prompt-name>[22m             Run a prompt
  [1mllamb prompt edit <prompt-name>[22m    Edit a prompt
  [1mllamb prompt delete <prompt-name>[22m  Delete a prompt


```

---

### Slash Commands

❌ **Clear history**

```
/Users/sebs/Projects/llamb/llamb /clear
```

**Exit Code:** null

**Output:**
```

 [2mAsking: context:clear[22m


 [32m╭────────────────────────────────────────────────────────────────────────────╮[39m
 [32m│[39m [33m⠋[39m Thinking...                                                              [32m│[39m
 [32m╰────────────────────────────────────────────────────────────────────────────╯[39m


[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[G
 [41m[37m ERROR[39m[49m Raw mode is not supported on the current process.stdin, which Ink uses
       as input stream by default.
       Read about how to prevent this error on
       https://github.com/vadimdemedes/ink/#israwmodesupported

 [2m- Read about how to prevent this error on [22m
   [2mhttps://github.com/vadimdemedes/ink/#israwmodesupported[22m
 [2m- value[90m (node_modules/ink/build/components/App.js:54:31)[22m[39m
 [2m- [90m (node_modules/ink/build/hooks/use-input.js:37:9)[22m[39m
 [2m-commitHookEffectLis[90m (node_modules/react-reconciler/cjs/react-reconc...
```

---

❌ **New conversation**

```
/Users/sebs/Projects/llamb/llamb /new
```

**Exit Code:** null

**Output:**
```

 [2mAsking: context:new[22m


 [32m╭────────────────────────────────────────────────────────────────────────────╮[39m
 [32m│[39m [33m⠋[39m Thinking...                                                              [32m│[39m
 [32m╰────────────────────────────────────────────────────────────────────────────╯[39m


[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[1A[2K[G
 [41m[37m ERROR[39m[49m Raw mode is not supported on the current process.stdin, which Ink uses
       as input stream by default.
       Read about how to prevent this error on
       https://github.com/vadimdemedes/ink/#israwmodesupported

 [2m- Read about how to prevent this error on [22m
   [2mhttps://github.com/vadimdemedes/ink/#israwmodesupported[22m
 [2m- value[90m (node_modules/ink/build/components/App.js:54:31)[22m[39m
 [2m- [90m (node_modules/ink/build/hooks/use-input.js:37:9)[22m[39m
 [2m-commitHookEffectLis[90m (node_modules/react-reconciler/cjs/react-reconcil...
```

---

## Environment

- Node.js: v22.11.0
- OS: darwin arm64
- Test runner: interaction-tests.js
- Command timeout: 60000ms

