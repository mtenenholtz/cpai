# Ignore Rules

AICP combines include/exclude globs, .gitignore, and .aicpignore to decide what to scan and render.

## Sources of ignore rules

- CLI globs
  - `--include <globs...>` and `--exclude <globs...>` (comma or space separated)
  - Highest precedence (explicit includes can still be excluded by later filters if they match)
- .gitignore (respected by default)
  - Disable with `--no-gitignore`
- .aicpignore
  - Project: `./.aicpignore`
  - Global: `~/.aicp/.aicpignore`
  - Enabled by default (`useAicpIgnore: true`); disable with `--no-aicpignore` on the CLI.
  - Lines are globs; `#` starts a comment.

### Default excludes

By default AICP avoids common heavy/noisy content (see `src/lib/config.ts`): build directories, binary extensions, lock/log files, and files over `maxBytesPerFile` (default 512 KB).

## TUI vs CLI behavior

- CLI: files matching `.aicpignore` are simply not included.
- TUI: files matching `.aicpignore` appear but are auto‑deselected (visible, with ✖), so you can still override interactively.

## Examples

Ignore tests and coverage:

```gitignore
# .aicpignore
**/*.test.ts
coverage/**
```

CLI with globs:

```bash
aicp scan . --include "src/**" --exclude "**/*.test.ts"
aicp copy . --include "src/**,README.md" --exclude "**/*.snap"
```

## Tips

- Prefer narrowing with `--include` over trying to exclude many patterns.
- If you need binaries, raise `--max-bytes-per-file` and explicitly include the paths.
- Remember the global ignore file at `~/.aicp/.aicpignore` applies everywhere; check there if something “disappears”.

