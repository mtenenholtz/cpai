# AICP Documentation

Welcome to AICP — a CLI and TUI for scanning repositories, inspecting token usage, and composing copyable bundles for LLM workflows.

This documentation covers:

- CLI usage and examples
- TUI (Ink) usage and keybindings
- Configuration (project + global) and precedence
- Prompts (saved + ad‑hoc) and the Instructions Editor
- Ignore rules (.gitignore + .aicpignore, including global ignores)
- Troubleshooting tips

Topic entry points:

- docs/cli.md — Command reference and examples
- docs/tui.md — TUI walkthrough + keymap
- docs/configuration.md — Config options and precedence
- docs/prompts.md — Saved prompts, the editor, and composition
- docs/ignore.md — How ignores work (.gitignore, .aicpignore)
- docs/troubleshooting.md — Common issues and fixes

## Quick Start

1. Install dependencies (Node >= 18.18):

```bash
pnpm install
```

2. Scan a repository and print a table:

```bash
# after: pnpm run build && pnpm link --global
aicp scan . --by-dir
# or without linking:
pnpm dlx tsx src/cli.ts scan . --by-dir
```

3. Copy a packed bundle under a token budget:

```bash
aicp copy . --max-tokens 80000 --clip --by-dir
# or without linking:
pnpm dlx tsx src/cli.ts copy . --max-tokens 80000 --clip --by-dir
```

4. Launch the Ink TUI:

```bash
aicp tui .
# or:
pnpm dlx tsx src/cli.ts tui .
```

- Use j/k to move, space to toggle, T to toggle Tree/Flat, d to toggle Details/Rankings
- p opens the full‑screen Instructions Editor
- Ctrl+P opens the Saved Prompts picker

5. Configure defaults (project or global):

```bash
# project-level
aicp init
# or without linking:
pnpm dlx tsx src/cli.ts init

# global defaults (~/.aicp/config.json)
aicp init --global
# or without linking:
pnpm dlx tsx src/cli.ts init --global
```

See docs/cli.md and docs/tui.md for a deeper tour.
