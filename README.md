# LLaMB - Command Line LLM Client

LLaMB is a command-line tool that allows you to interact with Large Language Models directly from your terminal. It features conversation history, file input/output, and support for multiple LLM providers.

## Features

- 🚀 **Fast** - Get answers directly in your terminal without leaving your workflow
- 💬 **Conversation history** - Follow-up on previous questions with context
- 🔄 **Continuous conversation** - Interactive chat mode for follow-up questions
- 📄 **File handling** - Include file contents in your questions and save responses to files
- 🔄 **Multiple providers** - Support for OpenAI, Anthropic, Mistral, Ollama, and more
- 🔐 **Secure** - API keys stored securely in your system's credential manager
- 🖥️ **Local models** - Works with local models like Ollama and LM Studio
- 🎨 **React-based UI** - Clean, artifact-free terminal interface using ink

## Installation

```bash
npm install -g llamb
```

Or clone this repository and run:

```bash
npm install
npm run build
npm link
```

## Setup

You can set your OpenAI API key in your environment:

```bash
export OPENAI_API_KEY=your_api_key_here
```

Or add a provider using the interactive command:

```bash
llamb provider:add
```

LLaMB supports many providers out of the box with pre-configured settings:
- OpenAI
- Anthropic
- Mistral AI
- OpenRouter
- Ollama (local)
- LM Studio (local)
- Other/Custom

### Secure API Key Storage

LLaMB securely stores your API keys in your system's secure credential store:
- macOS: Keychain
- Windows: Credential Manager
- Linux: libsecret (used by GNOME/KDE)

This means your API keys are never stored in plain text in configuration files.

You can update API keys for existing providers:

```bash
llamb provider:apikey
```

If you install from source, you can install the man page with:

```bash
sudo npm run install-man
```

## Documentation

LLaMB comes with a comprehensive man page that you can access after installation:

```bash
man llamb
```

## Usage

### Ask a question

```bash
llamb what is the best command to install docker on ubuntu
```

### File Operations

#### Include a file in your question

```bash
llamb -f script.js "Explain this code and suggest improvements"
llamb "Summarize this document" -f document.txt
```

#### Save responses to files

You can save responses to files in several ways:

```bash
# Prompted for filename (default: llamb-response-<timestamp>.txt)
llamb "Generate a React component" -o

# Save to specific file
llamb "Generate a JSON configuration" -o config.json

# Overwrite existing files without prompting
llamb "Generate a CSS file" -o styles.css --overwrite
```

If a file already exists, you'll be asked whether to:
- Overwrite the existing file
- Generate a new filename automatically (e.g., `file-1.txt`)
- Cancel the save operation

### Continuous Conversation Mode

LLaMB provides an interactive chat mode that allows you to have back-and-forth conversations with the model:

```bash
llamb -c "Tell me about TypeScript"
```

After receiving the initial response, you'll be prompted for follow-up questions:

```
🦙 Follow-up question (type /exit to end conversation):
```

You can type your follow-up questions, or use special commands:

- `/exit` or `/quit` - End the conversation and exit
- `/clear` - Clear conversation history
- `/new` - Start a new conversation
- `/history` - View conversation history
- `/file` - Attach a file to your next question
- `/unfile` - Remove the attached file
- `/help` - Show available commands

### Conversation History

LLaMB keeps track of your conversation history to provide context for follow-up questions.

#### View conversation history

```bash
llamb /history
# or
llamb context:history
```

#### Clear conversation history

```bash
llamb /clear
# or
llamb context:clear
```

#### Start a new conversation

```bash
llamb /new
# or
llamb context:new
```

#### Ask without using conversation history

```bash
llamb -n "What is 2+2?"
# or
llamb --no-history "What is 2+2?"
```

#### Terminal-specific sessions

LLaMB maintains separate conversation histories for each terminal window. This means you can have different conversations going on in different terminal sessions.

To see information about your current terminal session:

```bash
llamb /debug
# or
llamb context:debug
```

### Working with Models and Providers

#### List available models

```bash
llamb models
# or
llamb /models
```

#### List configured providers

```bash
llamb providers
# or
llamb /providers
```

#### Add or update a provider

```bash
llamb provider:add
```

#### Set the default provider

```bash
llamb provider:default
```

#### Change the default model for a provider

```bash
llamb model:default
# or
llamb /model
```

You can also change the model for a specific provider:

```bash
llamb model:default -p openai
```

#### Specify model or provider for a question

```bash
llamb -m gpt-4 -p openai how do I install nginx on Ubuntu?
```

#### Use a custom base URL for a single request

```bash
llamb -u http://localhost:8080/v1 what is the meaning of life?
```

### Terminal UI Options

LLaMB provides different UI rendering options to handle different terminal environments:

#### Use ink-based UI (default)

LLaMB uses a React-based terminal UI powered by ink, which provides a clean,
artifact-free interface with proper rendering:

```bash
# ink is the default, so no flag is needed
llamb "What is the history of the internet?"

# You can explicitly enable it with
llamb --ink "What is the history of the internet?"
```

#### Disable ink for traditional rendering

In some terminal environments, you might want to fall back to traditional rendering:

```bash
llamb --no-ink "What is the history of the internet?"
```

#### Use progress-only mode

If you're experiencing issues with scrollback artifacts in your terminal:

```bash
llamb --progress-only "What is the history of the internet?"
```

#### Configure terminal UI defaults

```bash
# Set ink UI as default (already the default)
llamb config:progress-mode --ink

# Use traditional rendering with real-time streaming
llamb config:progress-mode --disable

# Use progress-only mode (no streaming)
llamb config:progress-mode --enable

# View current settings
llamb config:progress-mode
```

#### Combine options for maximum flexibility

```bash
llamb -m llama2 -p ollama -f code.py -o analysis.md "Analyze this code"
```

## License

MIT