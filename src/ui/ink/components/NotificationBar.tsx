import React from 'react';
import { Box, Text } from 'ink';

export function NotificationBar(props: {
  message: string;
  kind?: 'success' | 'error' | 'info';
  width?: number;
}) {
  const raw = (props.message || '').replace(/\r?\n/g, ' ');
  const safeW = Math.max(10, (props.width ?? 80) - 2);
  const text = raw.length > safeW ? raw.slice(0, Math.max(0, safeW - 1)) + '…' : raw;
  const bg = props.kind === 'error' ? 'red' : props.kind === 'info' ? 'yellow' : 'green';
  return (
    <Box>
      <Text color="black" backgroundColor={bg as any}>
        {' '}
        {text}{' '}
      </Text>
    </Box>
  );
}
