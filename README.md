# aicp

**aicp** helps you **scan** and **bulk copy** code (or any text files) into a single prompt for an LLM, while keeping an eye on **token usage**. It supports globs, `.gitignore`/`.aicpignore`, packing under a token budget, and rendering as Markdown / plain / JSON. Powered by [`@dqbd/tiktoken`](https://www.npmjs.com/package/@dqbd/tiktoken).

## Install (local dev)

```bash
pnpm install
pnpm run build
pnpm link --global
# now the `aicp` command is available globally
````

Or run directly:

```bash
pnpm dlx tsx src/cli.ts --help
```

## Quick start

Scan a project:

```bash
aicp scan . --by-dir
```

Copy as tags (default) to stdout:

```bash
aicp copy . --include "src/**/*" --exclude "src/**/*.test.ts"
```

Fit under a 120k token budget, small files first, copy to clipboard:

```bash
aicp copy . --max-tokens 120000 --pack-order small-first --clip
```

Write to a file:

```bash
aicp copy . -o aicp-bundle.md
```

Initialize a local config:

```bash
aicp init
```

## Configuration

Create `.aicprc.json` (or put an `aicp` field in `package.json`):

```json
{
  "include": ["**/*"],
  "exclude": ["**/{node_modules,dist,build,.git}/**", "**/*.{png,jpg,svg,zip,pdf}"],
  "useGitignore": true,
  "useAicpIgnore": true,
  "hidden": false,
  "maxBytesPerFile": 512000,
  "model": "gpt-4o-mini",
  "encoding": "o200k_base",
  "format": "markdown",
  "selectedPrompts": ["swe-guidelines", "acceptance-criteria"]
}
```

> **Note:** Token counts are model/encoding-specific approximations. For the most accurate budget fit, use `--strict` (default) so `aicp` re-counts the final rendered text.

## Tips

* Use `--include`/`--exclude` globs to trim noise (tests, build artifacts, fixtures).
* Respect `.gitignore` by default, and add additional rules in `.aicpignore`.
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
aicp scan . --by-dir
```

3. **Create a paste-ready Markdown bundle**

```bash
aicp copy . --include "src/**/*,README.md" --exclude "src/**/*.test.ts" --max-tokens 120000 --clip
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
- **Config**: `.aicprc.json` and/or `package.json#aicp` provide team-wide defaults. CLI flags override config. For prompts, `selectedPrompts` auto-includes saved prompts by name (project-level config supersedes global).

---

If you want enhancements (e.g., per-language heuristics, automatic “most informative files first,” or a TUI for interactive toggling), say the word and I’ll extend this.

---

## TUI (interactive)

Open the interactive interface:

```bash
aicp tui .
```

Layout
- Left: files with ✔/✖ status, tokens, bytes
- Right: details for the focused file
- Bottom: status + condensed help (press ? for full cheatsheet)

Keybindings
- Navigation: Up/Down, j/k, PgUp/PgDn
- Selection: Space (toggle), A (all), N (none), V (invert)
- Rules: i include globs, x exclude globs, g .gitignore, a .aicpignore, . hidden
- Packing: b budget, s sort, m format, e XML, t Tags, p edit instructions
- Actions: c copy (clipboard), o write file
- Help/App: ?/F1 help, q quit

Clipboard notes (tmux/screen/SSH)
- Uses system clipboard via clipboardy; if that fails, falls back to OSC52 in compatible terminals.
- Under tmux, enable OSC52 passthrough: set -g set-clipboard on

Windows/WSL
- Prefer UTF‑8 terminals (Windows Terminal, PowerShell 7+). If characters look odd, switch the code page to UTF‑8.

Troubleshooting
- No clipboard? Use o to write to a file, or ensure OSC52 passthrough is enabled (tmux) or a system clipboard tool is installed.
- Small terminal? Increase size; the TUI needs roughly 68×12 or larger.
- Auto‑refresh: The TUI detects added/removed files and rescans automatically (polls every ~2s). Adjust with `AICP_TUI_POLL_MS`.

### TUI extras

New flags & features:

Start with instructions prefilled

```bash
aicp tui . -i "Refactor for clarity"
# or
aicp tui . --instructions-file .prompt.txt
```

Pick saved prompts (multi-select)

Place `.md`, `.txt`, or `.prompt` files in `./prompts/` or `./.aicp/prompts/`, then:

```bash
aicp tui . --prompts-dir ./prompts --pick-prompts
```

In the UI:
- `p` edits ad‑hoc instructions (included at top & bottom).
- `Ctrl+P` opens a Prompts Picker (space to toggle, `v` to preview, Enter to apply).
- The final preface includes `<INSTRUCTIONS>` at the top, and any selected saved prompts are added beneath it as separate `<PROMPT name="...">` blocks.

Layout & Tabs
- Click the tab bar or press keys to switch: `Tree`, `Flat`, `Rank`, `Details`, `Prompts`.
- `L` toggles Auto/Horizontal/Vertical layouts (Auto picks vertical for narrow terminals).
- Status bar shows token count vs budget when set.

Tree & Rankings
- Files/dirs show aligned token counts.
- `F2` cycles the tree metric column (tokens/bytes/lines).
- `h` mutes the selected file/dir from Rankings only (does not affect packing).
- `H` clears all mutes.

Copy/Write still honor selection
- Muting only affects the Top lists. Use Space, A/N/V (include/exclude) to control what gets packed.

CLI cheatsheet

```text
? Help  / Filter  Space Toggle  A All  N None  V Invert
i include  x exclude  g .gitignore  a .aicpignore  . Hidden
b Budget  s Sort  m Format  e XML  t Tags
p Prompt  P Prompts  h/H mute rankings  F2 metric
L Layout  o Write  c Copy  r Rescan  q Quit
```

---

## Profiles and Prompt Injection

- Define profiles in `.aicprc.json`:

```json
{
  "profiles": {
    "docs-only": {
      "include": ["README.md", "docs/**/*"],
      "exclude": ["**/*.png"],
      "prompt": "Summarize the docs and propose improvements.",
      "selectedPrompts": ["style-guide"]
    }
  }
}
```

- Use a profile: `aicp copy . --profile docs-only`
- Add/override instructions at runtime:
- Inline: `-i "Refactor for clarity; note assumptions."`
- From file: `--instructions-file .prompt.txt`
- The instructions are inserted at the very top and bottom wrapped in `<INSTRUCTIONS>...</INSTRUCTIONS>` tags and count toward the token budget when packing. Any selected saved prompts are appended beneath the initial `<INSTRUCTIONS>` block as `<PROMPT name="...">...</PROMPT>` blocks.
