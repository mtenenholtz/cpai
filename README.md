# cpai

> Alpha Notice: APIs and flags may change until 0.1.0.

**cpai** makes it easy to use web‑only models like **GPT‑5 Pro** with your local codebase. It scans your repo, packs selected files to fit token limits, and copies a clean, paste‑ready bundle for the model’s web UI.

## Install

```bash
pnpm add -g cpai
# or run once without installing
pnpm dlx cpai --help
```

## Install (local dev)

```bash
pnpm install
pnpm run build
pnpm link --global
# now the `cpai` command is available globally
```

Or run directly:

```bash
pnpm dlx tsx src/cli.ts --help
```

## Quick start

Scan a project:

```bash
cpai scan . --by-dir
```

Copy to clipboard (default):

```bash
cpai copy . --include "src/**/*" --exclude "src/**/*.test.ts"
```

Print to stdout instead of just clipboard:

```bash
cpai copy . --stdout --include "src/**/*" --exclude "src/**/*.test.ts"
```

Fit under a 120k token budget, small files first (copied to clipboard by default):

```bash
cpai copy . --max-tokens 120000 --pack-order small-first
```

Write to a file:

```bash
cpai copy . -o cpai-bundle.md
```

Initialize a local config:

```bash
cpai init
```

## Configuration

Create `.cpairc.json` (or put a `cpai` field in `package.json`):

```json
{
  "include": ["**/*"],
  "exclude": ["**/{node_modules,dist,build,.git}/**", "**/*.{png,jpg,svg,zip,pdf}"],
  "useGitignore": true,
  "useCpaiIgnore": true,
  "hidden": false,
  "maxBytesPerFile": 512000,
  "model": "gpt-4o-mini",
  "encoding": "o200k_base",
  "format": "markdown",
  "selectedPrompts": ["swe-guidelines", "acceptance-criteria"]
}
```

> **Note:** Token counts are model/encoding-specific approximations. For the most accurate budget fit, use `--strict` (default) so `cpai` re-counts the final rendered text.

## Tips

- Use `--include`/`--exclude` globs to trim noise (tests, build artifacts, fixtures).
- Respect `.gitignore` by default, and add additional rules in `.cpaiignore`.
- For legacy models, consider `--encoding cl100k_base`.

---

## Setup and Usage

1. **Initialize and build**

```bash
pnpm install
pnpm run build
pnpm link --global
```

2. **Explore your repo**

```bash
cpai scan . --by-dir
```

3. **Create a paste-ready Markdown bundle (copied to clipboard)**

```bash
cpai copy . --include "src/**/*,README.md" --exclude "src/**/*.test.ts" --max-tokens 120000
```

This will produce something like:

```text
<INSTRUCTIONS>
Briefly state the goal or task for the model.
</INSTRUCTIONS>

<PROMPT name="style-guide">
Optional saved prompt content (e.g., coding or review guidelines).
</PROMPT>

<TREE>
project/
├─ src/
│  ├─ index.ts
│  └─ utils.ts
└─ README.md
</TREE>

<FILE_1 path="src/index.ts">
// file contents…
</FILE_1>

<FILE_2 path="src/utils.ts">
// file contents…
</FILE_2>

<INSTRUCTIONS>
Briefly state the goal or task for the model.
</INSTRUCTIONS>
```

---

## TUI (interactive)

### Quickstart (≈1 minute)

1. Launch in your repo

```bash
cpai tui .
```

2. Pick files

- Move with `j`/`k` or arrow keys.
- Press `space` to include/exclude the highlighted item.
- On a directory, `space` toggles everything inside.
- In the Files pane, `h` collapses and `l` expands directories.
- Press `d` to switch the right pane between Rankings and Details.
- In Rankings, `space` on a row toggles that file or the entire folder.

3. Add instructions / prompts (optional)

- `p` opens the full‑screen Instructions Editor (Esc saves; Ctrl+Q cancels).
- `Ctrl+P` opens the Saved Prompts picker (space to toggle, Enter to apply).

4. Copy

- Press `c` to copy the composed bundle to your clipboard (OSC52 fallback).
- Paste into your LLM of choice.

### Cheat sheet

