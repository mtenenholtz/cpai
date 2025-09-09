# Prompts (Saved + Ad‑Hoc)

CPAI composes a final prompt from:

1. Selected saved prompts (multi‑select)
2. Ad‑hoc prompt text (inline or full‑screen editor)

Ad‑hoc instructions are added at the top and duplicated at the bottom when you run `cpai copy` or use the TUI Copy action. Saved prompts are added at the top only.

## Saved prompts

Locations (all discovered automatically):

- Project: `./.cpai/prompts/` or `./prompts/`
- Global: `~/.cpai/prompts/`

Supported file types: `.md`, `.txt`, `.prompt` (file name becomes the prompt name).

Name conflicts: project prompts win over global; global prompts show `(global)` in pickers.

## Auto-select via config

You can have CPAI automatically select saved prompts by name via config:

- Project: `./.cpairc.json` (or `package.json#cpai`)
- Global: `~/.cpai/config.json`

Project-level config supersedes global for the same field.

Example (`.cpairc.json`):

```json
{
  "selectedPrompts": ["swe-guidelines", "acceptance-criteria"]
}
```

Behavior:

- TUI: those prompts are pre-selected in the Saved Prompts picker on launch.
- CLI `copy`: those prompts are included automatically at the top of the composed prompt (as `<PROMPT name="...">…</PROMPT>` blocks), in addition to any ad‑hoc `-i/--instructions` or `--instructions-file` text.

## Using saved prompts in TUI

- `Ctrl+P`: open the Saved Prompts picker
  - Space: toggle selection
  - Enter: apply
  - Esc: cancel
- Selected prompts appear first in the composed prompt as `<PROMPT name="...">…</PROMPT>` blocks.

## Ad‑hoc instructions

- Open the Instructions Editor: press `p`
  - Esc: save and close; Ctrl+Q: cancel
  - Shift+W/B: move by word; Ctrl+K: kill‑to‑EOL; Ctrl+W: delete word

Project or global config can also set default instructions via `instructions` or `instructionsFile`.

## CLI composition

`cpai copy` accepts `-i, --instructions` / `--instructions-file` and will combine those with any prompts selected by the TUI in the session.

**Composition details**

- Ad‑hoc instructions are wrapped in `<INSTRUCTIONS>…</INSTRUCTIONS>` at the top, and that block is duplicated again at the bottom.
- Saved prompts are added only at the top as `<PROMPT name="…">…</PROMPT>` blocks.
