# Output Formats

AICP can render Markdown, Plain, JSON, and an XML bundle.

## Markdown (default)
- Per‑file `### path` headings.
- Code fences on by default (disable with `--no-code-fences`).

```md
### src/lib/utils.ts
```ts
// ...
```
```

## Plain
- Minimal separators; good for grepping.
```bash
aicp copy . -f plain --block-separator "\n---\n"
```

## JSON

- Emits a list of file metadata (no bodies).

```bash
aicp copy . -f json > files.json
```

## Per‑file tags (default wrapper)

- Each file is wrapped with a simple tag; disable via `--no-tags`.

```xml
<FILE_1 path="src/lib/utils.ts">
...
</FILE_1>
```

## XML bundle (`--xml`)

Emits a tree and files section. Contents are wrapped in CDATA and file metadata is captured as attributes.

```xml
<aicp version="0.1.0">
  <tree><![CDATA[
repo/
├─ src/
│  ├─ lib/
│  │  └─ utils.ts
  ]]></tree>
  <files>
    <file path="src/lib/utils.ts" bytes="1234" lines="80" tokens="450" language="ts">
      <![CDATA[
      // file content...
      ]]>
    </file>
  </files>
</aicp>
```

### Headers and prompts

- `--header "<text>"` prepends a header block.
- `--prompt`/`--prompt-file` add a `<PROMPT>` block above and below the body; `--strict` accounts for this in token budgets.

