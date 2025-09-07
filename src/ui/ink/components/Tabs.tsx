import React from 'react';
import {Box, Text} from 'ink';

export type TabId = 'tree' | 'flat' | 'prompts';

export function Tabs(props: { active: TabId; onSelect: (id: TabId) => void }) {
  const tabs: { id: TabId; label: string }[] = [
    { id: 'tree', label: 'Tree' },
    { id: 'flat', label: 'Flat' },
    { id: 'prompts', label: 'Prompts (Ctrl+P)' },
  ];
  return (
    <Box>
      {tabs.map((t) => (
        <Box key={t.id} marginRight={1}>
          <Text color={props.active === t.id ? 'cyan' : undefined}>
            {props.active === t.id ? '▌' : ' '}
            [ {t.label} ]
          </Text>
        </Box>
      ))}
    </Box>
  );
}
