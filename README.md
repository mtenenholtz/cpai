# cpai

**cpai** helps you **scan** and **bulk copy** code (or any text files) into a single prompt for an LLM, while keeping an eye on **token usage**. It supports globs, `.gitignore`/`.cpaiignore`, packing under a token budget, and rendering as Markdown / plain / JSON. Powered by [`@dqbd/tiktoken`](https://www.npmjs.com/package/@dqbd/tiktoken).

## Install (local dev)

```bash
pnpm install
pnpm run build
pnpm link --global
# now the `cpai` command is available globally
````

Or run directly:

```bash
pnpm dlx tsx src/cli.ts --help
```

## Quick start

Scan a project:

```bash
cpai scan . --by-dir
```

Copy as tags (default) to stdout:

```bash
cpai copy . --include "src/**/*" --exclude "src/**/*.test.ts"
```

Fit under a 120k token budget, small files first, copy to clipboard:

```bash
cpai copy . --max-tokens 120000 --pack-order small-first --clip
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

* Use `--include`/`--exclude` globs to trim noise (tests, build artifacts, fixtures).
* Respect `.gitignore` by default, and add additional rules in `.cpaiignore`.
* For legacy models, consider `--encoding cl100k_base`.

````

---

## How to use now

1. **Initialize and build**

```bash
pnpm install
pnpm run build
pnpm link --global
````

2. **Explore your repo**

```bash
cpai scan . --by-dir
```

3. **Create a paste-ready Markdown bundle**

```bash
cpai copy . --include "src/**/*,README.md" --exclude "src/**/*.test.ts" --max-tokens 120000 --clip
```

This will produce something like:

````md
### src/index.ts
```ts
// your file contents…
````

### src/utils.ts

```ts
// …
```

```

---

## Design choices & notes

- **Tokenization**: Uses `@dqbd/tiktoken` with an encoding chosen by `--encoding` (or inferred via `--model`). Defaults to `o200k_base` (great for modern LLMs). You can pass `--encoding cl100k_base` for older GPT-3.5/GPT-4 style tokenization.
- **Safety**: Skips common binary files and large files by default (`--max-bytes-per-file`, default 0.5 MB).
- **Packing algorithm**: Greedy (`small-first`, `large-first`, or `path`). With `--strict` (default), it re-counts the *rendered* text and trims tail files if needed to ensure the token budget is respected.
- **Default output**: Per-file tags. Each file is wrapped as `<FILE_n path="..."> ... </FILE_n>`. Use `--no-tags` to disable.
- **Other formats**:
  - **markdown**: `--format markdown` adds headings per file with code fences.
  - **plain**: `--format plain` uses minimal separators.
  - **json**: `--format json` prints file metadata.
- **Config**: `.cpairc.json` or `package.json#cpai` provide team-wide defaults. CLI flags override config. For prompts, `selectedPrompts` auto-includes saved prompts by name (project-level config supersedes global).

---

If you want enhancements (e.g., per-language heuristics or automatic “most informative files first”), say the word and I’ll extend this.

---

## TUI (interactive)

### Quickstart (≈1 minute)

1) Launch in your repo

```bash
cpai tui .
```

2) Pick files
- Move with `j`/`k` or arrow keys.
- Press `space` to include/exclude the highlighted item.
- On a directory, `space` toggles everything inside.
- In the Files pane, `h` collapses and `l` expands directories.
- Press `d` to switch the right pane between Rankings and Details.
- In Rankings, `space` on a row toggles that file or the entire folder.

3) Add instructions / prompts (optional)
- `p` opens the full‑screen Instructions Editor (Esc saves; Ctrl+Q cancels).
- `Ctrl+P` opens the Saved Prompts picker (space to toggle, Enter to apply).

4) Copy
- Press `c` to copy the composed bundle to your clipboard (OSC52 fallback).
- Paste into your LLM of choice.

### Cheat sheet

```
j/k or Arrow keys   move selection
h/l (Files)         collapse / expand directory
h/l (panes)         move focus Files ↔ Rankings
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
- Prefer different output styles (markdown/plain/XML)? Use the CLI: `cpai copy` (see below).

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
 - No clipboard? Use `cpai copy . -o out.txt` or redirect: `cpai copy . > out.txt`. Ensure OSC52 passthrough is enabled (tmux) or a system clipboard tool is installed.
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
