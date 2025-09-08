import React from 'react';
import {Box, Text} from 'ink';

function hyperlink(text: string, url: string): string {
  // OSC 8 hyperlink: ESC ] 8 ;; url ST text ESC ] 8 ;; ST
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}

export function PromptBar(props: { width?: number }) {
  const width = props.width ?? undefined;
  const docsUrl = 'https://github.com/mtenenholtz/cpai/blob/main/docs/tui.md';
  const docsLink = hyperlink('Read the documentation', docsUrl);
  return (
    <Box width={width} justifyContent="space-between">
      <Text dimColor>Press p to edit instructions</Text>
      <Text color="cyan">{docsLink}</Text>
    </Box>
  );
}
