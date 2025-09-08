import fs from "node:fs/promises";
import path from "node:path";
import { countTokens, ensureEncoder } from "./tokenizer.js";
import { extnameLower, toPosix } from "./utils.js";
import type { CopyOptions, FileEntry } from "../types.js";

const EXT_TO_LANG: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  cjs: "js",
  mjs: "js",
  jsx: "jsx",
  json: "json",
  md: "md",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  php: "php",
  scala: "scala",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  dockerfile: "dockerfile",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  cs: "csharp",
  css: "css",
  scss: "scss",
  less: "less",
  txt: "text",
  env: "dotenv"
};

function langForFile(relPath: string, ext: string): string {
  const byExt = EXT_TO_LANG[ext];
  if (byExt) return byExt;
  const base = path.posix.basename(relPath).toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  if (base === "makefile") return "makefile";
  return "";
}

function heading(md: boolean, level: number, text: string): string {
  return md ? `${"#".repeat(Math.max(1, level))} ${text}\n\n` : `${text}\n\n`;
}

function codeFence(md: boolean, lang?: string): { open: string; close: string } {
  if (!md) return { open: "", close: "" };
  return { open: "```" + (lang ? lang : ""), close: "```" };
}

async function readFileText(absPath: string): Promise<string> {
  const buf = await fs.readFile(absPath);
  return buf.toString("utf8");
}

export async function packFilesToBudget(
  entries: FileEntry[],
  opts: CopyOptions
): Promise<{ selected: FileEntry[]; rendered?: string; tokens?: number }> {
  if (!opts.maxTokens) return { selected: entries };

  // Choose sort order
  let sorted = [...entries];
  if (opts.packOrder === "small-first") {
    sorted.sort((a, b) => a.tokens - b.tokens);
  } else if (opts.packOrder === "large-first") {
    sorted.sort((a, b) => b.tokens - a.tokens);
  } else {
    sorted.sort((a, b) => a.relPath.localeCompare(b.relPath));
  }

  const encoder = await ensureEncoder(opts.model, opts.encoding);

  const md = opts.format === "markdown";
  const { open, close } = codeFence(md);

  const header = opts.header ? opts.header + "\n\n" : "";
  const approxHeaderTokens = header ? encoder.encode(header).length : 0;
  const prompt = opts.promptText ? String(opts.promptText) : "";
  // Build the top preface block: if caller already provided tagged content
  // (e.g., <INSTRUCTIONS>...</INSTRUCTIONS> and optional <PROMPT name="..."> blocks),
  // use it as-is; otherwise, wrap raw text in <INSTRUCTIONS> tags.
  const preface = prompt
    ? (prompt.includes('<INSTRUCTIONS>') || prompt.includes('<PROMPT')
        ? prompt
        : `<INSTRUCTIONS>\n${prompt}\n</INSTRUCTIONS>`)
    : "";
  // For the bottom, we duplicate only the INSTRUCTIONS block when available; if not found,
  // duplicate the entire preface (raw instructions wrapped above).
  const instructionsOnlyMatch = /<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/i.exec(preface);
  const bottomBlock = instructionsOnlyMatch ? instructionsOnlyMatch[0] : preface;
  const approxPromptTokens = preface
    ? encoder.encode(preface).length + encoder.encode(bottomBlock).length + 2 // two blank lines between sections
    : 0;

  const selected: FileEntry[] = [];
  let running = approxHeaderTokens + approxPromptTokens;

  for (const f of sorted) {
    let approx = f.tokens;
    if (opts.xmlWrap) {
      const lang = langForFile(f.relPath, f.ext);
      const wrapperOpen = `<file path="${f.relPath}" bytes="${f.bytes}" lines="${f.lines}" tokens="${f.tokens}" language="${lang}">\n<![CDATA[\n`;
      const wrapperClose = `\n]]>\n</file>\n\n`;
      approx += encoder.encode(wrapperOpen).length + encoder.encode(wrapperClose).length;
    } else if (opts.tagsWrap) {
      const wrapperOpen = `<FILE path="${f.relPath}">\n`;
      const wrapperClose = `\n</FILE>\n\n`;
      approx += encoder.encode(wrapperOpen).length + encoder.encode(wrapperClose).length;
    } else if (md) {
      const lang = langForFile(f.relPath, f.ext);
      const fileHeading = heading(true, 3, f.relPath);
      const fences = opts.codeFences ? `\n${open}${lang}\n${close}\n` : "\n";
      approx += encoder.encode(fileHeading).length + encoder.encode(fences).length + 12; // small buffer
    } else {
      approx += 8;
    }

    if (running + approx <= opts.maxTokens!) {
      selected.push(f);
      running += approx;
    }
  }

  if (opts.strict) {
    const body = await (opts.xmlWrap ? formatXml(selected, opts) : opts.tagsWrap ? formatTags(selected, opts) : formatOutput(selected, opts));
    const rendered = wrapWithPrompt(body, opts.promptText);
    const tokens = await countTokens(rendered);
    if (tokens > (opts.maxTokens ?? Number.MAX_SAFE_INTEGER)) {
      // Trim from the end until under budget
      const trimmed = [...selected];
      while (
        trimmed.length &&
        (await (async () => {
          const body2 = await (opts.xmlWrap
            ? formatXml(trimmed, opts)
            : opts.tagsWrap
            ? formatTags(trimmed, opts)
            : formatOutput(trimmed, opts));
          return countTokens(wrapWithPrompt(body2, opts.promptText));
        })()) >
          opts.maxTokens!
      ) {
        trimmed.pop();
      }
      const finalBody = await (opts.xmlWrap ? formatXml(trimmed, opts) : opts.tagsWrap ? formatTags(trimmed, opts) : formatOutput(trimmed, opts));
      const finalRendered = wrapWithPrompt(finalBody, opts.promptText);
      const finalTokens = await countTokens(finalRendered);
      return { selected: trimmed, rendered: finalRendered, tokens: finalTokens };
    }
    return { selected, rendered, tokens };
  }

  return { selected };
}

