import React, { FC, useState, useEffect } from 'react';
import { Text, Box, render } from 'ink';
import Spinner from 'ink-spinner';
import { marked } from 'marked';

interface StreamingResponseProps {
  question: string;
  responseStream: (onChunk: (chunk: string) => void) => Promise<string>;
  onComplete: (fullResponse: string) => void;
}

const StreamingResponse: FC<StreamingResponseProps> = ({
  question,
  responseStream,
  onComplete
}) => {
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const fetchResponse = async () => {
      try {
        const fullResponse = await responseStream((chunk) => {
          setResponse(prev => prev + chunk);
        });

        setIsComplete(true);
        setIsLoading(false);
        onComplete(fullResponse);
      } catch (error) {
        console.error('Error fetching response:', error);
        setIsLoading(false);
      }
    };

    fetchResponse();
  }, [responseStream, onComplete]);

  // Parse markdown to text for display
  const displayResponse = response ? marked(response).toString() : '';

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
          <Text> Still receiving response...</Text>
        </Box>
      )}
    </Box>
  );
};

// Helper function to render the component
export const renderStreamingResponse = (
  question: string,
  responseStream: (onChunk: (chunk: string) => void) => Promise<string>,
  onComplete: (fullResponse: string) => void
): () => void => {
  // Create a new render instance with the StreamingResponse component
  const { unmount } = render(
    <StreamingResponse
      question={question}
      responseStream={responseStream}
      onComplete={onComplete}
    />
  );

  // Return the unmount function to clean up
  return unmount;
};

export default StreamingResponse;