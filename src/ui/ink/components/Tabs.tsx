import React from 'react';
import { Box, Text } from 'ink';

export type TabId = 'prompts';

export function Tabs(props: {
  active: TabId;
  onSelect: (id: TabId) => void;
  suffix?: string;
  right?: React.ReactNode;
  width?: number;
}) {
  const tabs: { id: TabId; label: string }[] = [{ id: 'prompts', label: 'Prompts (Ctrl+P)' }];
  const width = Math.max(10, props.width ?? 80);
  return (
    <Box width={width} justifyContent="space-between">
      <Box>
        {tabs.map((t) => (
          <Box key={t.id} marginRight={1}>
            <Text color={props.active === t.id ? 'cyan' : undefined}>
              {props.active === t.id ? '▌' : ' '}[ {t.label} ]
            </Text>
          </Box>
        ))}
        {props.suffix ? (
          <Box>
            <Text dimColor> {props.suffix}</Text>
          </Box>
        ) : null}
      </Box>
      <Box>{props.right ? props.right : null}</Box>
    </Box>
  );
}
