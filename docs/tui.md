# TUI (Ink) Guide

The TUI is a fast way to browse files, inspect token usage, pick prompts, and compose a bundle.

Launch:

```bash
 cpai tui .
```

Mouse is off by default. Enable it with `--mouse` or in config (`mouse: true`). You can prefill instructions with `-i/--instructions` or `--instructions-file <path>`, and preselect files by content with `--grep <pattern>`.

## Layout

- Left: Files pane (Tree/Flat) with checkmarks and token counts
- Right: Rankings pane (Top Files / Top Folders)
- Bottom: Prompt bar + Status line
- Optional overlays: Instructions Editor (p), Saved Prompts picker (Ctrl+P), Full‑name preview (e)

The focused pane shows a cyan border. Focus affects which keys apply.

## Keymap (Ink)

Navigation & panes:

- `j`/`k` or Arrow Down/Up: move selection
- `h` / `l`:
  - In Files (Tree mode): collapse / expand directories
  - Between panes: `l` moves Files → Rankings, `h` moves Rankings → Files
  - In Rankings: `h` selects Files column; `l` selects Folders column
- `d`: toggle Details / Rankings in the right pane
- `w`: swap focus between Files and Rankings (also switches right pane to Rankings if it was showing Details)

Selection:

- `space`: toggle include/exclude at cursor
  - On a directory (Tree mode): toggles all files under that folder

Prompts:

- `p`: open the full‑screen Instructions Editor
  - Esc: save and close; Ctrl+Q: cancel
  - Shift+W/B: move forward/back by word; Ctrl+K: kill‑to‑EOL; Ctrl+W: delete previous word
- `Ctrl+P`: open the Saved Prompts picker (multi‑select; space to toggle; Enter to apply)

Rankings:

- `e`: show full name/path of the selected row in a small overlay (press `e`/`E`/`Esc` to close)
- `Tab`: switch between Files ↔ Folders columns
  The overlay displays either the full file path or the folder path with token totals.
- Mouse (when enabled): click to select; wheel to scroll

Actions:

- `c`: copy the rendered bundle to clipboard (OSC52 fallback if system clipboard fails)
- `x`: emit the composed bundle to stdout and exit (useful for piping)
- `Ctrl+R`: rescan (progress shown in status)
- `q` / `Ctrl+C`: quit

## Saved prompts

- Sources: project (`./.cpai/prompts` or `./prompts`) and global (`~/.cpai/prompts`)
- In pickers, global prompts are labeled `(global)`
- Selected prompts are added at the top as `<PROMPT name="...">…</PROMPT>` blocks (only the `<INSTRUCTIONS>` block is duplicated at the bottom)

## Instructions Editor

The full‑screen editor supports multi‑line editing with line numbers and a live token counter.

- Header: shows `tokens≈N`
- Footer: lists all editor hotkeys
- Editing operates on raw text (horizontal scroll instead of soft-wrapping)

## Mouse

- Disabled by default; enable via `--mouse` or config (`mouse: true`)
- Click a row to select and focus the pane
- Wheel to scroll
- Tabs are clickable as well

If `mouse: false`, the app explicitly disables terminal mouse tracking on mount so prior sessions can’t leak sequences.

## Status line

- Shows the current token estimate of included files (including wrappers/prompts), active pane info, and any short status (e.g., “Rescanning…” or copy feedback)
