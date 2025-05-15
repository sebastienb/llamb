import React, { FC, useState, useEffect } from 'react';
import { Text, Box, render, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { marked } from 'marked';
import chalk from 'chalk';

interface StreamingResponseProps {
  question: string;
  responseStream: (onChunk: (chunk: string) => void) => Promise<string | { cancelled: boolean, partialResponse: string }>;
  onComplete: (fullResponse: string) => void;
  abortController?: AbortController;
  isChatMode?: boolean; // Flag for continuous conversation mode
}

const StreamingResponse: FC<StreamingResponseProps> = ({
  question,
  responseStream,
  onComplete,
  abortController,
  isChatMode = false // Default to false for backward compatibility
}) => {
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  // Handle keyboard input for cancellation
  useInput((input, key) => {
    // Cancel on ESC key press
    if (key.escape && isLoading && !isComplete && !isCancelled) {
      setIsCancelled(true);
      setIsLoading(false);

      // Abort the fetch if possible
      if (abortController) {
        abortController.abort();
      }

      // Show cancelled message
      console.log('\n');
      console.log('\x1b[31mRequest cancelled by user\x1b[0m'); // Red text
      
      // Don't exit immediately - let the parent handle cleanup
      // This will be handled by the parent component's onComplete callback
    }
  });

  // Track if we've already processed a response to prevent duplicates
  const hasProcessedResponse = React.useRef(false);
  
  useEffect(() => {
    const fetchResponse = async () => {
      try {
        // Skip processing if we've already processed a response
        if (hasProcessedResponse.current) {
          return;
        }
        
        const response = await responseStream((chunk) => {
          if (!isCancelled) {
            setResponse(prev => prev + chunk);
          }
        });
        
        // Mark that we've now processed a response
        hasProcessedResponse.current = true;

        // Check if the response is a cancellation object
        if (response && typeof response === 'object' && 'cancelled' in response) {
          // Handle cancellation - this is a cancelled response
          console.log(chalk.dim(`Debug: StreamingResponse received cancelled response`));
          
          // If not already marked as cancelled, set it
          if (!isCancelled) {
            setIsCancelled(true);
            setIsLoading(false);
          }
          
          // Call onComplete with the partial response
          // This ensures proper cleanup even after cancellation
          const partialResponse = response.partialResponse || '';
          const safeResponse = typeof partialResponse === 'string' ? partialResponse : String(partialResponse || '');
          
          // Emit content ready event for cancellation
          (process as any).emit('llamb_content_ready', { cancelled: true, length: safeResponse.length });
          
          // Allow time for rendering to complete before cleanup
          setTimeout(() => {
            onComplete(safeResponse);
            // Let the parent handle cleanup and exit
          }, 500);
          
          return;
        }

        // Handle regular (non-cancelled) response
        const fullResponse = response; // Regular string response

        if (!isCancelled) {
          setIsComplete(true);
          setIsLoading(false);

          // In non-chat mode, just clean up without exiting
          if (!isChatMode) {
            console.log(''); // Add a newline for cleaner output
            // Ensure the response is valid and not undefined or null
            const safeResponse = typeof fullResponse === 'string' ? fullResponse : String(fullResponse || '');
            console.log(chalk.dim(`Debug: StreamingResponse preparing to call onComplete with ${safeResponse.length} characters`));
            console.log(chalk.dim(`Debug: First 50 chars of response: ${safeResponse.substring(0, 50).replace(/\n/g, '\\n')}...`));
            
            // Emit content ready event with length information
            // This lets the main process know the content is ready for file operations
            (process as any).emit('llamb_content_ready', { length: safeResponse.length });
            
            // Allow time for rendering to complete before exiting
            setTimeout(() => {
              onComplete(safeResponse);
            }, 500);
            return; // Prevent immediate call to onComplete
          } else {
            // Only call onComplete immediately in chat mode
            // Ensure the response is valid and not undefined or null
            const safeResponse = typeof fullResponse === 'string' ? fullResponse : String(fullResponse || '');
            console.log(chalk.dim(`Debug: StreamingResponse (chat mode) calling onComplete with ${safeResponse.length} characters`));
            console.log(chalk.dim(`Debug: First 50 chars of response: ${safeResponse.substring(0, 50).replace(/\n/g, '\\n')}...`));
            
            // Emit content ready event for chat mode too
            (process as any).emit('llamb_content_ready', { length: safeResponse.length });
            
            onComplete(safeResponse);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          // Don't display error message in the UI component
          // The error is already handled in llm.ts
          setIsLoading(false);
          
          // Call onComplete to ensure proper cleanup
          onComplete('');
          
          // Don't call process.exit() here, let the main error handler in llm.ts handle it
          // This prevents exiting before the error message is shown
        }
      }
    };

    // Only fetch if not cancelled and we haven't processed a response yet
    if (!isCancelled && !hasProcessedResponse.current) {
      fetchResponse();
    } else {
      // If already cancelled (e.g., user pressed ESC), ensure loading is stopped
      setIsLoading(false);
      
      // Make sure to call onComplete with partial response to ensure proper cleanup
      // Only do this if we haven't already processed a response
      if (!hasProcessedResponse.current) {
        hasProcessedResponse.current = true;
        setTimeout(() => {
          onComplete(response || '');
        }, 500);
      }
    }

    // Cleanup function to handle unmounting
    return () => {
      // Mark the response as processed on cleanup to prevent further processing
      hasProcessedResponse.current = true;
    };
  }, [responseStream, onComplete, isCancelled, response]);

  // Parse markdown to text for display
  const displayResponse = response ? marked(response).toString() : '';

  // Update page title to show cancellation option when streaming
  useEffect(() => {
    if (isLoading && response && !isComplete && !isCancelled) {
      process.title = 'LLaMB - Press ESC to cancel';
      return () => {
        process.title = 'LLaMB';
      };
    }
  }, [isLoading, response, isComplete, isCancelled]);

  // Use effect to notify when rendering is complete - use a ref to track if we've already emitted
  const hasEmittedRenderComplete = React.useRef(false);
  
  useEffect(() => {
    if (isComplete && !isLoading && response && !hasEmittedRenderComplete.current) {
      // Notify that rendering is complete using a custom event
      // instead of writing directly to stdout
      (process as any).emit('llamb_render_complete');
      hasEmittedRenderComplete.current = true;
    }
  }, [isComplete, isLoading, response]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text dimColor>Asking: {question}</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={1}
        marginY={1}
      >
        {isLoading && !response && (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text> Thinking...</Text>
          </Box>
        )}

        {response && (
          <Text>{displayResponse}</Text>
        )}
      </Box>

      {isLoading && response && (
        <Box marginTop={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Still receiving response... (Press ESC to cancel)</Text>
        </Box>
      )}

      {isCancelled && (
        <Box marginTop={1}>
          <Text color="red">Request cancelled by user</Text>
        </Box>
      )}
    </Box>
  );
};

// Helper function to render the component
export const renderStreamingResponse = (
  question: string,
  responseStream: (onChunk: (chunk: string) => void) => Promise<string | { cancelled: boolean, partialResponse: string }>,
  onComplete: (fullResponse: string) => void,
  abortController?: AbortController,
  isChatMode: boolean = false // Default to non-chat mode
): () => void => {
  // Create a new render instance with the StreamingResponse component
  const { unmount } = render(
    <StreamingResponse
      question={question}
      responseStream={responseStream}
      onComplete={onComplete}
      abortController={abortController}
      isChatMode={isChatMode}
    />
  );

  // Return the unmount function to clean up
  return unmount;
};

export default StreamingResponse;