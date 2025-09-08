# CLI Reference

AICP ships a single executable `aicp` with these primary commands:

- `aicp init` — create a config (project or global)
- `aicp scan` — scan files and report token usage
- `aicp copy` — render and copy/write a bundle (optionally under a token budget)
- `aicp tui` — run the Ink TUI

All commands accept `-C, --cwd <dir>` to change the working directory.

---

## aicp init

Create a config with sensible defaults.

```bash
# project-level ./.aicprc.json
 aicp init -C .

# global defaults (~/.aicp/config.json)
 aicp init --global
```

---

## aicp scan [dir]

Scan a directory and print token usage for each file. Defaults to a table; `--json` prints JSON.

Key options:

- `--include <globs...>` / `--exclude <globs...>`
- `--no-gitignore` (respect .gitignore by default)
- `--aicpignore` (on by default; merges project .aicpignore and global ~/.aicp/.aicpignore)
- `--hidden` include dotfiles
- `--max-bytes-per-file <n>` (skip large files)
- `--model <name>`; `--encoding <tiktoken>`
- `--by-dir` (also print directory-level summary)
- `--json`

Example:

```bash
 aicp scan . --include "src/**" --exclude "**/*.test.ts" --by-dir
```

---

## aicp copy [dir]

Render files and write to stdout, a file, and/or the clipboard; optionally pack under `--max-tokens`.

Key options:

- `--include/--exclude` (as above)
- `-f, --format markdown|plain|json` (default markdown)
- `-o, --out <file>` write to a file instead of stdout
- `--clip` also copy rendered text to clipboard (OSC52 fallback)
- `--max-tokens <n>` pack to stay under token budget
- `--pack-order small-first|large-first|path` (default small-first)
- `--strict` re-render and strictly enforce the token budget
- `--no-code-fences` (markdown only)
- `--header <text>` arbitrary prefix
- `--block-separator <s>` (plain format)
 - `--xml` (XML wrapper) or `--no-tags` (disable the default `<FILE_n>` tags)
   - By default, copy output is wrapped per file with `<FILE_n path="...">...</FILE_n>`.
   - Pass `--no-tags` to suppress those tags, or `--xml` to emit a full XML bundle with a `<tree>` section and `<files><file ...><![CDATA[...]]></file></files>`.
   - See docs/formats.md for examples.
- `-P, --profile <name>` use a named profile from config
- `-i, --instructions <text>` / `--instructions-file <path>` include ad‑hoc instructions
- `--by-dir` also print directory breakdown to stderr

Config interaction:

- If `selectedPrompts` is set in project/global config (project wins), those saved prompts are automatically included in the composed prompt for `copy`.

Examples:

```bash
 # Copy everything to clipboard
 aicp copy . --clip

 # Pack to 120k tokens, small-first ordering
 aicp copy . --max-tokens 120000 --pack-order small-first --clip

 # JSON list of files (no body)
 aicp copy . -f json > files.json

 # XML wrapper
 aicp copy . --xml -o bundle.xml
```

Notes:

- When `--max-tokens` is set, AICP estimates token cost per file and selects files until the budget is reached. With `--strict`, it re-renders and trims from the end until under budget.
- Markdown default includes code fences and per-file headings; use `--no-code-fences` to omit fences.

---

## aicp tui [dir]

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
 aicp tui .

 # Start with saved prompts picker open
 aicp tui . --pick-prompts

 # Enable mouse just for this session
 aicp tui . --mouse
```

The Ink TUI is documented in docs/tui.md.
