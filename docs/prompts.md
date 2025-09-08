# Prompts (Saved + Ad‑Hoc)

AICP composes a final prompt from:

1) Selected saved prompts (multi‑select)
2) Ad‑hoc prompt text (inline or full‑screen editor)

The composed prompt is added above and below the rendered files when you run `aicp copy` or use the TUI Copy action.

## Saved prompts

Locations (all discovered automatically):

- Project: `./.aicp/prompts/` or `./prompts/`
- Global: `~/.aicp/prompts/`

Supported file types: `.md`, `.txt`, `.prompt` (file name becomes the prompt name).

Name conflicts: project prompts win over global; global prompts show `(global)` in pickers.

## Auto-select via config

You can have AICP automatically select saved prompts by name via config:

- Project: `./.aicprc.json` (or `package.json#aicp`)
- Global: `~/.aicp/config.json`

Project-level config supersedes global for the same field.

Example (`.aicprc.json`):

```json
{
  "selectedPrompts": ["swe-guidelines", "acceptance-criteria"]
}
```

Behavior:

- TUI: those prompts are pre-selected in the Saved Prompts picker on launch.
- CLI `copy`: those prompts are included automatically in the composed prompt (as `<PROMPT name="...">…</PROMPT>` blocks), in addition to any ad‑hoc `-i/--instructions` or `--instructions-file` text.

## Using saved prompts in TUI

- `Ctrl+P`: open the Saved Prompts picker
  - Space: toggle selection
  - Enter: apply
  - Esc: cancel
- Selected prompts appear first in the composed prompt (each under a `### <name>` section).

## Ad‑hoc instructions

- Open the Instructions Editor: press `p`
  - Esc: save and close; Ctrl+Q: cancel
  - Shift+W/B: move by word; Ctrl+K: kill‑to‑EOL; Ctrl+W: delete word

Project or global config can also set default instructions via `prompt` or `promptFile`.

## CLI composition

`aicp copy` accepts `-i, --instructions` / `--instructions-file` and will combine those with any prompts selected by the TUI in the session.
