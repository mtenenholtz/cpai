import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, measureElement, useApp } from 'ink';
import { loadAicpConfig } from '../../lib/config.js';
import { makeDefaultState, type State } from '../core/state.js';
import { rescan, renderPackedText, loadSavedPrompts, estimateTokens } from '../core/actions.js';
import { buildEligible } from '../core/selectors.js';
import { buildDirTree, makeVisibleTree, type VisibleNode } from '../core/tree.js';
import { Tabs, type TabId } from './components/Tabs.js';
import { FilesPane } from './components/FilesPane.js';
import { RankingsPane } from './components/RankingsPane.js';
import { InstructionBar } from './components/InstructionBar.js';
import { StatusBar } from './components/StatusBar.js';
import { NotificationBar } from './components/NotificationBar.js';
import { DetailsPane } from './components/DetailsPane.js';
import { InstructionsEditor } from './components/InstructionsEditor.js';
import { PromptsPicker } from './components/PromptsPicker.js';
import clipboard from 'clipboardy';
import { useMouse, type MouseEvent as InkMouseEvent } from './hooks/useMouse.js';
import path from 'node:path';
import { globby } from 'globby';
import { hyperlink } from './hyperlink.js';

export function App(props: {
  cwd: string;
  promptText?: string;
  promptsDir?: string;
  openPromptPicker?: boolean;
  mouse?: boolean;
}) {
  const { exit } = useApp();
  // Fixed-height headers for Files list to mirror Rankings and keep symmetric vertical structure
  function FilesHeaders({ width, highlight }: { width: number; highlight: boolean }) {
    const cursorW = 2;
    const markW = 2;
    const tokenW = 8;
    const nameW = Math.max(8, width - (cursorW + markW + tokenW));
    return (
      <Box height={1} flexShrink={0}>
        <Box width={cursorW}>
          <Text> </Text>
        </Box>
        <Box width={markW}>
          <Text> </Text>
        </Box>
        <Box width={nameW}>
          <Text color={highlight ? 'cyan' : undefined}>Name</Text>
        </Box>
        <Box width={tokenW}>
          <Text color={highlight ? 'cyan' : undefined}>Tokens</Text>
        </Box>
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
          <Box width={cursorW}>
            <Text> </Text>
          </Box>
          <Box width={nameW}>
            <Text color={highlight ? 'cyan' : undefined}>Files</Text>
          </Box>
          <Box width={tokenW}>
            <Text color={highlight ? 'cyan' : undefined}>Tokens</Text>
          </Box>
        </Box>
        <Box width={colW}>
          <Box width={nameW}>
            <Text color={highlight ? 'cyan' : undefined}>Folders</Text>
          </Box>
          <Box width={tokenW}>
            <Text color={highlight ? 'cyan' : undefined}>Tokens</Text>
          </Box>
        </Box>
      </Box>
    );
  }
  const { cwd } = props;
  const [state, setState] = useState<State | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewTop, setViewTop] = useState(0);
  const [rankTop, setRankTop] = useState(0);
  const [focusPane, setFocusPane] = useState<'files' | 'rankings'>('files');
  const [rankIdx, setRankIdx] = useState(0);
  const [rankSide, setRankSide] = useState<'files' | 'dirs'>('files');
  const [rows, setRows] = useState<number>(process.stdout.rows || 24);
  const [cols, setCols] = useState<number>(process.stdout.columns || 80);
  // Inline prompt editing removed; use Instructions Editor only
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [notify, setNotify] = useState<{ text: string; kind: 'success' | 'error' | 'info' } | null>(
    null,
  );
  const notifyTimer = useRef<NodeJS.Timeout | null>(null);
  const [showRankNamePreview, setShowRankNamePreview] = useState(false);
  const [showPromptsPicker, setShowPromptsPicker] = useState(false);
  const filesBodyRef = useRef<any>(null);
  const ranksBodyRef = useRef<any>(null);
  // Auto-reload internals
  const stateRef = useRef<State | null>(null);
  const lastFileSetRef = useRef<Set<string> | null>(null);
  const isRescanningRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    return () => {
      if (notifyTimer.current) clearTimeout(notifyTimer.current);
    };
  }, []);
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
    const total = visibleNodes(next).length;
    if (next.selectedIdx < 0) next.selectedIdx = 0;
    if (next.selectedIdx >= total) next.selectedIdx = Math.max(0, total - 1);
    const vc = visibleCount();
    if (next.selectedIdx < viewTop) setViewTop(next.selectedIdx);
    else if (next.selectedIdx >= viewTop + vc)
      setViewTop(Math.max(0, next.selectedIdx - Math.max(1, Math.floor(vc / 2))));
    // copy to trigger render
    setState({ ...next });
  }

  function visibleCount(): number {
    const header = 2; // title + blank
    const footer = 3; // prompt + hint
    const usable = Math.max(3, (rows || 24) - header - footer);
    return usable;
  }

  function visibleNodes(s: State): VisibleNode[] {
    const eligible = new Set(buildEligible(s).map((f) => f.relPath));
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
        // Auto-select saved prompts configured in project/global config (project wins by loadAicpConfig merge)
        const autoNames: string[] | undefined = (fileCfg as any).selectedPrompts;
        if (autoNames && autoNames.length) {
          const namesSet = new Set(autoNames);
          s.selectedPrompts = new Set(
            s.availablePrompts.filter((p) => namesSet.has(p.name)).map((p) => p.name),
          );
        }
        await rescan(s, (d, t) => setProgress({ done: d, total: t }));
        setState({ ...s });
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, [cwd]);

  // Keep last seen list of files for change detection
  useEffect(() => {
    if (!state) return;
    lastFileSetRef.current = new Set(state.files.map((f) => f.relPath));
  }, [state]);

  // Auto-reload: poll for added/removed files and rescan when list changes
  useEffect(() => {
    let cancelled = false;
    const pollMs = Number(process.env.CPAI_TUI_POLL_MS || '') || 2000;

    async function check() {
      if (cancelled) return;
      const s = stateRef.current;
      if (!s) return;
      if (isRescanningRef.current) return;
      try {
        const patterns = s.include?.length ? s.include : ['**/*'];
        const paths = await globby(patterns, {
          cwd: s.cwd,
          gitignore: s.useGitignore,
          ignore: s.exclude,
          dot: s.hidden,
          onlyFiles: true,
          followSymbolicLinks: false,
        });
        const curr = new Set(paths.map((p: string) => p.split(path.sep).join('/')));
        const prev = lastFileSetRef.current || new Set<string>();
        let changed = curr.size !== prev.size;
        if (!changed) {
          for (const p of curr) {
            if (!prev.has(p)) {
              changed = true;
              break;
            }
          }
          if (!changed) {
            for (const p of prev) {
              if (!curr.has(p)) {
                changed = true;
                break;
              }
            }
          }
        }
        if (changed) {
          isRescanningRef.current = true;
          setProgress({ done: 0, total: 0 });
          await rescan(s, (d, t) => setProgress({ done: d, total: t }));
          setProgress(null);
          lastFileSetRef.current = new Set(s.files.map((f) => f.relPath));
          setState({ ...s });
        }
      } catch {
        // ignore errors during polling
      } finally {
        isRescanningRef.current = false;
      }
    }

    const timer = setInterval(check, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cwd]);

  // Keybindings: j/k, space, Ctrl-R, q/C-c; p opens Instructions Editor; d toggles details/rank
  useInput((input, key) => {
    if (!state) return;
    if (editingPrompt) return;
    // When saved prompts picker is open, let it consume input; only allow Ctrl+P to close it
    if (showPromptsPicker) {
      if (key.ctrl && input === 'p') {
        setShowPromptsPicker(false);
      }
      return;
    }
    // Hotkeys only; numeric shortcuts disabled
    // Ctrl+P toggles saved prompts picker (opens/closes if already open)
    if (key.ctrl && input === 'p') {
      setShowPromptsPicker((v) => !v);
      return;
    }
    // Shift+P removed; use 'p' to open the editor
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }
    if (input === 'q') {
      exit();
      return;
    }
    if (key.ctrl && input === 'r') {
      (async () => {
        setProgress({ done: 0, total: 0 });
        await rescan(state, (d, t) => setProgress({ done: d, total: t }));
        setProgress(null);
        bump(state);
      })();
      return;
    }
    // Shift+P removed; use 'p' to open the editor
    if (input === 'c') {
      (async () => {
        try {
          setStatusMsg('Copying…');
          const eligible = buildEligible(state);
          const { text, selected, tokens } = await renderPackedText(eligible, state);
          try {
            await clipboard.write(text);
            setStatusMsg(`Copied ${tokens} tokens to clipboard`);
            if (notifyTimer.current) clearTimeout(notifyTimer.current);
            setNotify({ text: `Copied ${tokens} tokens to clipboard`, kind: 'success' });
            notifyTimer.current = setTimeout(() => setNotify(null), 2000);
          } catch (e: any) {
            const ok = osc52Copy(text);
            if (ok) {
              setStatusMsg(`Copied ${tokens} tokens to clipboard`);
              if (notifyTimer.current) clearTimeout(notifyTimer.current);
              setNotify({ text: `Copied ${tokens} tokens to clipboard`, kind: 'success' });
              notifyTimer.current = setTimeout(() => setNotify(null), 2000);
            } else {
              const msg = `Clipboard failed: ${e?.message ?? e}`;
              setStatusMsg(msg);
              if (notifyTimer.current) clearTimeout(notifyTimer.current);
              setNotify({ text: msg, kind: 'error' });
              notifyTimer.current = setTimeout(() => setNotify(null), 2500);
            }
          }
        } catch (e: any) {
          const msg = `Copy failed: ${e?.message ?? e}`;
          setStatusMsg(msg);
          if (notifyTimer.current) clearTimeout(notifyTimer.current);
          setNotify({ text: msg, kind: 'error' });
          notifyTimer.current = setTimeout(() => setNotify(null), 2500);
        }
      })();
      return;
    }
    if (input === 'p') {
      setEditingPrompt(true);
      return;
    }
    if (input === 'd') {
      state.paneMode = state.paneMode === 'rank' ? 'details' : 'rank';
      bump(state);
      return;
    }
    if (focusPane === 'files' && input === 'h') {
      const vis = visibleNodes(state);
      const node = vis[state.selectedIdx];
      if (
        node &&
        node.kind === 'dir' &&
        node.node.path !== '.' &&
        state.treeExpanded.has(node.node.path)
      ) {
        state.treeExpanded.delete(node.node.path);
        bump(state);
      }
      return;
    }
    if (focusPane === 'files' && input === 'l') {
      const vis = visibleNodes(state);
      const node = vis[state.selectedIdx];
      if (node && node.kind === 'dir') {
        state.treeExpanded.add(node.node.path);
        bump(state);
      }
      return;
    }
    // Vim-style lateral navigation:
    // - Between panes: h = Files, l = Rankings
    // - Within Rankings: h selects Files column, l selects Folders column
    if (input === 'h') {
      if (focusPane === 'rankings') {
        if (rankSide === 'dirs') setRankSide('files');
        else setFocusPane('files');
      }
      return;
    }
    // Toggle full-name preview for Rankings entries (e/E)
    // When the preview dialog is already open, ignore this key here so the dialog's
    // own handler can close it without immediately reopening.
    if ((input === 'e' || input === 'E') && focusPane === 'rankings') {
      if (showRankNamePreview) {
        return;
      }
      setShowRankNamePreview(true);
      return;
    }
    if (input === 'l') {
      if (focusPane === 'files') {
        setFocusPane('rankings');
      } else if (focusPane === 'rankings') {
        setRankSide('dirs');
      }
      return;
    }
    if (input === 'j' || key.downArrow) {
      if (focusPane === 'files') {
        state.selectedIdx += 1;
        bump(state);
      } else {
        setRankIdx((i) => {
          const next = i + 1;
          ensureRankVisible(next);
          return next;
        });
      }
      return;
    }
    if (input === 'k' || key.upArrow) {
      if (focusPane === 'files') {
        state.selectedIdx -= 1;
        bump(state);
      } else {
        setRankIdx((i) => {
          const next = Math.max(0, i - 1);
          ensureRankVisible(next);
          return next;
        });
      }
      return;
    }
    // removed g/G hotkeys (home/end)

    if (input === ' ') {
      if (focusPane === 'files') {
        // Toggle include/exclude from the Files pane selection
        const vis = visibleNodes(state);
        const node = vis[state.selectedIdx];
        if (!node) return;
        if (node.kind === 'file') {
          const rel = node.file.relPath;
          if (state.manualExcluded.has(rel)) state.manualExcluded.delete(rel);
          else state.manualExcluded.add(rel);
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
        bump(state);
        return;
      }
      if (focusPane === 'rankings') {
        // Toggle the highlighted Rankings item (file or folder)
        const eligible0 = buildEligible(state);
        const mutedDirs = [...state.rankMutedDirs];
        const isDirMuted = (p: string) =>
          mutedDirs.some((d) => d === p || p.startsWith(d.endsWith('/') ? d : d + '/'));
        const eligible = eligible0.filter(
          (f) => !state.rankMutedFiles.has(f.relPath) && !isDirMuted(path.posix.dirname(f.relPath)),
        );
        const topFiles = [...eligible].sort((a, b) => b.tokens - a.tokens);
        const byDir = new Map<string, number>();
        for (const f of eligible) {
          const d = path.posix.dirname(f.relPath);
          byDir.set(d, (byDir.get(d) ?? 0) + f.tokens);
        }
        const topDirs = [...byDir.entries()]
          .filter(([d]) => !isDirMuted(d))
          .sort((a, b) => b[1] - a[1]);
        if (rankSide === 'files') {
          const f = topFiles[rankIdx];
          if (f) {
            if (state.manualExcluded.has(f.relPath)) state.manualExcluded.delete(f.relPath);
            else state.manualExcluded.add(f.relPath);
            bump(state);
          }
          return;
        } else {
          const entry = topDirs[rankIdx];
          if (entry) {
            const dir = entry[0]; // posix dirname ('.' for root)
            const prefix = dir && dir !== '.' ? dir + '/' : '';
            // Compute inclusion stats for this directory similar to tree toggling
            let total = 0;
            let included = 0;
            for (const f of state.files) {
              if (prefix === '' ? true : f.relPath.startsWith(prefix)) {
                total++;
                if (!state.manualExcluded.has(f.relPath) && !state.autoDeselected.has(f.relPath))
                  included++;
              }
            }
            const fullyIncluded = total > 0 && included === total;
            const mixed = included > 0 && included < total;
            const makeExcluded = !(fullyIncluded && !mixed);
            for (const f of state.files) {
              if (prefix === '' ? true : f.relPath.startsWith(prefix)) {
                if (makeExcluded) state.manualExcluded.delete(f.relPath);
                else state.manualExcluded.add(f.relPath);
              }
            }
            bump(state);
          }
          return;
        }
      }
    }
    if (input === 'w') {
      setFocusPane((p) => {
        const next = p === 'files' ? 'rankings' : 'files';
        if (next === 'rankings' && state.paneMode !== 'rank') {
          state.paneMode = 'rank';
          bump(state);
        }
        return next;
      });
      return;
    }
    if (focusPane === 'rankings' && key.tab) {
      setRankSide((s) => (s === 'files' ? 'dirs' : 'files'));
      return;
    }
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

  const [tokenGauge, setTokenGauge] = useState<string>('');
  useEffect(() => {
    (async () => {
      if (!state) {
        setTokenGauge('');
        return;
      }
      try {
        const eligible = buildEligible(state);
        const totalTok = await estimateTokens(eligible, state);
        setTokenGauge(
          state.maxTokens ? `tokens ${totalTok}/${state.maxTokens}` : `tokens≈${totalTok}`,
        );
      } catch {
        // Fallback to simple sum if estimation fails
        const eligible = state ? buildEligible(state) : [];
        const totalTok = eligible.reduce((a, f) => a + f.tokens, 0);
        setTokenGauge(
          state?.maxTokens ? `tokens ${totalTok}/${state.maxTokens}` : `tokens≈${totalTok}`,
        );
      }
    })();
  }, [state]);

  function computeRankRowCount(s: State): number {
    const eligible0 = buildEligible(s);
    const mutedDirs = [...s.rankMutedDirs];
    const isDirMuted = (p: string) =>
      mutedDirs.some((d) => d === p || p.startsWith(d.endsWith('/') ? d : d + '/'));
    const eligible = eligible0.filter(
      (f) => !s.rankMutedFiles.has(f.relPath) && !isDirMuted(path.posix.dirname(f.relPath)),
    );
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
    const g = calcGeometry({
      rows: rows || 24,
      cols: cols || 80,
      focusPane,
      paneMode: state.paneMode,
      hasNotif: !!notify,
    });
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
    hasNotif?: boolean;
  }) {
    const { rows, cols, focusPane } = opts;
    const safetyLocal = 1;
    const tabsH = 1;
    const promptH = 1;
    const notifHLocal = opts.hasNotif ? 1 : 0;
    const statusH = 1;
    const midHLocal = Math.max(3, rows - tabsH - promptH - notifHLocal - statusH - safetyLocal);
    const innerHLocal = Math.max(1, midHLocal - 2); // minus borders
    const filesBodyHLocal = Math.max(1, innerHLocal - 2); // minus title+headers
    const ranksBodyHLocal = Math.max(1, innerHLocal - 2);

    const totalCols = cols || 80;
    const leftWidthLocal = Math.max(
      20,
      Math.floor(totalCols * (focusPane === 'files' ? 0.6 : 0.4)),
    );
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
    const bodyY1 = midY1 + 1 /*top border*/ + 1 /*title*/ + 1; /*headers*/
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
        colW: Math.max(20, Math.floor((rightWidthLocal - 4 - 2) / 2)), // content width minus marginRight 2, then split
        cursorW: 2,
        margin: 2,
      },
      tabs: {
        y: 1,
        x1: contentX1,
        width: contentW,
        slotW: contentW,
      },
    };
  }

  // Clamp ranking selection + viewport whenever inputs change
  useEffect(() => {
    const s = state;
    if (!s) return;
    // Use a local computed viewport height; when rows are small contentH will be recomputed later too
    const total = computeRankRowCount(s);
    const vcLocal = Math.max(1, (rows || 24) - 1 - 1 - (notify ? 1 : 0) - 1 - 1 - 3); // rows - tabs - prompt - notif - status - safety - borders/header
    setRankIdx((i) => Math.max(0, Math.min(i, Math.max(0, total - 1))));
    ensureRankVisible(rankIdx);
  }, [state, rows, notify]);

  // Mouse support: click to select/focus; wheel to scroll
  const handleMouse = useCallback(
    (ev: InkMouseEvent) => {
      try {
        if (!state) return;
        if (editingPrompt || showPromptsPicker) return; // disable during overlays
        const g = calcGeometry({
          rows: rows || 24,
          cols: cols || 80,
          focusPane,
          paneMode: state.paneMode,
          hasNotif: !!notify,
        });

        // Files pane
        const inFiles =
          ev.x >= g.leftBoxX1 &&
          ev.x <= g.leftBoxX2 &&
          ev.y >= g.filesBodyY1 &&
          ev.y <= g.filesBodyY2;
        if (inFiles) {
          if (ev.type === 'wheelUp') {
            setViewTop((t) => Math.max(0, t - 3));
            return;
          }
          if (ev.type === 'wheelDown') {
            const total = visibleNodes(state).length;
            const maxTop = Math.max(0, total - g.filesBodyH);
            setViewTop((t) => Math.min(maxTop, t + 3));
            return;
          }
          if (ev.type === 'down') {
            const row = ev.y - g.filesBodyY1; // 0-based inside body
            const total = visibleNodes(state).length;
            const targetIdx = Math.max(0, Math.min(total - 1, viewTop + row));
            setFocusPane('files');
            state.selectedIdx = targetIdx;
            bump(state);
            return;
          }
        }

        // Rankings pane (only when visible)
        if (state.paneMode === 'rank') {
          const inRanks =
            ev.x >= g.rightBoxX1 &&
            ev.x <= g.rightBoxX2 &&
            ev.y >= g.ranksBodyY1 &&
            ev.y <= g.ranksBodyY2;
          if (inRanks) {
            if (ev.type === 'wheelUp') {
              setRankTop((t) => Math.max(0, t - 3));
              return;
            }
            if (ev.type === 'wheelDown') {
              setRankTop((t) => t + 3);
              return;
            }
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

        // Tabs click: open the Instructions Editor
        if (ev.type === 'down' && ev.y === g.tabs.y) {
          setEditingPrompt(true);
          return;
        }
      } catch {}
    },
    [rows, cols, focusPane, state, viewTop, rankTop, editingPrompt, showPromptsPicker, notify],
  );

  const mouseAllowed = !!props.mouse && !editingPrompt && !showPromptsPicker;
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

  if (error)
    return (
      <Box flexDirection="column">
        <Text color="red">Ink UI failed: {error}</Text>
        <Text>Check configuration and try again.</Text>
      </Box>
    );

  if (!state)
    return (
      <Box>
        <Text>Scanning… {progress ? `${progress.done}/${progress.total}` : ''}</Text>
      </Box>
    );

  // Height budget: Tabs(1) + Prompt(1) + optional Notification(1) + Status(1) + safety(1)
  const safety = 1; // spare row to absorb any wrap
  const notifH = notify ? 1 : 0;
  const midH = Math.max(3, (rows || 24) - 1 - 1 - notifH - 1 - safety);
  // Inner area for each bordered pane (exclude top/bottom border)
  const innerH = Math.max(1, midH - 2);
  // Body heights inside panes
  const filesBody = Math.max(1, innerH - 2); // minus title and headers
  const ranksBody = Math.max(1, innerH - 2); // minus title and headers
  const safeCols = Math.max(10, (cols || 80) - 2); // account for root paddingX={1}
  const baseFullHelp = `j/k scroll • space toggle • d details/rank • w swap • p edit instructions • Ctrl-R rescan • q quit`;
  const baseShortHelp = `j/k • space • d • w • p edit instructions • Ctrl-R • q`;
  const eHintFull = focusPane === 'rankings' ? ' • e full-name' : '';
  const eHintShort = focusPane === 'rankings' ? ' • e' : '';
  const fullHelp = `${baseFullHelp}${eHintFull}${statusMsg ? ' • ' + statusMsg : ''}`;
  const shortHelp = `${baseShortHelp}${eHintShort}${statusMsg ? ' • ' + statusMsg : ''}`;
  const help = safeCols >= 108 ? fullHelp : shortHelp;
  const promptsSuffix = !showPromptsPicker
    ? (() => {
        const selNames = state.selectedPrompts ? [...state.selectedPrompts] : [];
        return selNames.length ? `Prompts: ${selNames.join(', ')}` : 'Prompts: none';
      })()
    : undefined;
  // tokens gauge is shown on the InstructionBar (bottom-right)

  // moved above the early returns; see earlier block

  const activeTab: TabId = 'prompts';
  const onSelectTab = (_id: TabId) => {
    setEditingPrompt(true);
  };

  const docsUrl = 'https://github.com/mtenenholtz/cpai/blob/main/docs/tui.md';
  const docsLink = hyperlink('Read the documentation', docsUrl);
  return (
    <Box flexDirection="column" paddingX={1}>
      <Tabs
        active={activeTab}
        onSelect={onSelectTab}
        suffix={promptsSuffix}
        right={<Text color="cyan">{docsLink}</Text>}
        width={safeCols}
      />
      <Box height={midH}>
        {editingPrompt ? (
          <InstructionsEditor
            initialValue={state.promptText ?? ''}
            width={safeCols}
            height={midH}
            onSubmit={(text) => {
              state.promptText = text;
              bump(state);
              setEditingPrompt(false);
              setStatusMsg('Instructions saved');
            }}
            onCancel={() => {
              setEditingPrompt(false);
              setStatusMsg('Instructions edit canceled');
            }}
          />
        ) : showPromptsPicker ? (
          <PromptsPicker
            prompts={state.availablePrompts}
            initialSelected={state.selectedPrompts}
            width={safeCols}
            height={midH}
            onApply={(names) => {
              state.selectedPrompts = new Set(names);
              bump(state);
              setShowPromptsPicker(false);
              setStatusMsg('Prompts updated');
            }}
            onCancel={() => {
              setShowPromptsPicker(false);
              setStatusMsg('Prompts selection canceled');
            }}
          />
        ) : showRankNamePreview && focusPane === 'rankings' ? (
          <RankNamePreview
            state={state}
            rankIdx={rankIdx}
            rankSide={rankSide}
            width={safeCols}
            height={midH}
            onClose={() => setShowRankNamePreview(false)}
          />
        ) : (
          (() => {
            const totalCols = cols || 80;
            const leftWidth = Math.max(
              20,
              Math.floor(totalCols * (focusPane === 'files' ? 0.6 : 0.4)),
            );
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
                  <Box height={1} flexShrink={0}>
                    <Text color={focusPane === 'files' ? 'cyan' : undefined}>Files</Text>
                  </Box>
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
                    <DetailsPane
                      state={state}
                      selectedIdx={state.selectedIdx}
                      height={Math.max(1, innerH - 1)}
                    />
                  )}
                </Box>
              </>
            );
          })()
        )}
      </Box>
      <InstructionBar width={safeCols} right={<Text dimColor>{tokenGauge}</Text>} />
      {notify ? (
        <NotificationBar message={notify.text} kind={notify.kind} width={safeCols} />
      ) : null}
      <StatusBar help={help} width={safeCols} />
    </Box>
  );
}

