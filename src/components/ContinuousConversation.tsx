import React, { FC, useState, useEffect, useRef } from 'react';
import { Text, Box, useInput, useFocus, useFocusManager, Newline, Spacer } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { marked } from 'marked';
import chalk from 'chalk';
import path from 'path';
import { askQuestionWithStreaming, formatOutputContent } from '../services/llm.js';
import { SessionManager } from '../services/sessionManager.js';
import { readFile, writeFile, fileExists, generateUniqueFilename } from '../utils/fileUtils.js';

interface ContinuousConversationProps {
  initialQuestion: string;
  onAskQuestion: (question: string) => Promise<string | { content: string; usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } }>;
  onExit: () => void;
  onExecuteCommand: (command: string) => void;
  // File and output options
  filePathOption?: string;      // Path to input file for initial message
  outputPathOption?: string | true;  // Path to save responses or true to prompt for path
  overwriteOption?: boolean;    // Whether to overwrite existing files
}

const ContinuousConversation: FC<ContinuousConversationProps> = ({
  initialQuestion,
  onAskQuestion,
  onExit,
  onExecuteCommand,
  filePathOption,
  outputPathOption,
  overwriteOption = false
}) => {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant', content: string, usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }}>>([
    { role: 'user', content: initialQuestion }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [showCommandHelp, setShowCommandHelp] = useState(false);
  
  // For streaming responses
  const [currentResponse, setCurrentResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // For file handling
  const [fileContent, setFileContent] = useState<string | undefined>(undefined);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [lastSavedFile, setLastSavedFile] = useState<string | null>(null);
  
  // Parse command-line flags like -o and -f from user input
  const parseCommandFlags = (input: string) => {
    const flagMap: Record<string, string | boolean> = {};
    
    // Use regex to find all flag patterns
    // Match patterns like: -f filename.txt, --output=result.md, -o "file with spaces.txt"
    const flagRegex = /(?:^|\s)(-{1,2})([a-zA-Z][\w-]*)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s-][^\s]*))/g;
    const matches = Array.from(input.matchAll(flagRegex));
    
    matches.forEach(match => {
      const flag = match[2]; // The flag name without dashes
      // The value is in one of the capturing groups (3, 4, or 5) depending on quotes
      const value = match[3] || match[4] || match[5];
      flagMap[flag] = value;
    });
    
    // Also handle standalone flags like -v or --verbose
    const standaloneRegex = /(?:^|\s)(-{1,2})([a-zA-Z][\w-]*)(?=\s|$)/g;
    const standaloneMatches = Array.from(input.matchAll(standaloneRegex));
    
    standaloneMatches.forEach(match => {
      const flag = match[2]; // The flag name without dashes
      // Only add if it's not already added with a value
      if (!flagMap[flag]) {
        flagMap[flag] = true;
      }
    });
    
    return flagMap;
  };
  
  // Function to handle file output
  const handleFileOutput = async (content: string, outputPath: string | true): Promise<void> => {
    if (!content) {
      console.log(chalk.yellow('No content to save'));
      return;
    }
    
    setIsSavingFile(true);
    
    try {
      // Format content for output
      const formatResult = formatOutputContent(content, { isFileOutput: true });
      const cleanedContent = formatResult.content;
      const detectedLanguage = formatResult.detectedLanguage;
      const isPureCodeBlock = formatResult.isPureCodeBlock;
      
      // Determine final path
      let finalPath = typeof outputPath === 'string' ? outputPath : '';
      
      // If no path provided, generate one
      if (!finalPath) {
        // Determine extension based on content
        let defaultExtension = 'txt';
        if (detectedLanguage && isPureCodeBlock) {
          const { getExtensionForLanguage } = await import('../utils/fileUtils.js');
          defaultExtension = getExtensionForLanguage(detectedLanguage);
        }
        
        finalPath = `llamb-response-${Date.now()}.${defaultExtension}`;
      }
      
      // Convert relative paths to absolute paths
      if (!path.isAbsolute(finalPath)) {
        finalPath = path.resolve(process.cwd(), finalPath);
      }
      
      // Check if file exists
      if (fileExists(finalPath) && !overwriteOption) {
        finalPath = generateUniqueFilename(finalPath);
      }
      
      // Write content to file
      writeFile(finalPath, cleanedContent, true);
      setLastSavedFile(finalPath);
      
      // Show confirmation message
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `✅ Response saved to: ${finalPath} (${cleanedContent.length} characters)`
      }]);
    } catch (error: any) {
      console.error('Error saving file:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `❌ Error saving file: ${error.message}`
      }]);
    } finally {
      setIsSavingFile(false);
    }
  };
  
  // Refs for scrolling
  const messagesEndRef = useRef<any>(null);
  
  // Focus management for the input
  const { isFocused } = useFocus();
  const { focusNext, focusPrevious } = useFocusManager();

  // Auto-scroll to bottom when messages change, but don't trigger during streaming
  useEffect(() => {
    // Don't auto-scroll during streaming to reduce flicker
    if (isStreaming) {
      return;
    }
    
    if (messagesEndRef.current) {
      // Scroll to bottom logic would go here if we had direct DOM access
      // Since we don't have direct DOM access in the terminal, we can use
      // console.log with empty strings to create space
      if (messages.length > 2) {
        process.stdout.write('\n');
      }
    }
    
    // Only do full screen refresh when not streaming
    if (!isStreaming) {
      process.stdout.write('\u001B[2J\u001B[0;0H');
    }
  }, [messages, isStreaming]);
  
  // Load initial file content if provided
  useEffect(() => {
    if (filePathOption) {
      try {
        const content = readFile(filePathOption);
        setFileContent(content);
        console.log(chalk.dim(`File loaded: ${filePathOption} (${content.length} bytes)`));
        
        // Update initial question to mention the file
        const updatedQuestion = `${initialQuestion}\n\nFile content: ${filePathOption}`;
        setMessages([{ role: 'user', content: updatedQuestion }]);
      } catch (error: any) {
        console.error(chalk.red(`Error reading file: ${error.message}`));
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ Error reading file ${filePathOption}: ${error.message}`
        }]);
      }
    }
  }, [filePathOption, initialQuestion]);

  // Ask the initial question
  useEffect(() => {
    const fetchInitialResponse = async () => {
      try {
        // Show a message that we're asking the initial question
        console.log(chalk.cyan(`Initial question: ${initialQuestion}`));
        
        // Reset current response and start streaming
        setCurrentResponse('');
        setIsStreaming(true);
        
        // Create custom response handler that updates UI with streaming content
        const streamingOnAskQuestion = async (question: string) => {
          // Create a direct streaming helper
          // Start with empty content
          let streamedContent = '';
          let responseRef = { current: null as (string | { content: string; usage?: any } | null) };
          let streamingChunks = '';
          
          // No need to update React state during streaming - we're using direct terminal output
          // Just set up a placeholder interval to ensure the variable is populated when streaming finishes
          const checkInterval = setInterval(() => {
            if (streamingChunks !== streamedContent) {
              streamedContent = streamingChunks;
              // No React state update - avoid Ink re-renders
            }
          }, 500); // Slower interval since we're not using it for UI updates
          
          // Optimized streaming to avoid flickering
          // Create a streaming response message in the UI
          setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
          
          // Create a custom callback for streaming chunks that updates the UI
          const customChunkCallback = (chunk: string) => {
            // Add chunk to our tracking variable
            streamingChunks += chunk;
            
            // Update the last message in the list with the current content
            // Less frequent updates to avoid flickering
            if (streamingChunks.length % 10 === 0 || chunk.includes('\n')) {
              setMessages(prev => {
                const newMessages = [...prev];
                // Replace the last message with updated content
                if (newMessages.length > 0) {
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: streamingChunks
                  };
                }
                return newMessages;
              });
            }
          };
          
          // Call the real streaming function with our custom callback
          try {
            // No direct terminal output needed - we're using the UI
            
            // Use any to help TypeScript understand the result can be converted
            const streamResponse = await askQuestionWithStreaming(
              question,
              customChunkCallback,
              undefined, // modelName
              undefined, // providerName
              undefined, // customBaseUrl
              true, // useHistory
              fileContent // Pass file content if available
            ) as any;
            
            // Store the final response
            responseRef.current = streamResponse;
            
            // Final update to ensure we have the complete response
            streamedContent = typeof streamResponse === 'string' ? 
              streamResponse : 
              (streamResponse as any).content || '';
              
            setCurrentResponse(streamedContent);
            
            // Clean up interval now that we have the full response
            clearInterval(checkInterval);
            
            // Return the final response
            return streamResponse;
          } catch (error) {
            // Clean up interval on error
            clearInterval(checkInterval);
            console.error('Error in streaming response:', error);
            // Return what we collected so far
            return { content: streamingChunks };
          } finally {
            // Always ensure interval is cleared
            clearInterval(checkInterval);
          }
        };
        
        // Get the response to the initial question with streaming
        const response = await streamingOnAskQuestion(initialQuestion);
        
        // Streaming is complete
        setIsStreaming(false);
        
        // Ensure we handle the response with the right format
        // Using any here since we've already handled the conversion to the right format
        const typedResponse = response as any;
        
        if (typeof typedResponse === 'string') {
          setMessages(prev => [...prev, { role: 'assistant', content: typedResponse }]);
        } else {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: typedResponse.content || '',
            usage: typedResponse.usage
          }]);
        }
        
        // After receiving the first response, check if we need to save it to a file
        if (outputPathOption && (typedResponse.content || typedResponse)) {
          const content = typeof typedResponse === 'string' ? 
            typedResponse : typedResponse.content || '';
            
          if (content) {
            // Save the content to a file - ensure output path is string or true
            const validOutputPath = typeof outputPathOption === 'string' ? outputPathOption : true;
            await handleFileOutput(content, validOutputPath);
          }
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching initial response:', error);
        setIsError(true);
        setIsLoading(false);
        setIsStreaming(false);
      }
    };

    fetchInitialResponse();
  }, [initialQuestion, onAskQuestion, fileContent, outputPathOption]);

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
      
      // Handle clear command directly with visual feedback
      if (command === 'clear') {
        // Show a system message that history was cleared
        setMessages([
          { role: 'assistant', content: '✅ Conversation history has been cleared.' }
        ]);
      }
      
      // Also handle new command for visual feedback
      if (command === 'new') {
        // Show a system message that a new conversation was started
        setMessages([
          { role: 'assistant', content: '✅ Started a new conversation.' }
        ]);
      }
      
      // Handle history command with feedback when no history
      if (command === 'history') {
        // The real history display is handled by the callback
        // We just want to make sure something is displayed if there's no history
        const sessionManager = SessionManager.getInstance();
        const messages = sessionManager.getMessages();
        
        if (messages.length === 0) {
          setMessages([
            { role: 'assistant', content: 'No conversation history yet.' }
          ]);
        }
      }
      
      // Handle save command for saving the last response to a file
      if (command.startsWith('save')) {
        // Extract filename if provided: /save filename.txt
        const parts = command.split(/\s+/);
        let filename = parts[1];
        
        // Get the last assistant message
        const lastAssistantMessage = [...messages].reverse()
          .find(msg => msg.role === 'assistant');
          
        if (!lastAssistantMessage) {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: '❌ No assistant message to save.'
          }]);
        } else {
          // Save the message to a file
          if (filename) {
            handleFileOutput(lastAssistantMessage.content, filename);
          } else {
            handleFileOutput(lastAssistantMessage.content, true);
          }
          return;
        }
      }
      
      // Handle file attachment command
      if (command.startsWith('attach')) {
        // Extract filename: /attach /path/to/file.txt
        const parts = command.split(/\s+/);
        const filepath = parts[1];
        
        if (!filepath) {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: '❌ Please specify a file path: /attach /path/to/file.txt'
          }]);
        } else {
          try {
            const content = readFile(filepath);
            setFileContent(content);
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `✅ File attached: ${filepath} (${content.length} bytes)`
            }]);
          } catch (error: any) {
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `❌ Error reading file ${filepath}: ${error.message}`
            }]);
          }
        }
        setInputValue('');
        return;
      }
      
      // Always execute the command through the callback
      onExecuteCommand(command);
      setInputValue('');
      return;
    }
    
    // Parse any command-line style flags in the message
    const flags = parseCommandFlags(value);
    
    // Clean the question by removing flags
    let cleanedQuestion = value;
    
    // Remove flag patterns using the same regex patterns as parseCommandFlags
    const flagWithValueRegex = /(?:^|\s)(-{1,2}[a-zA-Z][\w-]*)(?:=|\s+)(?:"[^"]+"|'[^']+'|[^\s-][^\s]*)/g;
    cleanedQuestion = cleanedQuestion.replace(flagWithValueRegex, '');
    
    // Remove standalone flags
    const standaloneRegex = /(?:^|\s)(-{1,2}[a-zA-Z][\w-]*)(?=\s|$)/g;
    cleanedQuestion = cleanedQuestion.replace(standaloneRegex, '');
    
    // Trim and clean up extra spaces
    cleanedQuestion = cleanedQuestion.replace(/\s+/g, ' ').trim();
    
    // Add user message to the conversation with the original input (to preserve flags for UI display)
    setMessages(prev => [...prev, { role: 'user', content: value }]);
    setInputValue('');
    setIsLoading(true);
    
    // Check for file attachment via -f flag
    let userFileContent: string | undefined = fileContent;
    if (flags.f || flags.file) {
      const filepath = flags.f || flags.file;
      if (typeof filepath === 'string') {
        try {
          userFileContent = readFile(filepath);
          console.log(chalk.dim(`File loaded: ${filepath} (${userFileContent.length} bytes)`));
        } catch (error: any) {
          console.error(chalk.red(`Error reading file: ${error.message}`));
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `❌ Error reading file ${filepath}: ${error.message}`
          }]);
          setIsLoading(false);
          return;
        }
      }
    }
    
    try {
      // Reset current response and start streaming
      setCurrentResponse('');
      setIsStreaming(true);
      
      // Create custom response handler that updates UI with streaming content
      const streamingOnAskQuestion = async (question: string) => {
        // Create a direct streaming helper
        // Start with empty content
        let streamedContent = '';
        let responseRef = { current: null as (string | { content: string; usage?: any } | null) };
        let streamingChunks = '';
        
        // No need to update React state during streaming - we're using direct terminal output
        // Just set up a placeholder interval to ensure the variable is populated when streaming finishes
        const checkInterval = setInterval(() => {
          if (streamingChunks !== streamedContent) {
            streamedContent = streamingChunks;
            // No React state update - avoid Ink re-renders
          }
        }, 500); // Slower interval since we're not using it for UI updates
        
        // Optimized streaming to avoid flickering
        // Create a streaming response message in the UI
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        
        // Create a custom callback for streaming chunks that updates the UI
        const customChunkCallback = (chunk: string) => {
          // Add chunk to our tracking variable
          streamingChunks += chunk;
          
          // Update the last message in the list with the current content
          // Less frequent updates to avoid flickering
          if (streamingChunks.length % 10 === 0 || chunk.includes('\n')) {
            setMessages(prev => {
              const newMessages = [...prev];
              // Replace the last message with updated content
              if (newMessages.length > 0) {
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: streamingChunks
                };
              }
              return newMessages;
            });
          }
        };
        
        // Call the real streaming function with our custom callback
        try {
          // No direct terminal output needed - we're using the UI
          
          // Use any to help TypeScript understand the result can be converted
          const streamResponse = await askQuestionWithStreaming(
            question,
            customChunkCallback,
            undefined, // modelName
            undefined, // providerName
            undefined, // customBaseUrl
            true, // useHistory
            userFileContent // Pass the file content from the flag
          ) as any;
          
          // Process the stream response to convert to our expected format
          // Check if it's a cancellation object
          if (typeof streamResponse === 'object' && 'cancelled' in streamResponse) {
            // For cancellation, use the partial response
            const partialContent = streamResponse.partialResponse || '';
            responseRef.current = { content: partialContent };
            streamedContent = partialContent;
            setCurrentResponse(streamedContent);
            
            // Clean up interval
            clearInterval(checkInterval);
            
            // Return it in our expected format
            return { content: partialContent };
          } else {
            // For normal responses
            responseRef.current = typeof streamResponse === 'string' ? 
              { content: streamResponse } : 
              streamResponse as any;
              
            // Final update to ensure we have the complete response
            streamedContent = typeof streamResponse === 'string' ? 
              streamResponse : 
              (streamResponse as any).content || '';
              
            setCurrentResponse(streamedContent);
            
            // Clean up interval now that we have the full response
            clearInterval(checkInterval);
            
            // Convert to our expected format and return
            if (typeof streamResponse === 'string') {
              return { content: streamResponse };
            } else {
              return streamResponse as any;
            }
          }
        } catch (error) {
          // Clean up interval on error
          clearInterval(checkInterval);
          console.error('Error in streaming response:', error);
          // Return what we collected so far in our expected format
          return { content: streamingChunks };
        } finally {
          // Always ensure interval is cleared
          clearInterval(checkInterval);
        }
      };
      
      // Get response from the LLM with streaming updates
      const response = await streamingOnAskQuestion(cleanedQuestion);
      
      // Streaming is complete
      setIsStreaming(false);
      
      // Ensure we handle the response with the right format
      // Using any here since we've already handled the conversion to the right format
      const typedResponse = response as any;
      
      if (typeof typedResponse === 'string') {
        // Add the message to state without logging during normal operation
        setMessages(prev => [...prev, { role: 'assistant', content: typedResponse }]);
        
        // Check for output file flag in the original message
        if (flags.o || flags.output) {
          const outputPath = flags.o || flags.output;
          try {
            // Make sure we pass string or true, not false or other boolean
            const validOutputPath = typeof outputPath === 'string' ? outputPath : true;
            await handleFileOutput(typedResponse, validOutputPath);
          } catch (err) {
            console.error(chalk.red(`Error saving file: ${err instanceof Error ? err.message : String(err)}`));
          }
        }
      } else {
        // Add the message to state without logging during normal operation
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: typedResponse.content || '',
          usage: typedResponse.usage
        }]);
        
        // Check for output file flag in the original message
        if (flags.o || flags.output) {
          const outputPath = flags.o || flags.output;
          try {
            // Make sure we pass string or true, not false or other boolean
            const validOutputPath = typeof outputPath === 'string' ? outputPath : true;
            await handleFileOutput(typedResponse.content || '', validOutputPath);
          } catch (err) {
            console.error(chalk.red(`Error saving file: ${err instanceof Error ? err.message : String(err)}`));
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setIsError(true);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setCurrentResponse('');
    }
  };

  // Render message with appropriate styling (no boxes, just alignment)
  const renderMessage = (message: {role: 'user' | 'assistant', content: string, usage?: any}, index: number) => {
    const { role, content, usage } = message;
    const isUser = role === 'user';
    const textColor = isUser ? 'blue' : 'green';
    
    // Parse markdown for assistant responses only
    let displayContent = content;
    if (role === 'assistant') {
      try {
        displayContent = marked(content).toString();
      } catch (error) {
        console.error('Error parsing markdown:', error);
      }
    }
    
    // Add a prefix to clearly indicate the role
    const prefix = isUser ? '👤 ' : '🐏 ';
    
    // Determine the maximum width based on role
    const width = isUser ? 70 : 80;
    
    if (isUser) {
      // User messages are right-aligned in a separate box layout
      return (
        <Box 
          key={index}
          flexDirection="column"
          marginY={1}
          width={width}
          alignSelf="flex-end"
        >
          <Box width={width} justifyContent="flex-end">
            <Text color={textColor} bold>{prefix}</Text>
          </Box>
          
          <Box width={width} justifyContent="flex-end">
            <Text color={textColor}>
              {displayContent.padStart(displayContent.length + 20, ' ')}
            </Text>
          </Box>
        </Box>
      );
    } else {
      // Assistant messages are left-aligned
      return (
        <Box 
          key={index}
          flexDirection="column"
          marginY={1}
          width={width}
        >
          <Box>
            <Text color={textColor} bold>{prefix}</Text>
          </Box>
          
          <Box paddingX={2}>
            <Text color={textColor}>
              {displayContent}
            </Text>
          </Box>
          
          {/* Show usage details if available for assistant messages */}
          {usage && usage.total_tokens && (
            <Box marginTop={1} alignSelf="flex-end">
              <Text color="gray" dimColor>
                Tokens: {usage.total_tokens} ({usage.prompt_tokens || '?'} prompt, {usage.completion_tokens || '?'} completion)
              </Text>
            </Box>
          )}
        </Box>
      );
    }
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
      <Text>/save [filename] - Save last response to file</Text>
      <Text>/attach /path/to/file.txt - Attach file to next message</Text>
      <Text>? - Toggle this help panel</Text>
      <Text bold>Message Flags:</Text>
      <Text>-f filename.txt - Attach file to current message</Text>
      <Text>--file=filename.txt - Alternative file syntax</Text>
      <Text>-o filename.txt - Save response to file</Text>
      <Text>--output=filename.txt - Alternative output syntax</Text>
      <Text>Examples:</Text>
      <Text>- What's in this file? -f code.js -o analysis.md</Text>
      <Text>- Analyze this data --file="data with spaces.csv" --output=report.md</Text>
    </Box>
  );

  return (
    <Box flexDirection="column" height="100%">
      {/* Messages Area (Scrollable) */}
      <Box flexDirection="column" flexGrow={1}>
        {messages.map((message, index) => 
          renderMessage(message, index)
        )}
        {isLoading && !isStreaming && (
          <Box marginY={1}>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text> 🐏 is thinking...</Text>
          </Box>
        )}
        
        {/* No streaming UI component - we use direct terminal output instead */}
        
        {isError && (
          <Box marginY={1}>
            <Text color="red">An error occurred. Please try again.</Text>
          </Box>
        )}
        {showCommandHelp && commandHelp}
        <Box ref={messagesEndRef} />
      </Box>
      
      {/* Input Area (Fixed at Bottom) - Always visible */}
      <Box 
        borderStyle="round"
        borderColor={isStreaming ? "yellow" : "gray"}
        padding={1}
        marginTop={1}
      >
        <Box>
          <Text>🐏 </Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={isStreaming ? () => {} : handleSubmit}
            placeholder={isStreaming ? "Streaming response..." : "Type your message or /command (? for help)"}
            focus={!isStreaming}
            showCursor={!isStreaming}
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
  onExecuteCommand: (command: string) => void,
  filePathOption?: string,
  outputPathOption?: string | true,
  overwriteOption?: boolean
): (() => void) => {
  const { unmount } = render(
    <ContinuousConversation
      initialQuestion={initialQuestion}
      onAskQuestion={onAskQuestion}
      onExit={onExit}
      onExecuteCommand={onExecuteCommand}
      filePathOption={filePathOption}
      outputPathOption={outputPathOption}
      overwriteOption={overwriteOption}
    />
  );
  
  // Return the unmount function to clean up
  return unmount;
};

export default ContinuousConversation;