```
j/k or Arrow keys   move selection
h/l (Files)         collapse / expand directory
h/l (panes)         move focus Files ↔ Rankings
w                   swap focus Files ↔ Rankings
space               include/exclude file or directory
d                   toggle right pane: Rankings ↔ Details
p                   open Instructions Editor (Esc save, Ctrl+Q cancel)
Ctrl+P              Saved Prompts picker (space toggle, Enter apply, Esc cancel)
e (Rankings)        show full name preview (e/E/Esc to close)
Ctrl+R              rescan
c                   copy bundle to clipboard
q or Ctrl+C         quit
```

### What gets copied?

By default, the TUI copies a tags‑wrapped bundle that includes a tree preview and one block per file:

```text
<TREE>
repo/
├─ src/
│  └─ index.ts
└─ README.md
</TREE>

<FILE_1 path="src/index.ts">
// file contents…
</FILE_1>
```

- Any ad‑hoc text you entered in the editor is added at the top as an `<INSTRUCTIONS>` block and duplicated at the bottom.
- Any saved prompts you selected are added at the top as `<PROMPT name="…">…</PROMPT>` blocks.
- Prefer different output styles (markdown or JSON)? Use the CLI: `cpai copy` (see below).

### Options you’ll actually use

- `--mouse` — enable mouse for this run (or set `"mouse": true` in `.cpairc.json`)
- `-i, --instructions "..."` / `--instructions-file <path>` — prefill the editor
- `--prompts-dir <dir>` — add a directory of saved prompts
- `--pick-prompts` — open the prompts picker on launch

Mouse

- Off by default; run with `cpai tui . --mouse`. Click to focus/select, wheel to scroll.

Auto‑refresh

- The TUI rescans automatically ~every 2s. Tune with `CPAI_TUI_POLL_MS`.

Clipboard notes (tmux/screen/SSH)

- Uses system clipboard via `clipboardy`, falling back to OSC52.
- Under tmux, enable OSC52 passthrough:
  ```
  set -g set-clipboard on
  ```

Windows/WSL

- Prefer UTF‑8 terminals (Windows Terminal, PowerShell 7+). If characters look odd, switch the code page to UTF‑8.

Troubleshooting

- No clipboard? Use `cpai copy . --stdout > out.txt` or write to a file: `cpai copy . -o out.txt`. Ensure OSC52 passthrough is enabled (tmux) or a system clipboard tool is installed.
- Small terminal? Increase size; the TUI needs roughly 68×12 or larger.
- Auto‑refresh: The TUI detects added/removed files and rescans automatically (polls every ~2s). Adjust with `CPAI_TUI_POLL_MS`.

### TUI extras

New flags & features:

Start with instructions prefilled

```bash
cpai tui . -i "Refactor for clarity"
# or
cpai tui . --instructions-file .prompt.txt
```

Pick saved prompts (multi-select)

Place `.md`, `.txt`, or `.prompt` files in `./prompts/` or `./.cpai/prompts/`, then:

```bash
cpai tui . --prompts-dir ./prompts --pick-prompts
```

In the UI:

- `p` edits ad‑hoc instructions (included at the top and duplicated at the bottom of the final output).
- `Ctrl+P` opens a Prompts Picker (space to toggle, Enter to apply).
- The final preface includes an `<INSTRUCTIONS>` block at the top. Any selected saved prompts are added beneath it as separate `<PROMPT name="...">` blocks. Only the `<INSTRUCTIONS>` block is duplicated at the end of the output.

Status bar shows an approximate token count for the current selection.

Tree & Rankings

- Files/dirs show aligned token counts. Use `space` to toggle inclusion on a file or on an entire directory (either from Files or from the Rankings “Folders” column).

---

## Configuration Reference (`.cpairc.json` / `~/.cpai/config.json`)

Use a project-local `.cpairc.json` and/or a global config at `~/.cpai/config.json`. You can also place a `cpai` object inside `package.json`. Precedence (lowest → highest):

- Global `~/.cpai/config.json`
- Project `package.json#cpai`
- Project `.cpairc.json`
- Command-line flags

Example minimal config:

```json
{
  "include": ["**/*"],
  "exclude": ["**/{node_modules,dist,build,.git}/**"],
  "useGitignore": true,
  "useCpaiIgnore": true,
  "hidden": false,
  "maxBytesPerFile": 512000,
  "model": "gpt-4o-mini",
  "encoding": "o200k_base",
  "format": "markdown",
  "mouse": false,
  "instructions": "Optional default instructions…",
  "selectedPrompts": ["style-guide", "acceptance-criteria"]
}
```

Top-level keys

- `include`: array of globs. Files considered for scanning/packing. Defaults to `**/*`.
- `exclude`: array of globs. Excludes common deps/build/binary assets by default.
- `useGitignore`: boolean. When true, respects `.gitignore` patterns.
- `useCpaiIgnore`: boolean. When true, `.cpaiignore` influences selection (TUI shows such files but auto-deselects; CLI excludes them).
- `hidden`: boolean. Include dotfiles.
- `maxBytesPerFile`: number. Skip files larger than this (bytes). Default 512000.
- `model`: string. Used for tokenization heuristics (e.g., `gpt-4o-mini`).
- `encoding`: string. Explicit tiktoken encoding (e.g., `o200k_base`).
- `format`: `"markdown" | "json"`. Rendering mode for `cpai copy` and defaults in TUI.
- `mouse`: boolean. Default mouse behavior for the TUI.
- `instructions`: string. Default instructions inserted at the top (and duplicated at the bottom) of rendered output.
- `instructionsFile`: string. Path to a file whose contents become default `instructions`.
- `selectedPrompts`: array of names to auto-include from saved prompts directories.

Saved prompts

- Place `.md`, `.txt`, or `.prompt` files in any of:
  - Project: `./.cpai/prompts/` or `./prompts/`
  - Global: `~/.cpai/prompts/`
- When names collide, project prompts win. Names are derived from filenames sans extension.
- TUI: `Ctrl+P` opens the picker; `selectedPrompts` are pre-selected.
- CLI copy: any `selectedPrompts` are added as `<PROMPT name="…">…</PROMPT>` blocks at the top.

`.cpaiignore`

- Add ignore-style patterns (one per line) to auto-deselect in the TUI and exclude in CLI.
- Common large/binary formats are excluded by default; adjust here as needed.

Profiles (`profiles`)

- Define named overrides for common scenarios. Specify in `.cpairc.json` or global config, then use with `cpai copy . --profile <name>`.

Profile fields

- All top-level keys above are allowed inside a profile. Additional copy-tuning keys:
  - `tagsWrap`: boolean. Default true. Wrap files as `<FILE_n path="…">…</FILE_n>`.
  - `xmlWrap`: boolean. Wrap output in XML with `<tree>` and `<file>` elements.
  - `codeFences`: boolean. For markdown format, include ``` fences (default true).
  - `packOrder`: `"small-first" | "large-first" | "path"`. Greedy packing order.
  - `strict`: boolean. Re-count rendered tokens and trim to budget if needed (default true).
  - `mouse`: boolean. Per-profile TUI mouse override.

Profile example

```json
{
  "profiles": {
    "review": {
      "include": ["src/**/*", "README.md"],
      "exclude": ["**/*.test.ts"],
      "format": "markdown",
      "instructions": "Review for correctness and clarity.",
      "selectedPrompts": ["style-guide"],
      "packOrder": "small-first",
      "strict": true,
      "tagsWrap": true,
      "xmlWrap": false
    }
  }
}
```

## Profiles and Prompt Injection

- Define profiles in `.cpairc.json`:

```json
{
  "profiles": {
    "docs-only": {
      "include": ["README.md", "docs/**/*"],
      "exclude": ["**/*.png"],
      "instructions": "Summarize the docs and propose improvements.",
      "selectedPrompts": ["style-guide"]
    }
  }
}
```

- Use a profile: `cpai copy . --profile docs-only`
- Add/override instructions at runtime:
- Inline: `-i "Refactor for clarity; note assumptions."`
- From file: `--instructions-file .prompt.txt`
- The instructions are inserted at the very top (and duplicated at the bottom) wrapped in `<INSTRUCTIONS>...</INSTRUCTIONS>` tags and count toward the token budget when packing. Any selected saved prompts are appended beneath the initial `<INSTRUCTIONS>` block as `<PROMPT name="...">...</PROMPT>` blocks (top only).