// Simple modal to display the full name of the selected Rankings item
const RankNamePreview: React.FC<{
  state: State;
  rankIdx: number;
  rankSide: 'files' | 'dirs';
  width: number;
  height: number;
  onClose: () => void;
}> = ({ state, rankIdx, rankSide, width, height, onClose }) => {
  // Compute rankings like RankingsPane does
  const eligible0 = state.files.filter(
    (f) => !state.manualExcluded.has(f.relPath) && !state.autoDeselected.has(f.relPath),
  );
  const mutedDirs = [...state.rankMutedDirs];
  const isDirMuted = (p: string) =>
    mutedDirs.some((d) => d === p || p.startsWith(d.endsWith('/') ? d : d + '/'));
  const eligible = eligible0.filter(
    (f) => !state.rankMutedFiles.has(f.relPath) && !isDirMuted(path.posix.dirname(f.relPath)),
  );
  const topFiles = [...eligible].sort((a, b) => b.tokens - a.tokens);
  const byDir = new Map<string, number>();
  for (const f of eligible) {
    const d = path.posix.dirname(f.relPath);
    byDir.set(d, (byDir.get(d) ?? 0) + f.tokens);
  }
  const topDirs = [...byDir.entries()].filter(([d]) => !isDirMuted(d)).sort((a, b) => b[1] - a[1]);

  let label = '';
  if (rankSide === 'files') {
    const f = topFiles[rankIdx];
    if (f) label = `File: ${f.relPath}  (tokens ${f.tokens})`;
  } else {
    const d = topDirs[rankIdx];
    if (d) label = `Folder: ${d[0] || '.'}  (tokens ${d[1]})`;
  }

  // Close on Esc or e
  useInput((input, key) => {
    if (key.escape || input === 'e' || input === 'E') onClose();
  });

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      height={Math.min(5, height)}
      width={width}
    >
      <Box>
        <Text color="cyan">Full Name</Text>
      </Box>
      <Box>
        <Text>{label || '(none)'}</Text>
      </Box>
      <Box>
        <Text dimColor>Press e or Esc to close</Text>
      </Box>
    </Box>
  );
};
