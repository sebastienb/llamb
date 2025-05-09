#!/bin/bash

# Script to properly install llamb and make it available everywhere

# Find the absolute path of the llamb script
LLAMB_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LLAMB_SCRIPT="$LLAMB_DIR/llamb"

echo "Installing llamb from $LLAMB_SCRIPT..."

# Make sure the script is executable
chmod +x "$LLAMB_SCRIPT"

# Create a symlink in /usr/local/bin (or another directory in your PATH)
if [ -d "/usr/local/bin" ]; then
    ln -sf "$LLAMB_SCRIPT" "/usr/local/bin/llamb"
    echo "Created symlink: /usr/local/bin/llamb -> $LLAMB_SCRIPT"
    echo "Installation complete! You can now use 'llamb' from anywhere."
else
    echo "Error: /usr/local/bin directory not found."
    echo "Please create a symlink manually:"
    echo "ln -s $LLAMB_SCRIPT /path/to/directory/in/your/PATH/llamb"
fi