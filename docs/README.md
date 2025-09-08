# CPAI Documentation

CPAI makes it easy to use web‑only models like GPT‑5 Pro with your local codebase. It scans your repo, fits selections under token limits, and copies a clean, paste‑ready bundle for the model’s web UI.

This documentation covers:

- CLI usage and examples
- TUI (Ink) usage and keybindings
- Configuration (project + global) and precedence
- Prompts (saved + ad‑hoc) and the Instructions Editor
- Ignore rules (.gitignore + .cpaiignore, including global ignores)
- Troubleshooting tips

Topic entry points:

- docs/cli.md — Command reference and examples
- docs/tui.md — TUI walkthrough + keymap
- docs/configuration.md — Config options and precedence
- docs/prompts.md — Saved prompts, the editor, and composition
- docs/ignore.md — How ignores work (.gitignore, .cpaiignore)
- docs/troubleshooting.md — Common issues and fixes

## Quick Start

1. Install dependencies (Node >= 18.18):

```bash
pnpm install
```

2. Scan a repository and print a table:

```bash
# after: pnpm run build && pnpm link --global
cpai scan . --by-dir
# or without linking:
pnpm dlx tsx src/cli.ts scan . --by-dir
```

3. Copy a packed bundle under a token budget (to clipboard by default):

```bash
cpai copy . --max-tokens 80000 --by-dir
# or without linking:
pnpm dlx tsx src/cli.ts copy . --max-tokens 80000 --by-dir
```

4. Launch the Ink TUI:

```bash
cpai tui .
# or:
pnpm dlx tsx src/cli.ts tui .
```

- Use j/k or arrow keys to move, `space` to toggle include/exclude
- `h`/`l` collapse/expand directories in Files, and move focus between Files/Rankings
- `d` toggles the right pane (Details ↔ Rankings)
- `p` opens the full‑screen Instructions Editor; `Ctrl+P` opens the Saved Prompts picker

5. Configure defaults (project or global):

```bash
# project-level
cpai init
# or without linking:
pnpm dlx tsx src/cli.ts init

# global defaults (~/.cpai/config.json)
cpai init --global
# or without linking:
pnpm dlx tsx src/cli.ts init --global
```

See docs/cli.md and docs/tui.md for a deeper tour.
