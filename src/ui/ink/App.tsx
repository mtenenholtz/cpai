import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useInput, measureElement, useApp} from 'ink';
import {loadAicpConfig} from '../../lib/config.js';
import {makeDefaultState, type State} from '../core/state.js';
import {rescan, renderPackedText, loadSavedPrompts} from '../core/actions.js';
import {buildEligible} from '../core/selectors.js';
import {buildDirTree, makeVisibleTree, type VisibleNode} from '../core/tree.js';
import {Tabs, type TabId} from './components/Tabs.js';
import {FilesPane} from './components/FilesPane.js';
import {RankingsPane} from './components/RankingsPane.js';
import {PromptBar} from './components/PromptBar.js';
import {StatusBar} from './components/StatusBar.js';
import {DetailsPane} from './components/DetailsPane.js';
import {PromptEditor} from './components/PromptEditor.js';
import {PromptsPicker} from './components/PromptsPicker.js';
import clipboard from 'clipboardy';
import {useMouse, type MouseEvent as InkMouseEvent} from './hooks/useMouse.js';
import path from 'node:path';

export function App(props: {cwd: string; promptText?: string; promptsDir?: string; openPromptPicker?: boolean; mouse?: boolean}) {
  const { exit } = useApp();
  // Fixed-height headers for Files list to mirror Rankings and keep symmetric vertical structure
  function FilesHeaders({ width, highlight }: { width: number; highlight: boolean }) {
    const cursorW = 2;
    const markW = 2;
    const tokenW = 8;
    const nameW = Math.max(8, width - (cursorW + markW + tokenW));
    return (
      <Box height={1} flexShrink={0}>
        <Box width={cursorW}><Text>  </Text></Box>
        <Box width={markW}><Text>  </Text></Box>
        <Box width={nameW}><Text color={highlight ? 'cyan' : undefined}>Name</Text></Box>
        <Box width={tokenW}><Text color={highlight ? 'cyan' : undefined}>Tokens</Text></Box>
      </Box>
    );
  }
  // Fixed-height headers for the Rankings list to avoid flex collapsing/overlap
  function RankingsHeaders({ width, highlight }: { width: number; highlight: boolean }) {
    const colW = Math.max(20, Math.floor((width - 2) / 2));
    const tokenW = 8;
    const cursorW = 2;
    const nameW = Math.max(8, colW - tokenW - cursorW);
    return (
      <Box height={1} flexShrink={0}>
        <Box width={colW} marginRight={2}>
          <Box width={cursorW}><Text>  </Text></Box>
          <Box width={nameW}><Text color={highlight ? 'cyan' : undefined}>Files</Text></Box>
          <Box width={tokenW}><Text color={highlight ? 'cyan' : undefined}>Tokens</Text></Box>
        </Box>
        <Box width={colW}>
          <Box width={nameW}><Text color={highlight ? 'cyan' : undefined}>Folders</Text></Box>
          <Box width={tokenW}><Text color={highlight ? 'cyan' : undefined}>Tokens</Text></Box>
        </Box>
      </Box>
    );
  }
  const {cwd} = props;
  const [state, setState] = useState<State | null>(null);
  const [progress, setProgress] = useState<{done: number; total: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewTop, setViewTop] = useState(0);
  const [rankTop, setRankTop] = useState(0);
  const [focusPane, setFocusPane] = useState<'files' | 'rankings'>('files');
  const [rankIdx, setRankIdx] = useState(0);
  const [rankSide, setRankSide] = useState<'files' | 'dirs'>('files');
  const [rows, setRows] = useState<number>(process.stdout.rows || 24);
  const [cols, setCols] = useState<number>(process.stdout.columns || 80);
  const [focusPrompt, setFocusPrompt] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [showPromptsPicker, setShowPromptsPicker] = useState(false);
  const filesBodyRef = useRef<any>(null);
  const ranksBodyRef = useRef<any>(null);
  useEffect(() => {
    const onResize = () => {
      setRows(process.stdout.rows || 24);
      setCols(process.stdout.columns || 80);
    };
    // @ts-ignore - Node types allow resize on stdout
    process.stdout.on('resize', onResize);
    return () => {
      // @ts-ignore
      process.stdout.off?.('resize', onResize);
    };
  }, []);

  // helper to force rerender after mutating state (core helpers mutate in place)
  function bump(next: State) {
    // Clamp indices and viewport
    const total = next.treeMode ? visibleNodes(next).length : next.files.length;
    if (next.selectedIdx < 0) next.selectedIdx = 0;
    if (next.selectedIdx >= total) next.selectedIdx = Math.max(0, total - 1);
    const vc = visibleCount();
    if (next.selectedIdx < viewTop) setViewTop(next.selectedIdx);
    else if (next.selectedIdx >= viewTop + vc) setViewTop(Math.max(0, next.selectedIdx - Math.max(1, Math.floor(vc / 2))));
    // copy to trigger render
    setState({...next});
  }

  function visibleCount(): number {
    const header = 2; // title + blank
    const footer = 3; // prompt + hint
    const usable = Math.max(3, (rows || 24) - header - footer);
    return usable;
  }

  function visibleNodes(s: State): VisibleNode[] {
    const eligible = new Set(buildEligible(s).map(f => f.relPath));
    const root = buildDirTree(s.files);
    return makeVisibleTree(root, s.treeExpanded, eligible);
  }

  useEffect(() => {
    (async () => {
      try {
        const fileCfg = await loadAicpConfig(cwd);
        const s = makeDefaultState(cwd, fileCfg);
        s.promptText = props.promptText ?? s.promptText;
        s.availablePrompts = await loadSavedPrompts(cwd, props.promptsDir);
        await rescan(s, (d, t) => setProgress({done: d, total: t}));
        setState({...s});
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, [cwd]);

  // Keybindings: j/k/g/G, space, T, Ctrl-R, q/C-c; p to focus prompt; d to toggle details/rank
  useInput((input, key) => {
    if (!state) return;
    if (editingPrompt) return;
    if (focusPrompt) {
      // While prompt has focus, let TextInput consume input; Esc exits
      if (key.escape) setFocusPrompt(false);
      return;
    }
    // Hotkeys only; numeric shortcuts disabled
    if (key.ctrl && input === 'p') { setShowPromptsPicker(true); return; }
    if (input === 'P') { setEditingPrompt(true); return; }
    if (key.ctrl && input === 'c') { exit(); return; }
    if (input === 'q') { exit(); return; }
    if (key.ctrl && input === 'r') {
      (async () => {
        setProgress({done: 0, total: 0});
        await rescan(state, (d, t) => setProgress({done: d, total: t}));
        setProgress(null);
        bump(state);
      })();
      return;
    }
    if (input === 'P') { setEditingPrompt(true); return; }
    if (input === 'c') {
      (async () => {
        try {
          setStatusMsg('Copying…');
          const eligible = buildEligible(state);
          const { text, selected, tokens } = await renderPackedText(eligible, state);
          try {
            await clipboard.write(text);
            setStatusMsg(`Copied ${selected.length} files (≈${tokens})`);
          } catch (e: any) {
            const ok = osc52Copy(text);
            if (ok) setStatusMsg(`Copied ${selected.length} files via OSC52`);
            else setStatusMsg(`Clipboard failed: ${e?.message ?? e}`);
          }
        } catch (e: any) {
          setStatusMsg(`Copy failed: ${e?.message ?? e}`);
        }
      })();
      return;
    }
    if (input === 'p') { setFocusPrompt(true); return; }
    if (input === 'd') { state.paneMode = state.paneMode === 'rank' ? 'details' : 'rank'; bump(state); return; }
    if (input === 'T') {
      state.treeMode = !state.treeMode;
      if (state.treeMode && !state.treeExpanded.has('.')) state.treeExpanded.add('.');
      bump(state);
      return;
    }
    if (state.treeMode && (input === 'h')) {
      const vis = visibleNodes(state);
      const node = vis[state.selectedIdx];
      if (node && node.kind === 'dir' && node.node.path !== '.' && state.treeExpanded.has(node.node.path)) {
        state.treeExpanded.delete(node.node.path);
        bump(state);
      }
      return;
    }
    if (state.treeMode && (input === 'l')) {
      const vis = visibleNodes(state);
      const node = vis[state.selectedIdx];
      if (node && node.kind === 'dir') {
        state.treeExpanded.add(node.node.path);
        bump(state);
      }
      return;
    }
    if (input === 'j' || key.downArrow) {
      if (focusPane === 'files') {
        state.selectedIdx += 1;
        bump(state);
      } else {
        setRankIdx((i) => { const next = i + 1; ensureRankVisible(next); return next; });
      }
      return;
    }
    if (input === 'k' || key.upArrow) {
      if (focusPane === 'files') {
        state.selectedIdx -= 1;
        bump(state);
      } else {
        setRankIdx((i) => { const next = Math.max(0, i - 1); ensureRankVisible(next); return next; });
      }
      return;
    }
    if (input === 'g') {
      if (focusPane === 'files') { state.selectedIdx = 0; bump(state); }
      else { setRankIdx(0); setRankTop(0); }
      return;
    }
    if (input === 'G') {
      if (focusPane === 'files') {
        const total = state.treeMode ? visibleNodes(state).length : state.files.length;
        state.selectedIdx = Math.max(0, total - 1); bump(state);
      } else {
        const total = computeRankRowCount(state);
        const last = Math.max(0, total - 1);
        setRankIdx(last);
        ensureRankVisible(last);
      }
      return;
    }

    if (input === ' ') {
      if (state.treeMode) {
        const vis = visibleNodes(state);
        const node = vis[state.selectedIdx];
        if (!node) return;
        if (node.kind === 'file') {
          const rel = node.file.relPath;
          if (state.manualExcluded.has(rel)) state.manualExcluded.delete(rel); else state.manualExcluded.add(rel);
        } else {
          const dirPath = node.node.path === '.' ? '' : node.node.path + '/';
          const makeExcluded = !(node.included && !node.mixed);
          for (const f of state.files) {
            if (dirPath === '' || f.relPath.startsWith(dirPath)) {
              if (makeExcluded) state.manualExcluded.delete(f.relPath);
              else state.manualExcluded.add(f.relPath);
            }
          }
        }
      } else {
        const f = state.files[state.selectedIdx];
        if (f) {
          if (state.manualExcluded.has(f.relPath)) state.manualExcluded.delete(f.relPath); else state.manualExcluded.add(f.relPath);
        }
      }
      bump(state);
      return;
    }
    if (input === 'w') {
      setFocusPane((p) => {
        const next = p === 'files' ? 'rankings' : 'files';
        if (next === 'rankings' && state.paneMode !== 'rank') { state.paneMode = 'rank'; bump(state); }
        return next;
      });
      return;
    }
    if (focusPane === 'rankings' && key.tab) { setRankSide(s => s === 'files' ? 'dirs' : 'files'); return; }
  });

  function osc52Copy(text: string): boolean {
    try {
      if (!process.stdout.isTTY) return false;
      const b64 = Buffer.from(text, 'utf8').toString('base64');
      const seq = `\u001b]52;c;${b64}\u0007`;
      process.stdout.write(seq);
      return true;
    } catch {
      return false;
    }
  }

  const tokenGauge = useMemo(() => {
    if (!state) return '';
    const eligible = buildEligible(state);
    const totalTok = eligible.reduce((a, f) => a + f.tokens, 0);
    return state.maxTokens ? `tokens ${totalTok}/${state.maxTokens}` : `tokens≈${totalTok}`;
  }, [state]);

  function computeRankRowCount(s: State): number {
    const eligible0 = buildEligible(s);
    const mutedDirs = [...s.rankMutedDirs];
    const isDirMuted = (p: string) => mutedDirs.some((d) => d === p || p.startsWith(d.endsWith('/') ? d : d + '/'));
    const eligible = eligible0.filter((f) => !s.rankMutedFiles.has(f.relPath) && !isDirMuted(path.posix.dirname(f.relPath)));
    const byDir = new Map<string, number>();
    for (const f of eligible) {
      const d = path.posix.dirname(f.relPath);
      byDir.set(d, (byDir.get(d) ?? 0) + f.tokens);
    }
    return Math.max(eligible.length, byDir.size);
  }

  // Ensure rankings selection is within the visible window by adjusting rankTop
  function ensureRankVisible(targetIdx: number) {
    if (!state) return;
    const g = calcGeometry({ rows: rows || 24, cols: cols || 80, focusPane, paneMode: state.paneMode });
    const vc = Math.max(1, g.ranksBodyH);
    setRankTop((t) => {
      let top = t;
      if (targetIdx < top) top = targetIdx;
      else if (targetIdx >= top + vc) top = Math.max(0, targetIdx - vc + 1);
      return top;
    });
  }

  // Geometry helper for mouse hit-testing that mirrors render math exactly
  function calcGeometry(opts: {
    rows: number;
    cols: number;
    focusPane: 'files' | 'rankings';
    paneMode: State['paneMode'];
  }) {
    const { rows, cols, focusPane } = opts;
    const safetyLocal = 1;
    const tabsH = 1;
    const promptH = 1;
    const statusH = 1;
    const midHLocal = Math.max(3, rows - tabsH - promptH - statusH - safetyLocal);
    const innerHLocal = Math.max(1, midHLocal - 2); // minus borders
    const filesBodyHLocal = Math.max(1, innerHLocal - 2); // minus title+headers
    const ranksBodyHLocal = Math.max(1, innerHLocal - 2);

    const totalCols = cols || 80;
    const leftWidthLocal = Math.max(20, Math.floor(totalCols * (focusPane === 'files' ? 0.6 : 0.4)));
    const rightWidthLocal = Math.max(20, totalCols - leftWidthLocal - 2); // -2 gutter

    // Root has paddingX={1} so content starts at col 2 (1-based)
    const rootPadX = 1;
    const contentX1 = rootPadX + 1;
    const contentW = Math.max(1, totalCols - 2);
    const leftBoxX1 = rootPadX + 1; // left border col
    const leftBoxX2 = leftBoxX1 + leftWidthLocal - 1;
    const rightBoxX1 = leftBoxX2 + 2; // +1 to move past left box, +1 gutter accounted in split
    const rightBoxX2 = rightBoxX1 + rightWidthLocal - 1;

    const midY1 = tabsH + 1; // top border row of panes
    const bodyY1 = midY1 + 1 /*top border*/ + 1 /*title*/ + 1 /*headers*/;
    const filesBodyY1 = bodyY1;
    const filesBodyY2 = filesBodyY1 + filesBodyHLocal - 1;
    const ranksBodyY1 = bodyY1;
    const ranksBodyY2 = ranksBodyY1 + ranksBodyHLocal - 1;

    return {
      leftBoxX1,
      leftBoxX2,
      rightBoxX1,
      rightBoxX2,
      filesBodyY1,
      filesBodyY2,
      ranksBodyY1,
      ranksBodyY2,
      filesBodyH: filesBodyHLocal,
      ranksBodyH: ranksBodyHLocal,
      // inner content columns for rankings
      ranksCols: {
        contentX1: rightBoxX1 + 2, // border + padding
        colW: Math.max(20, Math.floor(((rightWidthLocal - 4) - 2) / 2)), // content width minus marginRight 2, then split
        cursorW: 2,
        margin: 2,
      },
      tabs: {
        y: 1,
        x1: contentX1,
        width: contentW,
        slotW: Math.max(1, Math.floor(contentW / 3)),
      },
    };
  }

  // Clamp ranking selection + viewport whenever inputs change
  useEffect(() => {
    const s = state;
    if (!s) return;
    // Use a local computed viewport height; when rows are small contentH will be recomputed later too
    const total = computeRankRowCount(s);
    const vcLocal = Math.max(1, (rows || 24) - 1 - 1 - 1 - 1 - 3); // rows - tabs - prompt - status - safety - borders/header
    setRankIdx((i) => Math.max(0, Math.min(i, Math.max(0, total - 1))));
    ensureRankVisible(rankIdx);
  }, [state, rows]);

  // Mouse support: click to select/focus; wheel to scroll
  const handleMouse = useCallback((ev: InkMouseEvent) => {
    try {
      if (!state) return;
      if (focusPrompt) return; // disable mouse interactions while typing prompt
      const g = calcGeometry({ rows: rows || 24, cols: cols || 80, focusPane, paneMode: state.paneMode });

      // Files pane
      const inFiles = ev.x >= g.leftBoxX1 && ev.x <= g.leftBoxX2 && ev.y >= g.filesBodyY1 && ev.y <= g.filesBodyY2;
      if (inFiles) {
        if (ev.type === 'wheelUp') { setViewTop((t) => Math.max(0, t - 3)); return; }
        if (ev.type === 'wheelDown') {
          const total = state.treeMode ? visibleNodes(state).length : state.files.length;
          const maxTop = Math.max(0, total - g.filesBodyH);
          setViewTop((t) => Math.min(maxTop, t + 3));
          return;
        }
        if (ev.type === 'down') {
          const row = ev.y - g.filesBodyY1; // 0-based inside body
          const total = state.treeMode ? visibleNodes(state).length : state.files.length;
          const targetIdx = Math.max(0, Math.min(total - 1, viewTop + row));
          setFocusPane('files');
          state.selectedIdx = targetIdx; bump(state);
          return;
        }
      }

      // Rankings pane (only when visible)
      if (state.paneMode === 'rank') {
        const inRanks = ev.x >= g.rightBoxX1 && ev.x <= g.rightBoxX2 && ev.y >= g.ranksBodyY1 && ev.y <= g.ranksBodyY2;
        if (inRanks) {
          if (ev.type === 'wheelUp') { setRankTop((t) => Math.max(0, t - 3)); return; }
          if (ev.type === 'wheelDown') { setRankTop((t) => t + 3); return; }
          if (ev.type === 'down') {
            const row = ev.y - g.ranksBodyY1;
            const total = computeRankRowCount(state);
            const targetIdx = Math.max(0, Math.min(total - 1, rankTop + row));
            setFocusPane('rankings');
            // Determine which column (files vs dirs)
            const c = g.ranksCols;
            const leftColX1 = c.contentX1;
            const leftColX2 = leftColX1 + c.colW - 1;
            const rightColX1 = leftColX2 + c.margin + 1;
            // const rightColX2 = rightColX1 + c.colW - 1;
            setRankSide(ev.x <= leftColX2 ? 'files' : 'dirs');
            setRankIdx(targetIdx);
            return;
          }
        }
      }

      // Tabs click: map x to one of 3 slots (Tree, Flat, Prompts)
      if (ev.type === 'down' && ev.y === g.tabs.y) {
        const slot = Math.min(2, Math.max(0, Math.floor((ev.x - g.tabs.x1) / g.tabs.slotW)));
        if (slot === 0) { state.treeMode = true; bump(state); return; }
        if (slot === 1) { state.treeMode = false; bump(state); return; }
        if (slot === 2) { setFocusPrompt(true); return; }
      }
    } catch {}
  }, [rows, cols, focusPane, state, viewTop, rankTop, focusPrompt]);

  const mouseAllowed = !!props.mouse && !focusPrompt && !editingPrompt;
  useMouse(handleMouse, mouseAllowed);
  useEffect(() => {
    if (!mouseAllowed) {
      try {
        process.stdout.write('\u001b[?1006l');
        process.stdout.write('\u001b[?1003l');
        process.stdout.write('\u001b[?1002l');
        process.stdout.write('\u001b[?1000l');
      } catch {}
    }
  }, [mouseAllowed]);

  if (error) return (
    <Box flexDirection="column">
      <Text color="red">Ink UI failed: {error}</Text>
      <Text>Check configuration and try again.</Text>
    </Box>
  );

  if (!state) return (
    <Box>
      <Text>Scanning… {progress ? `${progress.done}/${progress.total}` : ''}</Text>
    </Box>
  );

  // Height budget: Tabs(1) + Prompt(1) + Status(1) + safety(1)
  const safety = 1; // spare row to absorb any wrap
  const midH = Math.max(3, (rows || 24) - 1 - 1 - 1 - safety);
  // Inner area for each bordered pane (exclude top/bottom border)
  const innerH = Math.max(1, midH - 2);
  // Body heights inside panes
  const filesBody = Math.max(1, innerH - 2);     // minus title and headers
  const ranksBody = Math.max(1, innerH - 2);     // minus title and headers
  const safeCols = Math.max(10, (cols || 80) - 2); // account for root paddingX={1}
  const fullHelp = `${focusPane === 'files' ? 'Files' : 'Rankings'} • j/k scroll • g/G home/end • space toggle • T tree/flat • d details/rank • w swap • p prompt • Shift+P editor • Ctrl-R rescan • q quit${statusMsg ? ' • ' + statusMsg : ''}`;
  const shortHelp = `${focusPane === 'files' ? 'Files' : 'Rankings'} • j/k • g/G • space • T • d • w • p • Shift+P • Ctrl-R • q${statusMsg ? ' • ' + statusMsg : ''}`;
  const help = safeCols >= 108 ? fullHelp : shortHelp;

  // moved above the early returns; see earlier block

  const activeTab: TabId = state.treeMode ? 'tree' : 'flat';
  const onSelectTab = (id: TabId) => {
    if (!state) return;
    if (id === 'tree') { state.treeMode = true; bump(state); }
    else if (id === 'flat') { state.treeMode = false; bump(state); }
    else if (id === 'prompts') { setFocusPrompt(true); }
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Tabs active={activeTab} onSelect={onSelectTab} />
      <Box height={midH}>
        {editingPrompt ? (
          <PromptEditor
            initialValue={state.promptText ?? ''}
            width={safeCols}
            height={midH}
            onSubmit={(text) => { state.promptText = text; bump(state); setEditingPrompt(false); setStatusMsg('Prompt saved'); }}
            onCancel={() => { setEditingPrompt(false); setStatusMsg('Prompt edit canceled'); }}
          />
        ) : showPromptsPicker ? (
          <PromptsPicker
            prompts={state.availablePrompts}
            initialSelected={state.selectedPrompts}
            width={safeCols}
            height={midH}
            onApply={(names) => { state.selectedPrompts = new Set(names); bump(state); setShowPromptsPicker(false); setStatusMsg('Prompts updated'); }}
            onCancel={() => { setShowPromptsPicker(false); setStatusMsg('Prompts selection canceled'); }}
          />
        ) : (() => {
          const totalCols = cols || 80;
          const leftWidth = Math.max(20, Math.floor(totalCols * (focusPane === 'files' ? 0.6 : 0.4)));
          const rightWidth = Math.max(20, totalCols - leftWidth - 2); // -2 for gutter
          const filesContentW = Math.max(10, leftWidth - 4);
          const ranksContentW = Math.max(10, rightWidth - 4);
          return (
            <>
              <Box
                width={leftWidth}
                marginRight={2}
                flexDirection="column"
                borderStyle="round"
                paddingX={1}
                height={midH}
                borderColor={focusPane === 'files' ? 'cyan' : undefined}
              >
              <Box height={1} flexShrink={0}><Text color={focusPane === 'files' ? 'cyan' : undefined}>Files</Text></Box>
              <FilesHeaders width={filesContentW} highlight={focusPane === 'files'} />
              <Box ref={filesBodyRef}>
                <FilesPane
                  state={state}
                  viewTop={viewTop}
                  visibleCount={filesBody}
                  onClampTop={setViewTop}
                  width={filesContentW}
                />
              </Box>
              </Box>
              <Box
                width={rightWidth}
                flexDirection="column"
                borderStyle="round"
                paddingX={1}
                height={midH}
                borderColor={focusPane === 'rankings' ? 'cyan' : undefined}
              >
              {/* Title gets exactly one row to prevent collision with headers */}
              <Box height={1} flexShrink={0}>
                <Text color={focusPane === 'rankings' ? 'cyan' : undefined}>
                  {state.paneMode === 'rank' ? 'Rankings' : 'Details'}
                </Text>
              </Box>
              {state.paneMode === 'rank' ? (
                <>
                  <RankingsHeaders width={ranksContentW} highlight={focusPane === 'rankings'} />
                  <Box ref={ranksBodyRef}>
                  <RankingsPane
                    state={state}
                    width={ranksContentW}
                    viewTop={rankTop}
                    visibleCount={ranksBody}
                    onClampTop={setRankTop}
                    selectedIndex={rankIdx}
                    selectedSide={rankSide}
                  />
                  </Box>
                </>
              ) : (
                <DetailsPane state={state} treeMode={state.treeMode} selectedIdx={state.selectedIdx} height={Math.max(1, innerH - 1)} />
              )}
              </Box>
            </>
          );
        })()}
      </Box>
      <PromptBar
        value={state.promptText ?? ''}
        onChange={(v) => { state.promptText = v; bump(state); }}
        focused={focusPrompt}
        onSubmit={() => setFocusPrompt(false)}
        onOpenEditor={() => setEditingPrompt(true)}
      />
      <StatusBar help={help} gauge={tokenGauge} width={safeCols} />
    </Box>
  );
}
