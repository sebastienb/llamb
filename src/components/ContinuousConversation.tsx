import React, { FC, useState, useEffect, useRef } from 'react';
import { Text, Box, useInput, useFocus, useFocusManager, Newline } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { marked } from 'marked';
import chalk from 'chalk';

interface ContinuousConversationProps {
  initialQuestion: string;
  onAskQuestion: (question: string) => Promise<string>;
  onExit: () => void;
  onExecuteCommand: (command: string) => void;
}

const ContinuousConversation: FC<ContinuousConversationProps> = ({
  initialQuestion,
  onAskQuestion,
  onExit,
  onExecuteCommand
}) => {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([
    { role: 'user', content: initialQuestion }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [showCommandHelp, setShowCommandHelp] = useState(false);
  
  // Refs for scrolling
  const messagesEndRef = useRef<any>(null);
  
  // Focus management for the input
  const { isFocused } = useFocus();
  const { focusNext, focusPrevious } = useFocusManager();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      // Scroll to bottom logic would go here if we had direct DOM access
      // Since we don't have direct DOM access in the terminal, we can use
      // console.log with empty strings to create space
      if (messages.length > 2) {
        process.stdout.write('\n');
      }
    }
  }, [messages]);

  // Ask the initial question
  useEffect(() => {
    const fetchInitialResponse = async () => {
      try {
        const response = await onAskQuestion(initialQuestion);
        setMessages(prev => [...prev, { role: 'assistant', content: response }]);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching initial response:', error);
        setIsError(true);
        setIsLoading(false);
      }
    };

    fetchInitialResponse();
  }, [initialQuestion, onAskQuestion]);

  // Handle keyboard input
  useInput((input, key) => {
    // Exit on Ctrl+C or Ctrl+D
    if ((key.ctrl && (input === 'c' || input === 'd'))) {
      onExit();
    }
    
    // Show command help on ?
    if (input === '?' && !isLoading) {
      setShowCommandHelp(prev => !prev);
    }
  });

  // Handle form submission
  const handleSubmit = async (value: string) => {
    // Handle empty input
    if (value.trim() === '') {
      return;
    }
    
    // Handle commands
    if (value.startsWith('/')) {
      const command = value.substring(1).toLowerCase();
      
      // Handle exit command directly
      if (command === 'exit' || command === 'quit') {
        onExit();
        return;
      }
      
      // Handle other commands through the callback
      onExecuteCommand(command);
      setInputValue('');
      return;
    }
    
    // Add user message to the conversation
    setMessages(prev => [...prev, { role: 'user', content: value }]);
    setInputValue('');
    setIsLoading(true);
    
    try {
      // Get response from the LLM
      const response = await onAskQuestion(value);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('Error:', error);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Render message bubble with appropriate styling
  const renderMessage = (role: 'user' | 'assistant', content: string, index: number) => {
    const isUser = role === 'user';
    const borderColor = isUser ? 'blue' : 'green';
    const alignSelf = isUser ? 'flex-end' : 'flex-start';
    
    // Parse markdown for assistant responses only
    let displayContent = content;
    if (role === 'assistant') {
      try {
        displayContent = marked(content).toString();
      } catch (error) {
        console.error('Error parsing markdown:', error);
      }
    }
    
    return (
      <Box 
        key={index}
        borderStyle="round"
        borderColor={borderColor}
        padding={1}
        marginY={1}
        width="90%"
        alignSelf={alignSelf}
      >
        <Text>{displayContent}</Text>
      </Box>
    );
  };

  // Command help panel
  const commandHelp = (
    <Box 
      borderStyle="round" 
      borderColor="yellow"
      padding={1}
      marginY={1}
      flexDirection="column"
    >
      <Text bold>Available Commands:</Text>
      <Text>/exit, /quit - End the conversation</Text>
      <Text>/clear - Clear conversation history</Text>
      <Text>/new - Start a new conversation</Text>
      <Text>/history - View conversation history</Text>
      <Text>? - Toggle this help panel</Text>
    </Box>
  );

  return (
    <Box flexDirection="column" height="100%">
      {/* Messages Area (Scrollable) */}
      <Box flexDirection="column" flexGrow={1}>
        {messages.map((message, index) => 
          renderMessage(message.role, message.content, index)
        )}
        {isLoading && (
          <Box marginY={1}>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text> Thinking...</Text>
          </Box>
        )}
        {isError && (
          <Box marginY={1}>
            <Text color="red">An error occurred. Please try again.</Text>
          </Box>
        )}
        {showCommandHelp && commandHelp}
        <Box ref={messagesEndRef} />
      </Box>
      
      {/* Input Area (Fixed at Bottom) */}
      <Box 
        borderStyle="round"
        borderColor="gray"
        padding={1}
        marginTop={1}
      >
        <Box>
          <Text>🦙 </Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder="Type your message or /command (? for help)"
            focus={true}
          />
        </Box>
      </Box>
    </Box>
  );
};

// Helper function to render the component using the render function from ink
import { render } from 'ink';

export const renderContinuousConversation = (
  initialQuestion: string,
  onAskQuestion: (question: string) => Promise<string>,
  onExit: () => void,
  onExecuteCommand: (command: string) => void
): (() => void) => {
  const { unmount } = render(
    <ContinuousConversation
      initialQuestion={initialQuestion}
      onAskQuestion={onAskQuestion}
      onExit={onExit}
      onExecuteCommand={onExecuteCommand}
    />
  );
  
  // Return the unmount function to clean up
  return unmount;
};

export default ContinuousConversation;