import path from 'node:path';
import fs from 'node:fs/promises';
import { globby } from 'globby';
import type { CopyOptions, FileEntry, ScanOptions } from '../../types.js';
import { ensureEncoder } from '../../lib/tokenizer.js';
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
    // Always list everything; we'll apply .aicpignore as auto-deselect, not hide
    useAicpIgnore: false,
    hidden: state.hidden,
    maxBytesPerFile: state.maxBytesPerFile,
    model: state.model,
    encoding: state.encoding,
  };
  const result = await scanConcurrent(opts, { concurrency: 16, onProgress, signal });
  const list = result.files.filter((f) => !f.skipped);
  state.files = list;
  if (state.selectedIdx >= list.length) state.selectedIdx = Math.max(0, list.length - 1);

  // Compute autoDeselected from .aicpignore (visible but off by default)
  const auto = new Set<string>();
  if (state.useAicpIgnore) {
    try {
      const raw = await fs.readFile(path.join(state.cwd, '.aicpignore'), 'utf8');
      const extra = raw
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
          ignore: [...state.exclude, ...extra],
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
  const sections: string[] = [];
  if (picks.length) {
    const block = picks.map((p) => `### ${p.name}\n${p.text.trim()}`).join('\n\n');
    sections.push(block);
  }
  if (state.promptText && state.promptText.trim()) sections.push(state.promptText.trim());
  const final = sections.join('\n\n---\n\n');
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
    useAicpIgnore: state.useAicpIgnore,
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
    blockSeparator: '\n\n',
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
  const tokCount = tokens ?? selected.reduce((a, f) => a + f.tokens, 0);
  return { text, selected, tokens: tokCount };
}

export async function loadSavedPrompts(cwd: string, dirHint?: string): Promise<SavedPrompt[]> {
  const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || '';
  const globalDir = home ? path.join(home, '.aicp', 'prompts') : null;
  // Prefer project prompts first so they win on name conflicts
  const candidates = [
    dirHint ? path.resolve(cwd, dirHint) : null,
    path.join(cwd, '.aicp/prompts'),
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
        const origin: 'project' | 'global' = globalDir && p.startsWith(globalDir) ? 'global' : 'project';
        out.push({ name: path.basename(d.name, ext), path: p, text, origin });
      }
    } catch {}
  }
  const map = new Map<string, SavedPrompt>();
  for (const p of out) if (!map.has(p.name)) map.set(p.name, p);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
