import React, { useState, useEffect } from 'react';
import { Text, useInput, Box } from 'ink';

interface TextInputProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  focus?: boolean;
  mask?: string;
}

const TextInput: React.FC<TextInputProps> = ({
  value: controlledValue,
  placeholder = '',
  onChange,
  onSubmit,
  focus = false,
  mask
}) => {
  const [{ value, cursorOffset }, setState] = useState({
    value: controlledValue,
    cursorOffset: controlledValue.length
  });

  useEffect(() => {
    setState(previousState => ({
      value: controlledValue,
      cursorOffset: Math.min(previousState.cursorOffset, controlledValue.length)
    }));
  }, [controlledValue]);

  const cursorActualPosition = mask ? cursorOffset : cursorOffset;

  useInput((input, key) => {
    if (focus === false) {
      return;
    }

    let nextCursorOffset = cursorOffset;
    let nextValue = value;

    if (key.return) {
      onSubmit(value);
      return;
    }

    if (key.leftArrow) {
      nextCursorOffset = Math.max(cursorOffset - 1, 0);
    } else if (key.rightArrow) {
      nextCursorOffset = Math.min(cursorOffset + 1, value.length);
    } else if (key.upArrow) {
      nextCursorOffset = 0;
    } else if (key.downArrow) {
      nextCursorOffset = value.length;
    } else if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        nextValue =
          value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
        nextCursorOffset = cursorOffset - 1;
      }
    } else if (key.ctrl && input === 'u') {
      // Ctrl+U clears the line before the cursor
      nextValue = value.slice(cursorOffset);
      nextCursorOffset = 0;
    } else if (key.ctrl && input === 'k') {
      // Ctrl+K clears the line after the cursor
      nextValue = value.slice(0, cursorOffset);
    } else if (key.ctrl && input === 'a') {
      // Ctrl+A moves cursor to the beginning
      nextCursorOffset = 0;
    } else if (key.ctrl && input === 'e') {
      // Ctrl+E moves cursor to the end
      nextCursorOffset = value.length;
    } else if (key.ctrl && input === 'w') {
      // Ctrl+W deletes a word backwards
      const beforeCursor = value.slice(0, cursorOffset);
      const afterCursor = value.slice(cursorOffset);
      const wordBoundary = beforeCursor.match(/\S+\s*$/);
      
      if (wordBoundary) {
        const wordStart = wordBoundary.index || 0;
        nextValue = beforeCursor.slice(0, wordStart) + afterCursor;
        nextCursorOffset = wordStart;
      }
    } else if (
      input.length === 1 &&
      !key.meta &&
      !key.ctrl
    ) {
      nextValue =
        value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
      nextCursorOffset = cursorOffset + 1;
    }

    if (nextValue !== value) {
      onChange(nextValue);
    }

    setState({
      value: nextValue,
      cursorOffset: nextCursorOffset
    });
  });

  const hasValue = value.length > 0;
  const renderedValue = mask ? mask.repeat(value.length) : value;
  const renderedPlaceholder = mask ? '' : placeholder;

  return (
    <Box>
      <Text>
        {hasValue ? renderedValue : renderedPlaceholder}
        {focus && (
          <Text inverse>
            {hasValue
              ? renderedValue.charAt(cursorActualPosition) || ' '
              : renderedPlaceholder.charAt(cursorActualPosition) || ' '}
          </Text>
        )}
      </Text>
    </Box>
  );
};

export default TextInput;