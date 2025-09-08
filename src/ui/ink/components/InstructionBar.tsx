import React from 'react';
import { Box, Text } from 'ink';

export function InstructionBar(props: { width?: number; right?: React.ReactNode }) {
  const width = props.width ?? undefined;
  return (
    <Box width={width} justifyContent="space-between">
      <Text dimColor>Press p to edit instructions</Text>
      {props.right ? <Box>{props.right}</Box> : null}
    </Box>
  );
}
