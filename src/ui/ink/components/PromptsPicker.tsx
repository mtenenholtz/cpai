import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SavedPrompt } from '../../core/state.js';

export function PromptsPicker(props: {
  prompts: SavedPrompt[];
  initialSelected: Set<string>;
  width: number;
  height: number;
  onApply: (names: string[]) => void;
  onCancel: () => void;
}) {
  const items = useMemo(
    () => props.prompts.map((p) => ({ name: p.name, origin: p.origin })),
    [props.prompts],
  );
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set(props.initialSelected));

  useInput((input, key) => {
    if (key.escape) {
      props.onCancel();
      return;
    }
    if (key.return) {
      props.onApply([...sel]);
      return;
    }
    if (input === 'j' || key.downArrow) setIdx((i) => Math.min(items.length - 1, i + 1));
    if (input === 'k' || key.upArrow) setIdx((i) => Math.max(0, i - 1));
    if (input === ' ') {
      const name = items[idx]?.name;
      if (!name) return;
      const next = new Set(sel);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSel(next);
    }
  });

  const headerH = 1;
  const bodyH = Math.max(1, props.height - headerH - 1);
  const visible = items.slice(0, bodyH);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
      height={props.height}
      width={props.width}
    >
      <Box height={1}>
        <Text color="cyan">Prompts (space=toggle, Enter=apply, Esc=cancel)</Text>
      </Box>
      <Box flexDirection="column">
        {visible.length === 0 ? (
          <Text dimColor>(no saved prompts found)</Text>
        ) : (
          visible.map((item, i) => {
            const isSel = i === idx;
            const mark = sel.has(item.name) ? 'x' : ' ';
            const scope = item.origin === 'global' ? ' (global)' : '';
            return (
              <Text key={item.name} inverse={isSel}>
                [{mark}] {item.name}
                {scope}
              </Text>
            );
          })
        )}
      </Box>
    </Box>
  );
}
