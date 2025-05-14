# Product Requirements Document (PRD) for Llamb Prompt Management

## Overview
Enable users to create, edit, and delete reusable prompts in Llamb. These prompts can be used to automate repetitive tasks, allowing users to define and run custom workflows easily.

## Goals
- Provide a way for users to manage prompts via the command line.
- Allow prompts to accept input and output files.
- Store prompts in a user-accessible directory for easy editing.
- Integrate intuitive CLI flags and subcommands for both casual and power users.

## Features

### Prompt Execution
- `llamb -t <prompt-name> -f <input-file> -o <output-file>`  
- `llamb --prompt <prompt-name> -f <input-file> -o <output-file>`  
  - Runs the specified prompt with optional input and output file paths.
  - Prompts support placeholder variables (e.g., `{input}`, `{output}`) that are replaced at runtime.

### Prompt Management Subcommands
- `llamb prompt list` — Display all available prompts
- `llamb prompt add <prompt-name>` — Create a new prompt (opens in editor or accepts piped input)
- `llamb prompt edit <prompt-name>` — Edit a prompt in the user’s default editor
- `llamb prompt delete <prompt-name>` — Delete a prompt

### Storage
- Prompts are stored as plain-text files in a dedicated directory (e.g., `~/.llamb/prompts/`).
- File names match prompt names (e.g., `summarize.txt` for a `summarize` prompt).
- Users can manually edit prompts or manage them entirely via CLI.

### Terminal UI (Optional, Future)
- React-based terminal UI to:
  - Browse prompts
  - Preview or edit them
  - Execute prompts interactively

## Technical Considerations
- Maintain separation between provider (`-p`) and prompt (`-t`) flags.
- Ensure placeholder variables can support paths and possibly dynamic values.
- Prompt storage should be cross-platform (handle paths for Linux/macOS/Windows).
- Consider syncing prompt definitions with version control or exporting/importing.

## Example Usage
```bash
llamb -t summarize -f blog.txt -o summary.md
llamb --prompt convert -f notes.md -o slides.md

llamb prompt list
llamb prompt add rewrite
llamb prompt edit rewrite
llamb prompt delete rewrite