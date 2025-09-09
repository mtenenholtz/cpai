# Troubleshooting

## “Ink UI requires dependencies that are not installed”

Run:

```bash
pnpm install
pnpm run build
```

Then retry `cpai tui .`. (The Ink adapter dynamically imports `ink` and `react`.)

## Clipboard didn’t copy

- CLI and TUI both use system clipboard via `clipboardy`, with OSC52 fallback.
- On tmux, enable OSC52 passthrough:

  ```
  set -g set-clipboard on
  ```

- If SSH/remote, ensure your terminal supports OSC52 or write to a file instead (`-o bundle.md`) and copy manually.

## “too-large” or missing files

- Files larger than `maxBytesPerFile` (default 512 KB) are skipped.
- Raise the limit:

  ```bash
  cpai scan . --max-bytes-per-file 2097152
  ```

## Wrong files scanned

- Use `--include`/`--exclude` globs and review `.gitignore` and `.cpaiignore` (project & `~/.cpai/.cpaiignore`).
- In the TUI, use Tree view and look for ✖ auto‑deselections from `.cpaiignore`.

## Token budget doesn’t fit

- `--max-tokens` packs by estimate; with `--strict` (default), CPAI re‑renders and verifies the final text fits. If it’s over budget, the CLI errors unless `--truncate` is set, in which case it drops trailing files until it fits.
- Try `--pack-order small-first` or reduce scope with globs.

## Mouse isn’t working in TUI

- Mouse is off by default; enable with:

  ```bash
  cpai tui . --mouse
  ```

- Some terminals/tmux configs remap mouse modes; if it behaves oddly, run without mouse and use keys.

## Windows/WSL display oddities

- Use UTF‑8 terminals (Windows Terminal, PowerShell 7+).
- If wide glyphs look misaligned, widen your terminal or reduce font size slightly.

## “binary-ext” or weird characters in output

- CPAI skips files with known binary extensions. If a file is actually text, add an explicit include pattern for its path and consider renaming to a text extension.

## Version / Node issues

- Requires Node ≥ 18.18.
- Verify with `node -v`. Reinstall if needed.

## Auto‑refresh interval

- The TUI polls for file list changes ~every 2 seconds. Adjust with:
  - `CPAI_TUI_POLL_MS=<millis>`
