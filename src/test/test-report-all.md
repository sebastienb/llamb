# LLaMB CLI Comprehensive Test Report

Generated on: 6/30/2025, 1:04:07 AM

## Summary

- Total tests: 9
- Passed: 8
- Failed: 1
- Success rate: 89%

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

### Provider Management

❌ **Provider list**

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

✅ **Provider add help**

```
/Users/sebs/Projects/llamb/llamb provider:add --help
```

---

✅ **Provider edit help**

```
/Users/sebs/Projects/llamb/llamb provider:edit --help
```

---

✅ **Provider delete help**

```
/Users/sebs/Projects/llamb/llamb provider:delete --help
```

---

### Prompt Management

✅ **Prompt list**

```
/Users/sebs/Projects/llamb/llamb prompt:list
```

---

✅ **Prompt add help**

```
/Users/sebs/Projects/llamb/llamb prompt:add --help
```

---

### Cancellation Tests

✅ **ESC handling available**

```
/Users/sebs/Projects/llamb/llamb provider:add --help
```

---

## Environment

- Node.js: v22.11.0
- OS: darwin arm64
- Test runner: simple-runner.js
- Command timeout: 10000ms

