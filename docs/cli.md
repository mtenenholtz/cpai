# CLI Reference

CPAI ships a single executable `cpai` with these primary commands:

- `cpai init` — create a config (project or global)
- `cpai scan` — scan files and report token usage
- `cpai copy` — render and copy/write a bundle (optionally under a token budget)
- `cpai tui` — run the Ink TUI

All commands accept `-C, --cwd <dir>` to change the working directory.

---

## cpai init

Create a config with sensible defaults.

```bash
# project-level ./.cpairc.json
 cpai init -C .

# global defaults (~/.cpai/config.json)
 cpai init --global
```

---

## cpai scan [dir]

Scan a directory and print token usage for each file. Defaults to a table; `--json` prints JSON.

Key options:

- `--include <globs...>` / `--exclude <globs...>`
- `--no-gitignore` (respect .gitignore by default)
- `--no-cpaiignore` to disable reading .cpaiignore
- `--hidden` include dotfiles
- `--max-bytes-per-file <n>` (skip large files)
- `--model <name>`; `--encoding <tiktoken>`
- `--by-dir` (also print directory-level summary)
- `--json`

Example:

```bash
 cpai scan . --include "src/**" --exclude "**/*.test.ts" --by-dir
```

---

## cpai copy [dir]

Render files and copy to the clipboard by default; optionally also write to stdout or a file, and pack under `--max-tokens`.

Key options:

- `--include/--exclude` (as above)
- `-f, --format markdown|json` (default markdown)
- `-o, --out <file>` write to a file
- `--stdout` also write to stdout
- `--no-clip` do not copy to clipboard
- `--max-tokens <n>` pack to stay under token budget
- `--pack-order small-first|large-first|path` (default small-first)
- `--strict` re-render and strictly enforce the token budget
- `--no-code-fences` (markdown only)
- `--header <text>` arbitrary prefix
- `--no-tags` (disable the default `<FILE_n>` tags)
  - By default, copy output is wrapped per file with `<FILE_n path="...">...</FILE_n>`.
  - See docs/formats.md for examples (including XML bundles via profile configuration).
- `-P, --profile <name>` use a named profile from config
- `-i, --instructions <text>` / `--instructions-file <path>` include ad‑hoc instructions
- `--by-dir` also print directory breakdown to stderr

Config interaction:

- If `selectedPrompts` is set in project/global config (project wins), those saved prompts are automatically included in the composed prompt for `copy`.

Examples:

```bash
 # Copy everything to clipboard (default)
 cpai copy .

 # Pack to 120k tokens, small-first ordering
 cpai copy . --max-tokens 120000 --pack-order small-first

 # JSON list of files (no body) to stdout
 cpai copy . -f json --stdout > files.json

 # Write to a file (still copies to clipboard unless --no-clip)
 cpai copy . -o bundle.txt
```

Notes:

- When `--max-tokens` is set, CPAI estimates token cost per file and selects files until the budget is reached. With `--strict`, it re-renders and trims from the end until under budget.
- Markdown default includes code fences and per-file headings; use `--no-code-fences` to omit fences.

---

## cpai tui [dir]

Run the Ink TUI.

Options:

- `-i, --instructions <text>` or `--instructions-file <path>` (prefill ad‑hoc instructions)
- `--prompts-dir <dir>` (saved prompts additional directory)
- `--pick-prompts` (open saved prompts on launch)
- `--mouse` (enable mouse for this run; otherwise use config)

Config interaction:

- If `selectedPrompts` is set in project/global config (project wins), those prompts are pre-selected in the picker when the TUI starts.

Examples:

```bash
 # Basic
 cpai tui .

 # Start with saved prompts picker open
 cpai tui . --pick-prompts

 # Enable mouse just for this session
 cpai tui . --mouse
```

The Ink TUI is documented in docs/tui.md.