export async function formatOutput(entries: FileEntry[], opts: CopyOptions): Promise<string> {
  const md = opts.format === "markdown";
  const lines: string[] = [];

  if (opts.header) lines.push(opts.header.trim(), "");

  for (const f of entries) {
    const content = await readFileText(f.absPath);
    const lang = langForFile(f.relPath, f.ext);
    if (md) {
      lines.push(heading(true, 3, f.relPath).trimEnd());
      if (opts.codeFences) {
        lines.push("```" + lang);
        lines.push(content.replace(/\s+$/u, "")); // trim trailing blank space
        lines.push("```", "");
      } else {
        lines.push(content, "");
      }
    } else {
      // Non-markdown rendering is not supported here; JSON is handled by the caller.
      lines.push(content);
    }
  }

  return lines.join("\n");
}

export function renderJson(entries: FileEntry[], includeBody = false) {
  if (!includeBody) {
    return JSON.stringify(
      entries.map((e) => ({
        path: e.relPath,
        bytes: e.bytes,
        lines: e.lines,
        tokens: e.tokens,
        skipped: e.skipped ?? false,
        reason: e.reason
      })),
      null,
      2
    );
  }
  // (optional) include body if you decide to in the future
  return JSON.stringify(entries, null, 2);
}

// --- XML rendering helpers ---

function encodeCdata(text: string): string {
  return text.replaceAll("]]>", "]]]><![CDATA[>");
}

type DirNode = { name: string; dirs: Map<string, DirNode>; files: string[] };

function buildTree(paths: string[], rootName: string = '.'): DirNode {
  const root: DirNode = { name: rootName, dirs: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        node.files.push(part);
      } else {
        let next = node.dirs.get(part);
        if (!next) {
          next = { name: part, dirs: new Map(), files: [] };
          node.dirs.set(part, next);
        }
        node = next;
      }
    }
  }
  return root;
}

