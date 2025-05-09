# LLaMB - Command Line LLM Client

LLaMB is a command-line tool that allows you to interact with Large Language Models directly from your terminal.

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

## Usage

### Ask a question

```bash
llamb what is the best command to install docker on ubuntu
```

### List available models

```bash
llamb models
```

Or with a slash command:

```bash
llamb /models
```

### List configured providers

```bash
llamb providers
```

Or with a slash command:

```bash
llamb /providers
```

### Add or update a provider

```bash
llamb provider:add
```

### Set the default provider

```bash
llamb provider:default
```

### Specify model or provider for a question

```bash
llamb -m gpt-4 -p openai how do I install nginx on Ubuntu?
```

### Use a custom base URL for a single request

```bash
llamb -u http://localhost:8080/v1 what is the meaning of life?
```

### Combine options for maximum flexibility

```bash
llamb -m llama2 -p ollama -u http://localhost:11434/v1 explain quantum computing
```

## License

ISC