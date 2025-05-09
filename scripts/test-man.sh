#!/bin/bash

# Simple test script to verify man page installation

echo "Testing man page for llamb..."

# Check if the man page is installed
if man -w llamb &> /dev/null; then
    echo "✅ Man page for llamb is installed"
    
    # Try to display the first few lines of the man page
    echo "First few lines of the man page:"
    man llamb | head -n 10
    
    echo ""
    echo "To view the complete man page, run: man llamb"
else
    echo "❌ Man page for llamb is not installed"
    echo "To install the man page, run: sudo npm run install-man"
    
    # Check if the man page exists in the project directory
    if [ -f "$(dirname "$0")/../man/man1/llamb.1" ]; then
        echo "✅ Man page file exists in the project directory"
    else
        echo "❌ Man page file does not exist in the project directory"
    fi
fi