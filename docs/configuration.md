# Configuration

CPAI supports both project-level and global configuration. All formats are JSON.

- Project: `./.cpairc.json` or `package.json#cpai`
- Global: `~/.cpai/config.json` (created via `cpai init --global`)

Precedence: CLI flags > profile > project `.cpairc.json` > project `package.json#cpai` > global `~/.cpai/config.json` > defaults.

## Paths

- Global config: `~/.cpai/config.json`
- Global ignores: `~/.cpai/.cpaiignore`
- Global prompts: `~/.cpai/prompts/`

## Keys

```jsonc
{
  "include": ["**/*"], // globs
  "exclude": ["**/node_modules/**"], // globs
  "useGitignore": true,
  "useCpaiIgnore": true, // honors project + global ~/.cpai/.cpaiignore
  "hidden": false,
  "maxBytesPerFile": 512000,
  "model": "gpt-4o-mini",
  "encoding": "o200k_base",
  "format": "markdown", // markdown | json (CLI copy)
  "mouse": false, // TUI mouse support (also overridable via --mouse)

  // Optional instructions to add at top (also duplicated at bottom in CLI copy)
  "instructions": "...",
  "instructionsFile": "./prompts/use-this.md",

  // Profiles (used by cpai copy -P <name>)
  "profiles": {
    "release": {
      "include": ["src/**", "README.md"],
      "exclude": ["**/*.test.ts"],
      "packOrder": "path",
      "strict": true,
    },
  },
}
```

## Profiles

Profiles let you save named presets for `cpai copy`. All fields merge over base config.

The TUI also honors `instructions` / `instructionsFile` as defaults, unless overridden by `-i/--instructions` or `--instructions-file` at launch.

Profile lookup order (when `-P/--profile` is used): project `.cpairc.json#profiles` → project `package.json#cpai.profiles` → global `~/.cpai/config.json#profiles`.

```bash
 cpai copy . -P release --max-tokens 120000
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
