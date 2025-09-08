import React from 'react';
import {Box, Text} from 'ink';
export function PromptBar(props: { width?: number }) {
  const width = props.width ?? undefined;
  return (
    <Box width={width}>
      <Text dimColor>Press p to edit instructions</Text>
    </Box>
  );
}
