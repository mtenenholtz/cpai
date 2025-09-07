import React from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';

export function PromptBar(props: {
  value: string;
  onChange: (v: string) => void;
  focused: boolean;
  onSubmit?: () => void;
  onEscape?: () => void;
  onOpenEditor?: () => void;
}) {
  return (
    <Box>
      <Text color="cyan">Prompt: </Text>
      <TextInput
        value={props.value}
        onChange={props.onChange}
        focus={props.focused}
        onSubmit={props.onSubmit}
      />
      {!props.focused && <Text dimColor>  (press p • Shift+P=editor)</Text>}
    </Box>
  );
}
