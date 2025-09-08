import path from 'node:path';
import fs from 'node:fs/promises';
import { globby } from 'globby';
import type { CopyOptions, FileEntry, ScanOptions } from '../../types.js';
import { ensureEncoder, countTokens } from '../../lib/tokenizer.js';
import { scanConcurrent } from '../../lib/scan.js';
import { formatOutput, formatTags, formatXml, packFilesToBudget, wrapWithPrompt } from '../../lib/format.js';
import type { State, SavedPrompt } from './state.js';
import os from 'node:os';

export async function rescan(
  state: State,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  await ensureEncoder(state.model, state.encoding);
  const opts: ScanOptions = {
    cwd: state.cwd,
    include: state.include,
    exclude: state.exclude,
    useGitignore: state.useGitignore,
    // Always list everything; we'll apply .cpaiignore as auto-deselect, not hide
    useCpaiIgnore: false,
    hidden: state.hidden,
    maxBytesPerFile: state.maxBytesPerFile,
    model: state.model,
    encoding: state.encoding,
  };
  const result = await scanConcurrent(opts, { concurrency: 16, onProgress, signal });
  const list = result.files.filter((f) => !f.skipped);
  state.files = list;
  if (state.selectedIdx >= list.length) state.selectedIdx = Math.max(0, list.length - 1);

  // Compute autoDeselected from .cpaiignore (visible but off by default)
  const auto = new Set<string>();
  if (state.useCpaiIgnore) {
    try {
      const raw = await fs.readFile(path.join(state.cwd, '.cpaiignore'), 'utf8');
      const extra = (raw || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      if (extra.length) {
        const patterns = state.include.length ? state.include : ['**/*'];
        const all = await globby(patterns, {
          cwd: state.cwd,
          gitignore: state.useGitignore,
          ignore: state.exclude,
          dot: state.hidden,
          onlyFiles: true,
          followSymbolicLinks: false,
        });
        const kept = await globby(patterns, {
          cwd: state.cwd,
          gitignore: state.useGitignore,
          ignore: [...state.exclude, ...extra, ...await (async () => {
            const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || '';
            if (!home) return [] as string[];
            try {
              const rg = await fs.readFile(path.join(home, '.cpai', '.cpaiignore'), 'utf8');
              return rg.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            } catch {}
            return [] as string[];
          })()],
          dot: state.hidden,
          onlyFiles: true,
          followSymbolicLinks: false,
        });
        const keptSet = new Set(kept.map((p) => p.split(path.sep).join('/')));
        for (const p of all) {
          const px = p.split(path.sep).join('/');
          if (!keptSet.has(px)) auto.add(px);
        }
      }
    } catch {}
  }
  state.autoDeselected = auto;
}

export function composePrompt(state: State): string | undefined {
  const picks = state.availablePrompts.filter((p) => state.selectedPrompts.has(p.name));
  const parts: string[] = [];
  const instructions = state.promptText?.trim();
  const escAttr = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  if (instructions) {
    parts.push(`<INSTRUCTIONS>\n${instructions}\n</INSTRUCTIONS>`);
  }
  for (const p of picks) {
    const name = escAttr(p.name);
    parts.push(`<PROMPT name="${name}">\n${p.text.trim()}\n</PROMPT>`);
  }
  const final = parts.join('\n\n');
  return final ? final : undefined;
}

export async function renderPackedText(
  entries: FileEntry[],
  state: State
): Promise<{ text: string; selected: FileEntry[]; tokens: number }> {
  const cfg: CopyOptions = {
    cwd: state.cwd,
    include: state.include,
    exclude: state.exclude,
    useGitignore: state.useGitignore,
    useCpaiIgnore: state.useCpaiIgnore,
    hidden: state.hidden,
    maxBytesPerFile: state.maxBytesPerFile,
    model: state.model,
    encoding: state.encoding,
    format: state.format,
    outFile: undefined,
    toClipboard: false,
    byDir: false,
    maxTokens: state.maxTokens,
    packOrder: state.packOrder,
    strict: state.strict,
    codeFences: true,
    header: undefined,
    xmlWrap: state.xmlWrap,
    tagsWrap: state.tagsWrap,
    promptText: composePrompt(state),
  };
  const { selected, rendered, tokens } = await packFilesToBudget(entries, cfg);
  let body =
    rendered ?? (state.xmlWrap
      ? await formatXml(selected, cfg)
      : state.tagsWrap
      ? await formatTags(selected, cfg)
      : await formatOutput(selected, cfg));
  const text = wrapWithPrompt(body, composePrompt(state));
  // Ensure token count includes any instruction/prompt wrappers even when not strict
  const tokCount = tokens ?? (await countTokens(text));
  return { text, selected, tokens: tokCount };
}

// Estimate tokens for the current selection including wrapper/prompt overhead, without reading file bodies.
// Mirrors the approximation logic used in packFilesToBudget.
export async function estimateTokens(entries: FileEntry[], state: State): Promise<number> {
  const encoder = await ensureEncoder(state.model, state.encoding);
  const md = state.format === 'markdown';

  // Header is not currently used in TUI; keep for completeness
  const header = undefined as string | undefined;
  const approxHeaderTokens = header ? encoder.encode(header + '\n\n').length : 0;

  // Compose prompt and estimate top + bottom duplication like wrapWithPrompt/packFilesToBudget
  const prompt = composePrompt(state) ?? '';
  const preface = prompt
    ? (prompt.includes('<INSTRUCTIONS>') || prompt.includes('<PROMPT')
        ? prompt
        : `<INSTRUCTIONS>\n${prompt}\n</INSTRUCTIONS>`)
    : '';
  const instructionsOnlyMatch = /<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/i.exec(preface);
  const bottomBlock = instructionsOnlyMatch ? instructionsOnlyMatch[0] : preface;
  const approxPromptTokens = preface
    ? encoder.encode(preface).length + encoder.encode(bottomBlock).length + 2 // two blank lines
    : 0;

  let total = approxHeaderTokens + approxPromptTokens;

  for (const f of entries) {
    let approx = f.tokens;
    if (state.xmlWrap) {
      const lang = '';
      const wrapperOpen = `<file path="${f.relPath}" bytes="${f.bytes}" lines="${f.lines}" tokens="${f.tokens}" language="${lang}">\n<![CDATA[\n`;
      const wrapperClose = `\n]]>\n</file>\n\n`;
      approx += encoder.encode(wrapperOpen).length + encoder.encode(wrapperClose).length;
    } else if (state.tagsWrap) {
      const wrapperOpen = `<FILE path="${f.relPath}">\n`;
      const wrapperClose = `\n</FILE>\n\n`;
      approx += encoder.encode(wrapperOpen).length + encoder.encode(wrapperClose).length;
    } else if (md) {
      const fileHeading = `### ${f.relPath}\n\n`;
      const fences = `\n\n\n`; // approximate for opening/closing fences + newlines
      approx += encoder.encode(fileHeading).length + encoder.encode(fences).length + 12; // buffer
    } else {
      approx += 8;
    }
    total += approx;
  }

  return total;
}

export async function loadSavedPrompts(cwd: string, dirHint?: string): Promise<SavedPrompt[]> {
  const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || '';
  const globalDir = home ? path.join(home, '.cpai', 'prompts') : null;
  // Prefer project prompts first so they win on name conflicts
  const candidates = [
    dirHint ? path.resolve(cwd, dirHint) : null,
    path.join(cwd, '.cpai/prompts'),
    path.join(cwd, 'prompts'),
    globalDir
  ] as (string | null)[];
  const out: SavedPrompt[] = [];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const items = await fs.readdir(c, { withFileTypes: true });
      for (const d of items) {
        if (!d.isFile()) continue;
        const ext = path.extname(d.name).toLowerCase();
        if (!['.md', '.txt', '.prompt'].includes(ext)) continue;
        const p = path.join(c, d.name);
        const text = await fs.readFile(p, 'utf8');
        const origin: 'project' | 'global' = (globalDir && p.startsWith(globalDir)) ? 'global' : 'project';
        out.push({ name: path.basename(d.name, ext), path: p, text, origin });
      }
    } catch {}
  }
  const map = new Map<string, SavedPrompt>();
  for (const p of out) if (!map.has(p.name)) map.set(p.name, p);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
