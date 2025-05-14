import React, { FC, useState, useEffect } from 'react';
import { Text, Box, render, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { marked } from 'marked';

interface StreamingResponseProps {
  question: string;
  responseStream: (onChunk: (chunk: string) => void) => Promise<string>;
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

      // Exit after a brief delay to show the cancelled message
      setTimeout(() => {
        console.log('\n');
        console.log('\x1b[31mRequest cancelled by user\x1b[0m'); // Red text
        process.exit(0);
      }, 200);
    }
  });

  useEffect(() => {
    const fetchResponse = async () => {
      try {
        const fullResponse = await responseStream((chunk) => {
          if (!isCancelled) {
            setResponse(prev => prev + chunk);
          }
        });

        if (!isCancelled) {
          setIsComplete(true);
          setIsLoading(false);
          onComplete(fullResponse);

          // Auto-exit for non-chat mode after a short delay to allow UI updates
          if (!isChatMode) {
            setTimeout(() => {
              console.log(''); // Add a newline for cleaner output
              process.exit(0);
            }, 300);
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

    if (!isCancelled) {
      fetchResponse();
    }

    // Cleanup function to handle unmounting
    return () => {
      // No cleanup needed at this time
    };
  }, [responseStream, onComplete, isCancelled]);

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
  responseStream: (onChunk: (chunk: string) => void) => Promise<string>,
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