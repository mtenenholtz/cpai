import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import type { State } from '../../core/state.js';
import { buildEligible } from '../../core/selectors.js';
import { buildDirTree, makeVisibleTree } from '../../core/tree.js';
import path from 'node:path';

function padLeft(n: number | string, w: number): string { const s = String(n); return s.length >= w ? s : ' '.repeat(w - s.length) + s; }
function padRightStr(s: string, w: number): string { return s.length > w ? s.slice(0, Math.max(0, w - 1)) + '…' : s.padEnd(w); }

export function FilesPane(props: {
  state: State;
  viewTop: number;
  visibleCount: number;
  onClampTop: (top: number) => void;
  width?: number; // content width available inside the box
}) {
  const rowsData = useMemo(() => {
    const s = props.state;
    const eligible = new Set(buildEligible(s).map((f) => f.relPath));
    const root = buildDirTree(s.files, path.basename(s.cwd || '.'));
    return makeVisibleTree(root, s.treeExpanded, eligible).map((v) => {
      const tokens = v.kind === 'dir' ? v.tokens : v.file.tokens;
      const name = v.kind === 'dir' ? (v.node.name + '/') : v.file.relPath.split('/').pop()!;
      const indent = '  '.repeat(Math.max(0, v.depth));
      const status = v.kind === 'dir' ? (v.mixed ? 'mixed' : v.included ? 'included' : 'excluded') : (v.included ? 'included' : 'excluded');
      const mark = status === 'mixed' ? '◐' : status === 'included' ? '✔' : '✖';
      return { kind: v.kind, key: v.kind === 'dir' ? `d:${v.node.path}` : `f:${v.file.relPath}`, name, indent, mark, status, tokens } as const;
    });
  }, [props.state]);

  const vc = props.visibleCount;
  const top = Math.max(0, Math.min(props.viewTop, Math.max(0, rowsData.length - vc)));
  const end = Math.min(rowsData.length, top + vc);
  const slice = rowsData.slice(top, end);

  if (top !== props.viewTop) props.onClampTop(top);

  const contentWidth = Math.max(10, props.width ?? 60);
  const tokenW = 8;
  const markW = 2; // allow for wide glyphs like ✔/✖/◐
  const nameW = Math.max(5, contentWidth - (2 /*cursor*/ + markW + tokenW));

  return (
    <Box flexDirection="column">
      {slice.map((row, i) => {
        const idx = top + i;
        const isSel = idx === props.state.selectedIdx;
        const indentStr: string = (row as any).indent ?? '';
        const indentW = indentStr.length;
        const nameAvail = Math.max(5, nameW - indentW);
        const displayName = padRightStr((row as any).name, nameAvail);
        const displayTok = padLeft((row as any).tokens, tokenW);
        return (
          <Box key={(row as any).key} width={contentWidth}>
            <Box width={2}><Text inverse={isSel}>{isSel ? '› ' : '  '}</Text></Box>
            <Box width={indentW}><Text inverse={isSel}>{indentStr}</Text></Box>
            <Box width={markW}>
              <Text inverse={isSel} color={(row as any).status === 'mixed' ? 'yellow' : (row as any).status === 'included' ? 'green' : 'gray'}>
                {(row as any).mark}
              </Text>
            </Box>
            <Box width={nameAvail}><Text inverse={isSel}>{displayName}</Text></Box>
            <Box width={tokenW}><Text inverse={isSel}>{displayTok}</Text></Box>
          </Box>
        );
      })}
      {slice.length === 0 && <Text dimColor>(no files)</Text>}
    </Box>
  );
}
