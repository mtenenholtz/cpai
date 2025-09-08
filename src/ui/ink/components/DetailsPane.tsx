import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import type { State } from '../../core/state.js';
import { buildEligible } from '../../core/selectors.js';
import { buildDirTree, makeVisibleTree } from '../../core/tree.js';
import path from 'node:path';
import { humanBytes } from '../../../lib/utils.js';

export function DetailsPane(props: { state: State; selectedIdx: number; height: number }) {
  const { state } = props;

  const body = useMemo(() => {
    const eligible = new Set(buildEligible(state).map((f) => f.relPath));
    const root = buildDirTree(state.files, path.basename(state.cwd || '.'));
    const vis = makeVisibleTree(root, state.treeExpanded, eligible);
    const node = vis[props.selectedIdx];
    if (!node) return <Text dimColor>(no selection)</Text>;
    if (node.kind === 'file') {
      const f = node.file;
      const excluded = state.manualExcluded.has(f.relPath) || state.autoDeselected.has(f.relPath);
      return (
        <Box flexDirection="column">
          <Text color="cyan">{f.relPath}</Text>
          <Text>
            bytes={humanBytes(f.bytes)}  lines={f.lines}  tokens={f.tokens}  {excluded ? 'EXCLUDED' : 'INCLUDED'}
          </Text>
        </Box>
      );
    } else {
      const dirPath = node.node.path === '.' ? '' : node.node.path + '/';
      const files = state.files.filter((f) => dirPath === '' || f.relPath.startsWith(dirPath));
      let bytes = 0,
        lines = 0,
        tokens = 0,
        included = 0;
      for (const f of files) {
        bytes += f.bytes;
        lines += f.lines;
        tokens += f.tokens;
        if (!state.manualExcluded.has(f.relPath) && !state.autoDeselected.has(f.relPath)) included += 1;
      }
      return (
        <Box flexDirection="column">
          <Text color="cyan">{((node.node.path === '.' ? path.basename(state.cwd || '.') : node.node.path) + '/')}</Text>
          <Text>
            selected={included}/{files.length} files  tokens={tokens}  lines={lines}  bytes={humanBytes(bytes)}
          </Text>
        </Box>
      );
    }
  }, [state, props.selectedIdx]);

  return <Box flexDirection="column">{body}</Box>;
}
