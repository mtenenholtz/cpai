import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import binaryExtensions from "binary-extensions";
import { extnameLower, toPosix } from "./utils.js";
import { ensureEncoder } from "./tokenizer.js";
import type { FileEntry, ScanOptions, ScanResult } from "../types.js";
import os from "node:os";

const binarySet = new Set(binaryExtensions.map((e) => e.toLowerCase()));

function looksBinaryByExt(p: string) {
  const ext = extnameLower(p);
  return binarySet.has(ext);
}

async function readMaybeText(file: string, maxBytes: number): Promise<{ content?: string; bytes: number; reason?: string }> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return { bytes: 0, reason: "not-a-file" };
    if (stat.size > maxBytes) return { bytes: stat.size, reason: "too-large" };
    const buf = await fs.readFile(file);
    // Truncate to maxBytes (redundant, but safe)
    const slice = buf.subarray(0, maxBytes);
    // Heuristic: treat as text if UTF-8 decoding succeeds without too many control chars
    const content = slice.toString("utf8");
    return { content, bytes: stat.size };
  } catch (e: any) {
    return { bytes: 0, reason: e?.message ?? "read-error" };
  }
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const {
    cwd,
    include,
    exclude,
    useGitignore,
    useCpaiIgnore,
    hidden,
    maxBytesPerFile,
    model,
    encoding
  } = options;

  // .cpaiignore is handled below by re-running globby with extra ignores

  const patterns = include.length ? include : ["**/*"];
  const paths = await globby(patterns, {
    cwd,
    gitignore: useGitignore,
    ignore: exclude,
    dot: hidden,
    onlyFiles: true,
    followSymbolicLinks: false,
    // globby will auto-read .gitignore; we'll read .cpaiignore ourselves and append to exclude if present:
  });

  // If .cpaiignore exists, merge its lines into exclude (project + global)
  if (useCpaiIgnore) {
    const extra: string[] = [];
    try {
      const raw = await fs.readFile(path.join(cwd, ".cpaiignore"), "utf8");
      if (raw) {
        extra.push(...raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
      }
    } catch {}
    try {
      const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || "";
      if (home) {
        try {
          const rawG = await fs.readFile(path.join(home, ".cpai", ".cpaiignore"), "utf8");
          extra.push(...rawG.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
        } catch {}
      }
    } catch {}
    if (extra.length) {
      const paths2 = await globby(patterns, {
        cwd,
        gitignore: useGitignore,
        ignore: [...exclude, ...extra],
        dot: hidden,
        onlyFiles: true,
        followSymbolicLinks: false
      });
      paths.splice(0, paths.length, ...paths2);
    }
  }

  const enc = await ensureEncoder(model, encoding);

  const files: FileEntry[] = [];
  let totalTokens = 0;
  let totalBytes = 0;
  let totalLines = 0;

  const byDir = new Map<string, { tokens: number; bytes: number; files: number; lines: number }>();

  for (const rel of paths) {
    const relPosix = toPosix(rel);
    const abs = path.join(cwd, rel);
    const ext = extnameLower(relPosix);

    if (looksBinaryByExt(abs)) {
      files.push({
        absPath: abs,
        relPath: relPosix,
        bytes: 0,
        lines: 0,
        tokens: 0,
        ext,
        skipped: true,
        reason: "binary-ext"
      });
      continue;
    }

    const { content, bytes, reason } = await readMaybeText(abs, maxBytesPerFile);
    if (!content) {
      files.push({
        absPath: abs,
        relPath: relPosix,
        bytes,
        lines: 0,
        tokens: 0,
        ext,
        skipped: true,
        reason
      });
      continue;
    }

    const lines = content.split(/\r?\n/).length;
    const tokens = enc.encode(content).length;

    files.push({
      absPath: abs,
      relPath: relPosix,
      bytes,
      lines,
      tokens,
      ext
    });

    totalTokens += tokens;
    totalBytes += bytes;
    totalLines += lines;

    const dir = toPosix(path.posix.dirname(relPosix));
    const agg = byDir.get(dir) ?? { tokens: 0, bytes: 0, files: 0, lines: 0 };
    agg.tokens += tokens;
    agg.bytes += bytes;
    agg.files += 1;
    agg.lines += lines;
    byDir.set(dir, agg);
  }

  return { files, totalTokens, totalBytes, totalLines, byDir };
}

// --- Concurrent scan with progress/cancellation (non-breaking additive API) ---
export async function scanConcurrent(
  options: ScanOptions,
  extra?: { concurrency?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal }
): Promise<ScanResult> {
  const {
    cwd,
    include,
    exclude,
    useGitignore,
    useCpaiIgnore,
    hidden,
    maxBytesPerFile,
    model,
    encoding
  } = options;

  const concurrency = Math.max(1, Math.min(64, extra?.concurrency ?? 16));
  const onProgress = extra?.onProgress;
  const signal = extra?.signal;

  const patterns = include.length ? include : ["**/*"];
  let paths = await globby(patterns, {
    cwd,
    gitignore: useGitignore,
    ignore: exclude,
    dot: hidden,
    onlyFiles: true,
    followSymbolicLinks: false
  });

  if (useCpaiIgnore) {
    const extraEx: string[] = [];
    try {
      const raw = await fs.readFile(path.join(cwd, ".cpaiignore"), "utf8");
      if (raw) extraEx.push(...raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
    } catch {}
    try {
      const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || "";
      if (home) {
        try {
          const rawG = await fs.readFile(path.join(home, ".cpai", ".cpaiignore"), "utf8");
          if (rawG) extraEx.push(...rawG.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
        } catch {}
      }
    } catch {}
    if (extraEx.length) {
      paths = await globby(patterns, {
        cwd,
        gitignore: useGitignore,
        ignore: [...exclude, ...extraEx],
        dot: hidden,
        onlyFiles: true,
        followSymbolicLinks: false
      });
    }
  }

  const total = paths.length;
  onProgress?.(0, total);

  const enc = await ensureEncoder(model, encoding);

  const results: FileEntry[] = new Array(total);
  let done = 0;
  let index = 0;

  async function processOne(i: number, rel: string) {
    if (signal?.aborted) return;
    const relPosix = toPosix(rel);
    const abs = path.join(cwd, rel);
    const ext = extnameLower(relPosix);

    if (binarySet.has(ext)) {
      results[i] = {
        absPath: abs,
        relPath: relPosix,
        bytes: 0,
        lines: 0,
        tokens: 0,
        ext,
        skipped: true,
        reason: "binary-ext"
      };
    } else {
      const { content, bytes, reason } = await readMaybeText(abs, maxBytesPerFile);
      if (!content) {
        results[i] = {
          absPath: abs,
          relPath: relPosix,
          bytes,
          lines: 0,
          tokens: 0,
          ext,
          skipped: true,
          reason
        };
      } else {
        const lines = content.split(/\r?\n/).length;
        const tokens = enc.encode(content).length;
        results[i] = { absPath: abs, relPath: relPosix, bytes, lines, tokens, ext };
      }
    }
    done++;
    onProgress?.(done, total);
  }

  async function worker() {
    while (true) {
      if (signal?.aborted) return;
      const i = index++;
      if (i >= total) return;
      const rel = paths[i];
      await processOne(i, rel);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // Aggregate
  let totalTokens = 0;
  let totalBytes = 0;
  let totalLines = 0;
  const byDir = new Map<string, { tokens: number; bytes: number; files: number; lines: number }>();
  for (const f of results) {
    if (!f) continue;
    if (!f.skipped) {
      totalTokens += f.tokens;
      totalBytes += f.bytes;
      totalLines += f.lines;
      const dir = toPosix(path.posix.dirname(f.relPath));
      const agg = byDir.get(dir) ?? { tokens: 0, bytes: 0, files: 0, lines: 0 };
      agg.tokens += f.tokens;
      agg.bytes += f.bytes;
      agg.files += 1;
      agg.lines += f.lines;
      byDir.set(dir, agg);
    }
  }
  return { files: results, totalTokens, totalBytes, totalLines, byDir };
}
