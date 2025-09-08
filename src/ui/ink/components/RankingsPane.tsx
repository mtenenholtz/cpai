import React, {useMemo} from 'react';
import {Box, Text} from 'ink';
import type { State } from '../../core/state.js';
import path from 'node:path';
import { buildEligible } from '../../core/selectors.js';

function padRight(s: string, w: number): string { return s.length > w ? s.slice(0, Math.max(0, w - 1)) + '…' : s.padEnd(w); }
function padLeft(n: number | string, w: number): string { const s = String(n); return s.length >= w ? s : ' '.repeat(w - s.length) + s; }

export function RankingsPane(props: {
  state: State;
  width: number;
  viewTop: number;
  visibleCount: number;
  onClampTop: (top: number) => void;
  selectedIndex?: number;
  nameW?: number;
  tokenW?: number;
  selectedSide?: 'files' | 'dirs';
}) {
  const { filesCol, dirsCol, rowCount } = useMemo(() => {
    const s = props.state;
    const eligible0 = buildEligible(s);
    const mutedDirs = [...s.rankMutedDirs];
    const isDirMuted = (p: string) => mutedDirs.some((d) => d === p || p.startsWith(d.endsWith('/') ? d : d + '/'));
    const eligible = eligible0.filter((f) => !s.rankMutedFiles.has(f.relPath) && !isDirMuted(path.posix.dirname(f.relPath)));
    const topFiles = [...eligible].sort((a, b) => b.tokens - a.tokens);
    const byDir = new Map<string, number>();
    for (const f of eligible) {
      const d = path.posix.dirname(f.relPath);
      byDir.set(d, (byDir.get(d) ?? 0) + f.tokens);
    }
    const topDirs = [...byDir.entries()].filter(([d]) => !isDirMuted(d)).sort((a, b) => b[1] - a[1]);

    const colWLocal = Math.max(20, Math.floor((props.width - 2) / 2));
    const tokenWLocal = 8;
    const cursorWLocal = 2;
    const nameWLocal = Math.max(8, colWLocal - tokenWLocal - cursorWLocal);
    const fileLines = topFiles.map((f) => ({ name: padRight(f.relPath, nameWLocal), tok: padLeft(f.tokens, tokenWLocal) }));
    const dirLines = topDirs.map(([d, t]) => ({ name: padRight(d || '.', nameWLocal), tok: padLeft(t, tokenWLocal) }));
    const count = Math.max(fileLines.length, dirLines.length);
    return { filesCol: fileLines, dirsCol: dirLines, rowCount: count };
  }, [props.state, props.width]);

  const vc = Math.max(0, props.visibleCount);
  const top = Math.max(0, Math.min(props.viewTop, Math.max(0, rowCount - vc)));
  if (top !== props.viewTop) props.onClampTop(top);
  const end = Math.min(rowCount, top + vc);

  const colW = Math.max(20, Math.floor((props.width - 2) / 2));
  const tokenW = props.tokenW ?? 8;
  const cursorW = 2;
  const nameW = props.nameW ?? Math.max(8, colW - tokenW - cursorW);

  const rows = [] as React.ReactNode[];
  for (let i = top; i < end; i++) {
    const isSel = props.selectedIndex === i;
    const selFiles = isSel && (props.selectedSide !== 'dirs');
    const selDirs = isSel && (props.selectedSide === 'dirs');
    const f = filesCol[i];
    const d = dirsCol[i];
    rows.push(
      <Box key={i}>
        <Box width={colW} marginRight={2}>
          <Box width={cursorW}><Text inverse={selFiles}>{selFiles ? '› ' : '  '}</Text></Box>
          <Box width={nameW}><Text wrap="truncate-end" inverse={selFiles}>{f?.name ?? ''.padEnd(nameW, ' ')}</Text></Box>
          <Box width={tokenW}><Text wrap="truncate-end" inverse={selFiles}>{f?.tok ?? ''.padEnd(tokenW, ' ')}</Text></Box>
        </Box>
        <Box width={colW}>
          <Box width={nameW}><Text wrap="truncate-end" inverse={selDirs}>{d?.name ?? ''.padEnd(nameW, ' ')}</Text></Box>
          <Box width={tokenW}><Text wrap="truncate-end" inverse={selDirs}>{d?.tok ?? ''.padEnd(tokenW, ' ')}</Text></Box>
        </Box>
      </Box>
    );
  }

  return <Box flexDirection="column">{rows.length ? rows : <Text dimColor>(no rankings)</Text>}</Box>;
}
