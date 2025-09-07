import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {countTokens} from '../../../lib/tokenizer.js';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function splitLines(v: string): string[] {
  return v.replace(/\r\n?/g, '\n').split('\n');
}

function joinLines(lines: string[]): string {
  return lines.join('\n');
}

function isWordChar(ch: string) {
  return /\w/.test(ch);
}

export function PromptEditor(props: {
  initialValue: string;
  width: number;   // available content width (inside outer padding)
  height: number;  // total rows we can use for the editor pane
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState<string[]>(() => splitLines(props.initialValue));
  const [row, setRow] = useState<number>(() => Math.max(0, splitLines(props.initialValue).length - 1));
  const [col, setCol] = useState<number>(() => (splitLines(props.initialValue).slice(-1)[0] ?? '').length);
  const [scrollTop, setScrollTop] = useState(0);
  const [hScroll, setHScroll] = useState(0);
  const [tokens, setTokens] = useState(0);

  // Layout math
  const outerH = Math.max(7, props.height);
  const headerH = 1;
  const helpH = 1;
  const borderPad = 2;   // top+bottom borders
  const innerH = Math.max(1, outerH - borderPad - headerH - helpH);
  const lineNumW = Math.max(2, String(lines.length || 1).length);
  const gutterW = 1;     // space after line number
  const contentW = Math.max(8, props.width - 2 /*borders*/ - lineNumW - gutterW - 2 /*inner padding*/);

  // Keep cursor in bounds as content changes
  useEffect(() => {
    const L = lines.length ? lines : [''];
    const rr = clamp(row, 0, L.length - 1);
    const cc = clamp(col, 0, (L[rr] ?? '').length);
    if (rr !== row) setRow(rr);
    if (cc !== col) setCol(cc);
  }, [lines, row, col]);

  // Maintain vertical scroll so cursor is visible
  useEffect(() => {
    const margin = 1;
    if (row < scrollTop + margin) setScrollTop(Math.max(0, row - margin));
    else if (row >= scrollTop + innerH - margin) setScrollTop(Math.max(0, row - innerH + 1 + margin));
  }, [row, innerH, scrollTop]);

  // Maintain horizontal scroll so cursor is visible
  useEffect(() => {
    const margin = 2;
    if (col < hScroll + margin) setHScroll(Math.max(0, col - margin));
    else if (col >= hScroll + contentW - margin) setHScroll(Math.max(0, col - contentW + 1 + margin));
  }, [col, hScroll, contentW]);

  // Token counter (debounced)
  useEffect(() => {
    const id = setTimeout(() => {
      countTokens(joinLines(lines)).then(setTokens).catch(() => {});
    }, 80);
    return () => clearTimeout(id);
  }, [lines]);

  function setCursor(r: number, c: number, base?: string[]) {
    const refLines = base ?? lines;
    const rr = clamp(r, 0, Math.max(0, refLines.length - 1));
    const cc = clamp(c, 0, (refLines[rr] ?? '').length);
    setRow(rr);
    setCol(cc);
  }

  function insertText(text: string) {
    const L = [...(lines.length ? lines : [''])];
    const cur = L[row] ?? '';
    const before = cur.slice(0, col);
    const after = cur.slice(col);
    const parts = text.replace(/\r\n?/g, '\n').split('\n');
    if (parts.length === 1) {
      L[row] = before + parts[0] + after;
      setLines(L);
      setCol(col + parts[0].length);
    } else {
      const first = before + parts[0];
      const middle = parts.slice(1, -1);
      const last = parts[parts.length - 1] + after;
      L[row] = first;
      if (middle.length) L.splice(row + 1, 0, ...middle);
      L.splice(row + 1 + middle.length, 0, last);
      const newRow = row + parts.length - 1;
      const newCol = parts[parts.length - 1].length;
      setLines(L);
      setCursor(newRow, newCol, L);
    }
  }

  function moveWordForward() {
    const s = lines[row] ?? '';
    let i = col;
    // If currently on word chars, skip to end
    while (i < s.length && isWordChar(s[i])) i++;
    // Skip following whitespace to the start of next word
    while (i < s.length && /\s/.test(s[i])) i++;
    setCursor(row, i);
  }

  function moveWordBack() {
    const s = lines[row] ?? '';
    let i = col;
    // Skip whitespace to the left
    while (i > 0 && /\s/.test(s[i - 1])) i--;
    // Skip word chars to the left
    while (i > 0 && isWordChar(s[i - 1])) i--;
    setCursor(row, i);
  }

  function backspace() {
    if (col > 0) {
      const L = [...lines];
      const s = L[row];
      L[row] = s.slice(0, col - 1) + s.slice(col);
      setLines(L);
      setCol(col - 1);
    } else if (row > 0) {
      const L = [...lines];
      const prev = L[row - 1];
      const cur = L[row];
      const joinAt = prev.length;
      L[row - 1] = prev + cur;
      L.splice(row, 1);
      setLines(L);
      setCursor(row - 1, joinAt, L);
    }
  }

  function del() {
    const L = [...lines];
    const s = L[row];
    if (col < s.length) {
      L[row] = s.slice(0, col) + s.slice(col + 1);
      setLines(L);
    } else if (row < L.length - 1) {
      const next = L[row + 1];
      L[row] = s + next;
      L.splice(row + 1, 1);
      setLines(L);
    }
  }

  function deleteWordBefore() {
    if (col === 0 && row > 0) {
      const L = [...lines];
      const prev = L[row - 1];
      const cur = L[row];
      const joinAt = prev.length;
      L[row - 1] = prev + cur;
      L.splice(row, 1);
      setLines(L);
      setCursor(row - 1, joinAt, L);
      return;
    }
    const s = lines[row] ?? '';
    let i = col;
    while (i > 0 && /\s/.test(s[i - 1])) i--;
    while (i > 0 && isWordChar(s[i - 1])) i--;
    if (i === col && col > 0) i = col - 1;
    const L = [...lines];
    L[row] = s.slice(0, i) + s.slice(col);
    setLines(L);
    setCol(i);
  }

  useInput((input, key) => {
    // Save / Cancel
    if (key.ctrl && (input === 's' || input === 'S')) { props.onSubmit(joinLines(lines)); return; }
    if (key.escape) { props.onSubmit(joinLines(lines)); return; }
    if (key.ctrl && (input === 'q' || input === 'Q')) { props.onCancel(); return; }
    if (key.ctrl && key.return) { props.onSubmit(joinLines(lines)); return; }

    // Cursor movement
    if (key.leftArrow) { setCursor(row, Math.max(0, col - 1)); return; }
    if (key.rightArrow) { setCursor(row, col + 1); return; }
    if (key.upArrow) { setCursor(Math.max(0, row - 1), col); return; }
    if (key.downArrow) { setCursor(Math.min(lines.length - 1, row + 1), col); return; }
    // Home/End can be reached via Ctrl+A / Ctrl+E below
    if (input === 'W') { moveWordForward(); return; } // Shift+W
    if (input === 'B') { moveWordBack(); return; }    // Shift+B

    // Editing
    if (key.return) { insertText('\n'); return; }
    if (key.backspace) { backspace(); return; }
    if (key.delete) { del(); return; }
    if (key.tab) { insertText('  '); return; }

    // Emacs-y helpers
    if (key.ctrl && (input === 'a' || input === 'A')) { setCursor(row, 0); return; }
    if (key.ctrl && (input === 'e' || input === 'E')) { setCursor(row, (lines[row] ?? '').length); return; }
    if (key.ctrl && (input === 'k' || input === 'K')) {
      const L = [...lines];
      L[row] = (L[row] ?? '').slice(0, col);
      setLines(L);
      return;
    }
    if (key.ctrl && (input === 'w' || input === 'W')) { deleteWordBefore(); return; }

    // Printable text / paste
    if (!key.ctrl && !key.meta && input) {
      insertText(input);
    }
  });

  const visible = useMemo(() => {
    const start = scrollTop;
    const end = Math.min(lines.length, start + innerH);
    return lines.slice(start, end);
  }, [lines, scrollTop, innerH]);

  function renderLine(idx: number, text: string) {
    const isCursor = (scrollTop + idx) === row;
    const ln = String(scrollTop + idx + 1).padStart(lineNumW, ' ');
    const view = text.slice(hScroll, hScroll + contentW);
    const cursorX = clamp(col - hScroll, 0, contentW);
    if (!isCursor) {
      return (
        <Text>
          <Text dimColor>{ln}</Text>
          <Text> </Text>
          <Text>{view}</Text>
        </Text>
      );
    }
    const pre = view.slice(0, cursorX);
    const ch = view[cursorX] ?? ' ';
    const post = view.slice(cursorX + 1);
    return (
      <Text>
        <Text dimColor>{ln}</Text>
        <Text> </Text>
        <Text>{pre}</Text>
        <Text inverse>{ch}</Text>
        <Text>{post}</Text>
      </Text>
    );
  }

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} paddingY={0} flexDirection="column" height={outerH}>
      <Box height={1}><Text>Prompt Editor — Ctrl+S save • Esc cancel • Ctrl+K kill-eol • Ctrl+W del word  |  tokens≈{tokens}</Text></Box>
      <Box flexDirection="column" height={innerH}>
        {visible.length ? visible.map((t, i) => <Box key={i}><Text>{renderLine(i, t)}</Text></Box>) : (
          <Text dimColor>(empty)</Text>
        )}
      </Box>
      <Box height={1}><Text dimColor>Arrows/Home/End • Enter newline • Tab=2 spaces • Ctrl+Enter save</Text></Box>
    </Box>
  );
}
