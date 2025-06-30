# LLaMB CLI Test Report

Generated on: 6/30/2025, 1:04:03 AM

## Summary

- Total tests: 8
- Passed: 7
- Failed: 1
- Success rate: 88%

## Test Results

### Basic Commands

✅ **Show help**

```
/Users/sebs/Projects/llamb/llamb --help
```

---

✅ **Show version**

```
/Users/sebs/Projects/llamb/llamb --version
```

---

❌ **List providers**

```
/Users/sebs/Projects/llamb/llamb providers
```

**Error Output:**
```
- Checking providers...

```

**Exit Code:** 0

**Standard Output:**
```

Provider Information:

Provider: ollama (default)
URL:      http://localhost:11434/v1
Model:    llama3.2:latest
Models:   1
Status:   ✓ Online

Provider: GhostLM
URL:      http://100.70.163.13:1234/v1
Model:    qwen3-4b
Models:   14
Status:   ✓ Online

Provider: openAI
URL:      https://api.openai.com/v1
Model:    o4-mini
Models:   79
Status:   ✓ Online


Usage:
  llamb -p <provider-name>          Use a specific provider
  llamb provider:edit <provider>    Edit a provider
  llamb provider:apike...
```

---

### Cancellation Handling

✅ **Verify ESC handling setup**

```
/Users/sebs/Projects/llamb/llamb provider:add --help
```

---

### Provider Management

✅ **Show default provider**

```
/Users/sebs/Projects/llamb/llamb provider:default --help
```

---

✅ **Show provider add help**

```
/Users/sebs/Projects/llamb/llamb provider:add --help
```

---

### Prompt Management

✅ **List prompts**

```
/Users/sebs/Projects/llamb/llamb prompt:list
```

---

✅ **Show prompt help**

```
/Users/sebs/Projects/llamb/llamb prompt:add --help
```

---

## Environment

- Node.js: v22.11.0
- OS: darwin arm64
- Test runner: cli-test-runner.js
- Command timeout: 10000ms

