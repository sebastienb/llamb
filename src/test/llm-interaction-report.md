# LLaMB LLM Interaction Test Report

Generated on: 5/16/2025, 12:19:23 PM

## Summary

- Total tests: 4
- Passed: 2
- Failed: 2
- Success rate: 50%

## Test Results

### ✅ Asking a basic math question

**Prompt:** `What is 2+2?`

**Expected Pattern:** `/\b(4|four|Four)\b(?!.*What is 2\+2)/`

**Match After:** `Using model:`

**Must Not Match:** `/(offline|unreachable|error|unavailable)/i`

**Execution Time:** 2.17s

**Pattern Match:** Yes ✓

**Output:**
```
- [2mThinking...[22m
[2mAsking: [22mWhat is 2+2?
🤖 Using model: o4-mini from provider: openAI
[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0m2[0m                                                                [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0m2 +[0m                                                              [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0m2 + [0m                                                             [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m...(truncated)
```

---

### ❌ Getting a command suggestion

**Prompt:** `Give me a command to list files in a directory`

**Expected Pattern:** `/\b(ls -la?|ls --list|dir|find \.|ls \*)\b/`

**Match After:** `Using model:`

**Must Not Match:** `/(offline|unreachable|error|unavailable)/i`

**Execution Time:** 5.01s

**Pattern Match:** No ✗

**Output:**
```
- [2mThinking...[22m
[2mAsking: [22mGive me a command to list files in a directory
🤖 Using model: o4-mini from provider: openAI
[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mHere[0m                                                             [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mHere are[0m                                                         [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mHere are a[0m                                                       [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰─────────────────────────────────────────────────────...(truncated)
```

---

### ✅ Asking for a code snippet

**Prompt:** `Write a simple hello world in Python`

**Expected Pattern:** `/(print\s*\(\s*['"]Hello,?\s*[Ww]orld!?['"]?\s*\)|def\s+main|import)/`

**Match After:** `Using model:`

**Must Not Match:** `/(offline|unreachable|error|unavailable)/i`

**Execution Time:** 2.14s

**Pattern Match:** Yes ✓

**Output:**
```
- [2mThinking...[22m
[2mAsking: [22mWrite a simple hello world in Python
🤖 Using model: o4-mini from provider: openAI
[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mHere[0m                                                             [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mHere’s[0m                                                           [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mHere’s the[0m                                                       [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰───────────────────────────────────────────────────────────────...(truncated)
```

---

### ❌ Testing cancellation handling

**Prompt:** `Write a very long essay about the history of computing`

**Expected Pattern:** `/\b(microprocessor|transistor|ENIAC|revolution|software|mainframe|computer science)\b/i`

**Match After:** `Using model:`

**Execution Time:** 16.00s

**Pattern Match:** No ✗

**Error:** Command timed out

**Output:**
```
- [2mThinking...[22m
[2mAsking: [22mWrite a very long essay about the history of computing
🤖 Using model: o4-mini from provider: openAI
[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mThe[0m                                                              [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mThe following[0m                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰────────────────────────────────────────────────────────────────────╯[39m
[7A[J[32m╭────────────────────────────── LLaMB ───────────────────────────────╮[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m   [0mThe following essay[0m                                              [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m│[39m                                                                    [32m│[39m
[32m╰─────────────────────────────────────────────...(truncated)
```

---

## Environment

- Node.js: v22.11.0
- OS: darwin arm64
- Test runner: llm-interaction-tests.js
- Command timeout: 90000ms

