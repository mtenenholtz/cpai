import React from 'react';
import {Box, Text} from 'ink';

export function StatusBar(props: {help: string; gauge?: string; width?: number}) {
  const raw = `${props.gauge ? props.gauge + '  •  ' : ''}${props.help}`.replace(/\r?\n/g, ' ');
  // Leave extra headroom to avoid accidental wrapping due to wide glyphs
  const safeW = Math.max(10, (props.width ?? 80) - 6);
  const text = raw.length > safeW ? raw.slice(0, Math.max(0, safeW - 1)) + '…' : raw;
  return (
    <Box>
      <Text dimColor>{text}</Text>
    </Box>
  );
}