function renderTreeAscii(node: DirNode, prefix = ""): string[] {
  const lines: string[] = [];
  const dirNames = [...node.dirs.keys()].sort();
  const fileNames = [...node.files].sort();
  const entries: { type: "dir" | "file"; name: string }[] = [
    ...dirNames.map((n) => ({ type: "dir" as const, name: n })),
    ...fileNames.map((n) => ({ type: "file" as const, name: n }))
  ];

  entries.forEach((e, idx) => {
    const last = idx === entries.length - 1;
    const branch = last ? "└─ " : "├─ ";
    if (e.type === "file") {
      lines.push(prefix + branch + e.name);
    } else {
      lines.push(prefix + branch + e.name + "/");
      const child = node.dirs.get(e.name)!;
      const nextPrefix = prefix + (last ? "   " : "│  ");
      lines.push(...renderTreeAscii(child, nextPrefix));
    }
  });
  return lines;
}

export async function formatXml(entries: FileEntry[], opts: CopyOptions): Promise<string> {
  const lines: string[] = [];
  lines.push(`<cpai version="0.1.0">`);
  if (opts.header) {
    lines.push(`  <header><![CDATA[${encodeCdata(opts.header)}]]></header>`);
  }

  // Tree view for the selected entries
  const rootLabel = path.basename(opts.cwd || '.') + '/';
  const treeRoot = buildTree(entries.map((e) => e.relPath), path.basename(opts.cwd || '.'));
  const treeAscii = [rootLabel, ...renderTreeAscii(treeRoot)].join("\n");
  lines.push("  <tree>");
  lines.push("    <![CDATA[");
  for (const l of treeAscii.split("\n")) lines.push("    " + l);
  lines.push("    ]]>");
  lines.push("  </tree>");

  // Files
  lines.push("  <files>");
  for (const f of entries) {
    const content = await fs.readFile(f.absPath, "utf8");
    const lang = langForFile(f.relPath, f.ext);
    lines.push(
      `    <file path="${f.relPath}" bytes="${f.bytes}" lines="${f.lines}" tokens="${f.tokens}" language="${lang}">`
    );
    lines.push("      <![CDATA[");
    for (const line of encodeCdata(content).split("\n")) lines.push("      " + line);
    lines.push("      ]]>");
    lines.push("    </file>");
  }
  lines.push("  </files>");
  lines.push("</cpai>");
  return lines.join("\n");
}

export async function formatTags(entries: FileEntry[], opts: CopyOptions): Promise<string> {
  const lines: string[] = [];
  // Tree view at the top
  const rootLabel = path.basename(opts.cwd || '.') + '/';
  const treeRoot = buildTree(entries.map((e) => e.relPath), path.basename(opts.cwd || '.'));
  const treeAscii = [rootLabel, ...renderTreeAscii(treeRoot)].join("\n");
  lines.push("<TREE>");
  lines.push(treeAscii);
  lines.push("</TREE>", "");
  if (opts.header) lines.push(`<HEADER>${opts.header}</HEADER>`, "");
  let i = 0;
  for (const f of entries) {
    i += 1;
    const content = await fs.readFile(f.absPath, "utf8");
    lines.push(`<FILE_${i} path="${f.relPath}">`);
    lines.push(content.replace(/\s+$/u, ""));
    lines.push(`</FILE_${i}>`, "");
  }
  return lines.join("\n");
}

export function wrapWithPrompt(body: string, prompt?: string): string {
  if (!prompt) return body;
  // If caller already returns tagged content (<INSTRUCTIONS> / <PROMPT name>), use it.
  // Otherwise, wrap raw text in <INSTRUCTIONS> tags.
  const preface = (prompt.includes('<INSTRUCTIONS>') || prompt.includes('<PROMPT'))
    ? prompt
    : `<INSTRUCTIONS>\n${prompt}\n</INSTRUCTIONS>`;
  // Duplicate only the instructions block at the bottom for emphasis; saved prompts remain at the top.
  const instructionsOnlyMatch = /<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/i.exec(preface);
  const bottom = instructionsOnlyMatch ? instructionsOnlyMatch[0] : preface;
  const parts = [preface, "", body, "", bottom];
  return parts.join("\n");
}
