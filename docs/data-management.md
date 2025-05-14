# LLaMB Data Management

This document explains how LLaMB manages and stores configuration data, API keys, and conversation history.

## Configuration Storage

LLaMB uses the [Conf](https://www.npmjs.com/package/conf) package to handle configuration storage:

- **Location**: `~/.llamb/config.json`
- **Format**: JSON file
- **Content**:
  ```json
  {
    "providers": [
      {
        "name": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "defaultModel": "gpt-4o",
        "noAuth": false
      },
      {
        "name": "ollama",
        "baseUrl": "http://localhost:11434/api",
        "defaultModel": "llama2",
        "noAuth": true
      }
    ],
    "defaultProvider": "openai",
    "useProgressOnly": false,
    "useInkUI": true
  }
  ```

### Configuration Schema

| Property | Type | Description |
|----------|------|-------------|
| `providers` | Array | List of configured LLM providers |
| `defaultProvider` | String | Name of the default provider to use |
| `useProgressOnly` | Boolean | Whether to show progress-only mode instead of streaming |
| `useInkUI` | Boolean | Whether to use the React-based ink UI |

### Provider Configuration

Each provider in the `providers` array has the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `name` | String | Unique identifier for the provider |
| `baseUrl` | String | API endpoint URL |
| `defaultModel` | String | Default model to use with this provider |
| `noAuth` | Boolean | Optional - set to true for local providers that don't require authentication |

## Secure API Key Storage

LLaMB securely stores API keys in your system's credential manager:

- **Service Name**: `llamb`
- **Account Name**: Provider name (e.g., "openai", "anthropic")
- **Password**: The API key

The specific storage location depends on your operating system:
- **macOS**: Keychain
- **Windows**: Credential Manager
- **Linux**: libsecret (used by GNOME/KDE)

API keys are **never** stored in plain text configuration files. The KeyManager class in `src/utils/keyManager.ts` handles all API key operations securely.

## Conversation History Storage

LLaMB maintains separate conversation histories for each terminal window:

- **Location**: `~/.llamb/sessions/` directory
- **Format**: Individual JSON files for each session
- **Filename**: Based on session ID (includes terminal ID)
- **Content**: Messages with role (user/assistant), content, and timestamps

### Session Management

The SessionManager (in `src/services/sessionManager.ts`) handles:

1. **Terminal identification**: Generates a unique ID for each terminal window
2. **Session tracking**: Maps terminal IDs to session IDs
3. **Message storage**: Writes conversation history to disk
4. **Session operations**: Supports clearing history, starting new sessions, etc.

## Managing Settings via CLI

LLaMB provides several commands to manage data and settings:

### Provider Management

```bash
# List all configured providers
llamb providers

# Add a new provider (interactive)
llamb provider:add

# Edit an existing provider
llamb provider:edit
llamb provider:edit --name openai --url https://api.openai.com/v1
llamb provider:edit --name openai --model gpt-4o

# Update API key for a provider
llamb provider:apikey

# Set the default provider
llamb provider:default

# Delete a provider
llamb provider:delete
llamb provider:delete --name openai --force
```

### Conversation Management

```bash
# View conversation history
llamb /history
llamb context:history

# Clear conversation history
llamb /clear
llamb context:clear

# Start a new conversation
llamb /new
llamb context:new

# View session debug info
llamb /debug
llamb context:debug
```

### UI Configuration

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

## Data Locations Summary

| Data Type | Location | Format | Security |
|-----------|----------|--------|----------|
| Configuration | `~/.llamb/config.json` | JSON | Plain text |
| API Keys | System credential store | Encrypted | Secure |
| Conversation History | `~/.llamb/sessions/*.json` | JSON | Plain text |