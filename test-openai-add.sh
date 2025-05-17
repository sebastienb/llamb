#!/bin/bash

# Make the script executable
chmod +x "$0"

# Use expect to automate CLI interactions
cat > test-openai.exp << 'EOF'
#!/usr/bin/expect -f

# Set timeout
set timeout 10

# Start the command
spawn llamb provider:add

# Expect provider name prompt
expect "Provider name:"
send "OpenAI\r"

# Expect base URL prompt
expect "Base URL:"
send "https://api.openai.com/v1\r"

# Expect authentication prompt
expect "Does this provider require authentication?"
send "y\r"

# If our fix is working, we should now get prompted for an API key
expect "API Key:"
send "invalid-api-key-just-testing\r"

# Expect default model prompt (might take a while due to API failures)
expect {
    "Default model" { send "gpt-3.5-turbo\r" }
    timeout { puts "Timed out waiting for default model prompt"; exit 1 }
}

# Expect successful addition
expect {
    "added successfully" { puts "Test successful - provider added" }
    timeout { puts "Timed out waiting for success confirmation"; exit 1 }
}

# All done
exit
EOF

# Make the expect script executable
chmod +x test-openai.exp

# Run the expect script
./test-openai.exp

# Clean up
rm test-openai.exp