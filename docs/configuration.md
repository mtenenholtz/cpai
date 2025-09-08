# Configuration

AICP supports both project-level and global configuration. All formats are JSON.

- Project: `./.aicprc.json` or `package.json#aicp`
- Global: `~/.aicp/config.json` (created via `aicp init --global`)

Precedence: CLI flags > project config > global config > defaults.

## Paths

- Global config: `~/.aicp/config.json`
- Global ignores: `~/.aicp/.aicpignore`
- Global prompts: `~/.aicp/prompts/`

## Keys

```jsonc
{
  "include": ["**/*"],               // globs
  "exclude": ["**/node_modules/**"], // globs
  "useGitignore": true,
  "useAicpIgnore": true,              // honors project + global ~/.aicp/.aicpignore
  "hidden": false,
  "maxBytesPerFile": 512000,
  "model": "gpt-4o-mini",
  "encoding": "o200k_base",
  "format": "markdown",             // markdown | plain | json (CLI copy)
  "mouse": false,                    // TUI mouse support (also overridable via --mouse)

  // Optional prompt to append/prepend in copy
  "prompt": "...",
  "promptFile": "./prompts/use-this.md",

  // Profiles (used by aicp copy -P <name>)
  "profiles": {
    "release": {
      "include": ["src/**", "README.md"],
      "exclude": ["**/*.test.ts"],
      "packOrder": "path",
      "strict": true
    }
  }
}
```

## Profiles

Profiles let you save named presets for `aicp copy`. All fields merge over base config.

```bash
 aicp copy . -P release --clip --max-tokens 120000
```

## Global config

```bash
 aicp init --global
 # edit ~/.aicp/config.json
```

## Mouse

- Default `mouse: false` to keep key-only UX predictable.
- Enable per-run via `aicp tui . --mouse`.
- When disabled, the TUI explicitly sends terminal “mouse off” sequences to avoid stray input from prior sessions.
