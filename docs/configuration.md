# Configuration

CPAI supports both project-level and global configuration. All formats are JSON.

- Project: `./.cpairc.json` or `package.json#cpai`
- Global: `~/.cpai/config.json` (created via `cpai init --global`)

Precedence: CLI flags > project config > global config > defaults.

## Paths

- Global config: `~/.cpai/config.json`
- Global ignores: `~/.cpai/.cpaiignore`
- Global prompts: `~/.cpai/prompts/`

## Keys

```jsonc
{
  "include": ["**/*"],               // globs
  "exclude": ["**/node_modules/**"], // globs
  "useGitignore": true,
  "useCpaiIgnore": true,              // honors project + global ~/.cpai/.cpaiignore
  "hidden": false,
  "maxBytesPerFile": 512000,
  "model": "gpt-4o-mini",
  "encoding": "o200k_base",
  "format": "markdown",             // markdown | plain | json (CLI copy)
  "mouse": false,                    // TUI mouse support (also overridable via --mouse)

  // Optional prompt to append/prepend in copy
  "prompt": "...",
  "promptFile": "./prompts/use-this.md",

  // Profiles (used by cpai copy -P <name>)
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

Profiles let you save named presets for `cpai copy`. All fields merge over base config.

```bash
 cpai copy . -P release --clip --max-tokens 120000
```

## Global config

```bash
 cpai init --global
 # edit ~/.cpai/config.json
```

## Mouse

- Default `mouse: false` to keep key-only UX predictable.
- Enable per-run via `cpai tui . --mouse`.
- When disabled, the TUI explicitly sends terminal “mouse off” sequences to avoid stray input from prior sessions.
