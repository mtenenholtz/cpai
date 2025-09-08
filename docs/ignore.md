# Ignore Rules

CPAI combines include/exclude globs, .gitignore, and .cpaiignore to decide what to scan and render.

## Sources of ignore rules

- CLI globs
  - `--include <globs...>` and `--exclude <globs...>` (comma or space separated)
  - Highest precedence (explicit includes can still be excluded by later filters if they match)
- .gitignore (respected by default)
  - Disable with `--no-gitignore`
- .cpaiignore
  - Project: `./.cpaiignore`
  - Global: `~/.cpai/.cpaiignore`
  - Enabled by default (`useCpaiIgnore: true`); disable with `--no-cpaiignore` on the CLI.
  - Lines are globs; `#` starts a comment.

### Default excludes

By default CPAI avoids common heavy/noisy content (see `src/lib/config.ts`): build directories, binary extensions, lock/log files, and files over `maxBytesPerFile` (default 512 KB).

## TUI vs CLI behavior

- CLI: files matching `.cpaiignore` are simply not included.
- TUI: files matching `.cpaiignore` appear but are auto‑deselected (visible, with ✖), so you can still override interactively.

## Examples

Ignore tests and coverage:

```gitignore
# .cpaiignore
**/*.test.ts
coverage/**
```

CLI with globs:

```bash
cpai scan . --include "src/**" --exclude "**/*.test.ts"
cpai copy . --include "src/**,README.md" --exclude "**/*.snap"
```

## Tips

- Prefer narrowing with `--include` over trying to exclude many patterns.
- If you need binaries, raise `--max-bytes-per-file` and explicitly include the paths.
- Remember the global ignore file at `~/.cpai/.cpaiignore` applies everywhere; check there if something “disappears”.
