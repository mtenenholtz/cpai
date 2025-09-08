# Output Formats

CPAI can render Markdown, JSON, and an XML bundle.

## Markdown (default)
- Per‑file `### path` headings.
- Code fences on by default (disable with `--no-code-fences`).

```md
### src/lib/utils.ts
```ts
// ...
```
```

## JSON

- Emits a list of file metadata (no bodies).

```bash
cpai copy . -f json > files.json
```

## Per‑file tags (default wrapper)

- Each file is wrapped with a simple tag; disable via `--no-tags`.

```xml
<FILE_1 path="src/lib/utils.ts">
...
</FILE_1>
```

## XML bundle

Emits a tree and files section. Contents are wrapped in CDATA and file metadata is captured as attributes. This can be enabled via configuration (e.g., in a profile with `"xmlWrap": true`).

```xml
<cpai version="0.1.0">
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
</cpai>
```

### Headers and prompts

- `--header "<text>"` prepends a header block.
- `-i, --instructions` / `--instructions-file` add an `<INSTRUCTIONS>` block at the top and a duplicate of that `<INSTRUCTIONS>` block at the bottom. Selected saved prompts are added at the top as `<PROMPT name="...">…</PROMPT>` blocks. `--strict` accounts for these in token budgets.
