import React from 'react';
import {Box, Text} from 'ink';
import { stripAnsi } from '../../../lib/utils.js';

export function StatusBar(props: {help: string; gauge?: string; width?: number}) {
  const raw = `${props.gauge ? props.gauge + '  •  ' : ''}${props.help}`.replace(/\r?\n/g, ' ');
  const width = Math.max(10, (props.width ?? 80));
  // Leave a 1-char margin to avoid accidental wrap from wide glyphs / borders
  const maxVisible = Math.max(1, width - 1);
  const plain = stripAnsi(raw);
  const needsTrim = plain.length > maxVisible;
  const visible = needsTrim ? plain.slice(0, Math.max(0, maxVisible - 1)) + '…' : plain;
  return (
    <Box width={width}>
      <Text dimColor wrap="truncate-end">{visible}</Text>
    </Box>
  );
}
