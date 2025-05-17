#!/bin/bash

# Make the script executable
chmod +x "$0"

# Use expect to automate CLI interactions
cat > test-expect.exp << 'EOF'
#!/usr/bin/expect -f

# Set timeout
set timeout 10

# Start the command
spawn llamb provider:add

# Expect provider name prompt
expect "Provider name:"
send "TestProvider\r"

# Expect base URL prompt
expect "Base URL:"
send "https://api.test.com/v1\r"

# Expect authentication prompt
expect "Does this provider require authentication?"
send "y\r"

# If our fix is working, we should now get prompted for an API key
expect "API Key:"
send "test-api-key-123\r"

# Expect default model prompt
expect "Default model"
send "test-model\r"

# Expect successful addition
expect "added successfully"

# All done
exit
EOF

# Make the expect script executable
chmod +x test-expect.exp

# Run the expect script
./test-expect.exp

# Clean up
rm test-expect.exp