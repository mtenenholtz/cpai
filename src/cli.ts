#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import clipboard from "clipboardy";
import path from "node:path";
import fs from "node:fs/promises";
import { loadAicpConfig, writeDefaultAicpConfig, writeDefaultGlobalAicpConfig, DEFAULT_CONFIG } from "./lib/config.js";
import { scan } from "./lib/scan.js";
import { ensureEncoder } from "./lib/tokenizer.js";
import { formatOutput, packFilesToBudget, renderJson, formatXml, formatTags, wrapWithPrompt } from "./lib/format.js";
import { extnameLower, humanBytes, sortBy, toPosix, padPlain } from "./lib/utils.js";
import type { CopyOptions, ScanOptions } from "./types.js";
import { getTuiAdapter } from "./ui/adapter.js";
import os from "node:os";

const program = new Command();
// Friendlier error UX
program.showHelpAfterError();
program.configureOutput({
  outputError: (str, write) => write(chalk.red(str))
});

function osc52Copy(text: string): boolean {
  try {
    // Only emit OSC52 when stdout is a TTY to avoid corrupting piped output
    if (!process.stdout.isTTY) return false;
    const b64 = Buffer.from(text, "utf8").toString("base64");
    const seq = `\u001b]52;c;${b64}\u0007`;
    process.stdout.write(seq);
    return true;
  } catch {
    return false;
  }
}

function mergeConfigWithCli<T extends object>(base: any, cli: any): T {
  const out = { ...base, ...cli };
  // normalize list-like options passed as comma-separated
  const normList = (v: any) =>
    Array.isArray(v) ? v.flatMap((x) => String(x).split(",").map((s) => s.trim()).filter(Boolean)) : v;
  if (out.include) out.include = normList(out.include);
  if (out.exclude) out.exclude = normList(out.exclude);
  return out;
}

function printScanTable(rows: { path: string; bytes: number; lines: number; tokens: number; skipped?: boolean; reason?: string }[]) {
  const headers = ["Path", "Bytes", "Lines", "Tokens", "Status"];
  const colW = [48, 10, 8, 10, 10];

  const headerRaw = headers.map((h, i) => padPlain(h, colW[i])).join("  ");
  const headerColored = headers.map((h, i) => chalk.bold(padPlain(h, colW[i]))).join("  ");
  console.log(headerColored);
  console.log("-".repeat(headerRaw.length));

  for (const r of rows) {
    const statusText = r.skipped ? (r.reason ?? "skipped") : "ok";
    const statusPadded = padPlain(statusText, colW[4]);
    const trailingSpaces = /\s+$/.exec(statusPadded)?.[0] ?? "";
    const statusCore = statusPadded.slice(0, statusPadded.length - trailingSpaces.length);
    const statusColored = (r.skipped ? chalk.yellow(statusCore) : chalk.green(statusCore)) + trailingSpaces;

    const line = [
      padPlain(r.path, colW[0]),
      padPlain(humanBytes(r.bytes), colW[1]),
      padPlain(String(r.lines), colW[2]),
      padPlain(String(r.tokens), colW[3]),
      statusColored
    ].join("  ");
    console.log(line);
  }
}

program
  .name("cpai")
  .description("Bulk copy code/files to paste into an LLM, with token inspection & include/exclude.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a .cpairc.json with sensible defaults")
  .option("-C, --cwd <dir>", "working directory", ".")
  .option("--global", "write to ~/.cpai/config.json instead of local .cpairc.json", false)
  .action(async (opts) => {
    if (opts.global) {
      const p = await writeDefaultGlobalAicpConfig();
      console.log(chalk.green(`Created ${p}`));
    } else {
      const cwd = path.resolve(process.cwd(), opts.cwd);
      const p = await writeDefaultAicpConfig(cwd);
      console.log(chalk.green(`Created ${p}`));
    }
  });

program
  .command("scan [dir]")
  .description("Scan a folder and show per-file token usage")
  .option("-C, --cwd <dir>", "working directory (defaults to dir)", "")
  .option("--include <globs...>", "include globs (comma or space separated)", "")
  .option("--exclude <globs...>", "exclude globs (comma or space separated)", "")
  .option("--no-gitignore", "do not respect .gitignore")
  .option("--no-cpaiignore", "do not respect .cpaiignore")
  .option("--hidden", "include dotfiles", false)
  .option("--max-bytes-per-file <n>", "skip files larger than this", String(DEFAULT_CONFIG.maxBytesPerFile))
  .option("--model <name>", "model name for encoding heuristic", DEFAULT_CONFIG.model)
  .option("--encoding <name>", "explicit tiktoken encoding (overrides model)", DEFAULT_CONFIG.encoding)
  .option("--by-dir", "print a directory-level summary", false)
  .option("--json", "output JSON instead of a table", false)
  .action(async (dirArg, opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd || dirArg || ".");
    const fileCfg = await loadAicpConfig(cwd);

    const cfg = mergeConfigWithCli<ScanOptions>(
      {
        cwd,
        include: opts.include || fileCfg.include || DEFAULT_CONFIG.include,
        exclude: opts.exclude || fileCfg.exclude || DEFAULT_CONFIG.exclude,
        useGitignore: opts.gitignore !== false && (fileCfg.useGitignore ?? DEFAULT_CONFIG.useGitignore),
        useCpaiIgnore:
          (opts.cpaiignore !== false) &&
          ((fileCfg.useCpaiIgnore ?? DEFAULT_CONFIG.useCpaiIgnore)),
        hidden: opts.hidden ?? (fileCfg.hidden ?? DEFAULT_CONFIG.hidden),
        maxBytesPerFile: Number(opts["maxBytesPerFile"] ?? fileCfg.maxBytesPerFile ?? DEFAULT_CONFIG.maxBytesPerFile),
        model: opts.model || fileCfg.model || DEFAULT_CONFIG.model,
        encoding: opts.encoding || fileCfg.encoding || DEFAULT_CONFIG.encoding
      },
      {}
    );

    await ensureEncoder(cfg.model, cfg.encoding);
    const result = await scan(cfg);

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            totalTokens: result.totalTokens,
            totalBytes: result.totalBytes,
            totalLines: result.totalLines,
            files: result.files.map((f) => ({
              path: f.relPath,
              bytes: f.bytes,
              lines: f.lines,
              tokens: f.tokens,
              skipped: !!f.skipped,
              reason: f.reason
            })),
            byDir: Object.fromEntries(result.byDir)
          },
          null,
          2
        )
      );
      return;
    }

    const rows = result.files.map((f) => ({
      path: f.relPath,
      bytes: f.bytes,
      lines: f.lines,
      tokens: f.tokens,
      skipped: f.skipped,
      reason: f.reason
    }));

    printScanTable(rows);
    console.log(
      "\n" +
        chalk.bold("TOTAL") +
        `  files=${rows.length}  tokens=${chalk.cyan(result.totalTokens)}  lines=${result.totalLines}  bytes=${humanBytes(
          result.totalBytes
        )}`
    );

    if (opts.byDir) {
      // Top directories by tokens (first 10)
      const byDir = [...result.byDir.entries()]
        .sort((a, b) => b[1].tokens - a[1].tokens)
        .slice(0, 10);
      if (byDir.length) {
        console.log("\n" + chalk.bold("Top directories by tokens:"));
        for (const [d, agg] of byDir) {
          console.log(`  ${toPosix(d).padEnd(40)}  ${String(agg.tokens).padStart(8)} tokens  (${agg.files} files)`);
        }
      }
    }
  });

program
  .command("copy [dir]")
  .description("Compose a bundle and copy to clipboard (default); optionally write to stdout or a file, with token packing")
  .option("-C, --cwd <dir>", "working directory (defaults to dir)", "")
  .option("--include <globs...>", "include globs", "")
  .option("--exclude <globs...>", "exclude globs", "")
  .option("--no-gitignore", "do not respect .gitignore")
  .option("--no-cpaiignore", "do not respect .cpaiignore")
  .option("--hidden", "include dotfiles", false)
  .option("--max-bytes-per-file <n>", "skip files larger than this", String(DEFAULT_CONFIG.maxBytesPerFile))
  .option("--model <name>", "model name for encoding heuristic", DEFAULT_CONFIG.model)
  .option("--encoding <name>", "explicit tiktoken encoding", DEFAULT_CONFIG.encoding)
  .option("-f, --format <fmt>", "markdown | json", DEFAULT_CONFIG.format)
  .option("-o, --out <file>", "write to a file")
  .option("--stdout", "write to stdout (in addition to clipboard unless --no-clip)", false)
  .option("--no-clip", "do not copy to clipboard")
  .option("--by-dir", "print a directory-level summary to stderr", false)
  .option("--max-tokens <n>", "token budget; pack files to fit", "")
  .option("--pack-order <order>", "small-first | large-first | path", "small-first")
  .option("--strict", "enforce the max-tokens after rendering", true)
  .option("--no-code-fences", "omit ``` fences in markdown", false)
  .option("--header <text>", "prepend a header")
  .option("--no-tags", "Do not wrap each file with <FILE_n> separators (default on)")
  .option("-P, --profile <name>", "use a named profile from .cpairc.json", "")
  .option("-i, --instructions <text>", "additional instruction text added to top and bottom")
  .option("--instructions-file <path>", "read the instructions text from a file")
  .action(async (dirArg, opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd || dirArg || ".");
    const fileCfg = await loadAicpConfig(cwd);

    // Load profile if provided
    const profileName: string | undefined = opts.profile || undefined;
    const profile = profileName && fileCfg.profiles ? fileCfg.profiles[profileName] : undefined;

    async function readInstructionsText(): Promise<string | undefined> {
      // Read only current flags and config keys (no legacy support)
      const cliText: string | undefined = opts.instructions || undefined;
      const cliFile: string | undefined = opts.instructionsFile || undefined;
      const profText: string | undefined = ((profile as any)?.instructions as string | undefined) || undefined;
      const profFile: string | undefined = ((profile as any)?.instructionsFile as string | undefined) || undefined;
      const cfgText: string | undefined = ((fileCfg as any)?.instructions as string | undefined) || undefined;
      const cfgFile: string | undefined = ((fileCfg as any)?.instructionsFile as string | undefined) || undefined;

      const pickFile = cliFile || profFile || cfgFile;
      let instructions: string | undefined = undefined;
      if (pickFile) {
        try {
          const p = path.isAbsolute(pickFile) ? pickFile : path.join(cwd, pickFile);
          instructions = await fs.readFile(p, "utf8");
        } catch (e) {}
      }
      if (!instructions) {
        const pickText = cliText || profText || cfgText;
        instructions = pickText ? String(pickText) : undefined;
      }

      // Compose with saved prompts selected via config/profile
      const selectedNames: string[] | undefined = (profile?.selectedPrompts as string[] | undefined) ?? (fileCfg.selectedPrompts as string[] | undefined);
      if (!selectedNames || selectedNames.length === 0) return instructions;

      // Load saved prompts from project and global locations, preferring project names
      const saved = await (async () => {
        const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || '';
        const globalDirNew = home ? path.join(home, '.cpai', 'prompts') : null;
        const candidates = [
          path.join(cwd, '.cpai/prompts'),
          path.join(cwd, 'prompts'),
          globalDirNew,
          
        ].filter(Boolean) as string[];
        const out: { name: string; text: string }[] = [];
        for (const c of candidates) {
          try {
            const items = await fs.readdir(c, { withFileTypes: true });
            for (const d of items) {
              if (!d.isFile()) continue;
              const ext = path.extname(d.name).toLowerCase();
              if (!['.md', '.txt', '.prompt'].includes(ext)) continue;
              const nm = path.basename(d.name, ext);
              const p = path.join(c, d.name);
              const text = await fs.readFile(p, 'utf8');
              out.push({ name: nm, text });
            }
          } catch {}
        }
        const map = new Map<string, { name: string; text: string }>();
        for (const p of out) if (!map.has(p.name)) map.set(p.name, p);
        return map;
      })();

      const parts: string[] = [];
      if (instructions && instructions.trim()) parts.push(`<INSTRUCTIONS>\n${instructions.trim()}\n</INSTRUCTIONS>`);
      for (const name of selectedNames) {
        const sp = saved.get(name);
        if (!sp) continue;
        const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        parts.push(`<PROMPT name="${esc(sp.name)}">\n${sp.text.trim()}\n</PROMPT>`);
      }
      const final = parts.join('\n\n');
      return final || instructions;
    }

    const promptText = await readInstructionsText();

    // Normalize include/exclude similarly to scan via mergeConfigWithCli
    const baseCfg: CopyOptions = {
      cwd,
      include: opts.include || profile?.include || fileCfg.include || DEFAULT_CONFIG.include,
      exclude: opts.exclude || profile?.exclude || fileCfg.exclude || DEFAULT_CONFIG.exclude,
      useGitignore: opts.gitignore !== false && ((profile?.useGitignore ?? fileCfg.useGitignore) ?? DEFAULT_CONFIG.useGitignore),
      useCpaiIgnore:
        (opts.cpaiignore !== false) &&
        (((profile as any)?.useCpaiIgnore ?? fileCfg.useCpaiIgnore) ?? DEFAULT_CONFIG.useCpaiIgnore),
      hidden: opts.hidden ?? ((profile?.hidden ?? fileCfg.hidden) ?? DEFAULT_CONFIG.hidden),
      maxBytesPerFile: Number(
        opts["maxBytesPerFile"] ?? (profile?.maxBytesPerFile ?? fileCfg.maxBytesPerFile) ?? DEFAULT_CONFIG.maxBytesPerFile
      ),
      model: opts.model || profile?.model || fileCfg.model || DEFAULT_CONFIG.model,
      encoding: opts.encoding || profile?.encoding || fileCfg.encoding || DEFAULT_CONFIG.encoding,
      format: (opts.format || profile?.format || fileCfg.format || DEFAULT_CONFIG.format) as any,
      outFile: opts.out || undefined,
      // Default: copy to clipboard unless explicitly disabled with --no-clip
      toClipboard: opts.clip !== false,
      byDir: !!opts.byDir,
      maxTokens: opts.maxTokens ? Number(opts.maxTokens) : undefined,
      packOrder: (opts.packOrder || (profile?.packOrder ?? "small-first")) as any,
      strict: opts.strict !== undefined ? !!opts.strict : (profile?.strict ?? true),
      codeFences: opts.codeFences !== false,
      header: opts.header || undefined,
      // XML wrapping is no longer controllable via CLI flag; profiles may still enable it
      xmlWrap: !!profile?.xmlWrap,
      tagsWrap: opts.tags !== false && (profile?.tagsWrap ?? true),
      promptText: promptText
    };
    const cfg = mergeConfigWithCli<CopyOptions>(baseCfg, {});

    await ensureEncoder(cfg.model, cfg.encoding);

    const result = await scan(cfg);
    const eligible = result.files.filter((f) => !f.skipped);

    // Render output (JSON bypasses packing/rendering; others use packing/formatting)
    let text: string;
    let selected = eligible;
    let tokens: number | undefined = undefined;
    if (cfg.format === "json") {
      text = renderJson(eligible);
    } else {
      const packed = await packFilesToBudget(eligible, cfg);
      selected = packed.selected;
      tokens = packed.tokens;
      if (packed.rendered !== undefined) {
        text = packed.rendered;
      } else {
        const body = cfg.xmlWrap
          ? await formatXml(selected, cfg)
          : cfg.tagsWrap
          ? await formatTags(selected, cfg)
          : await formatOutput(selected, cfg);
        text = wrapWithPrompt(body, cfg.promptText);
      }
    }

    // Write to file if requested
    if (cfg.outFile) {
      await fs.writeFile(cfg.outFile, text, "utf8");
      console.error(chalk.green(`Wrote ${cfg.outFile}`));
    }
    // Write to stdout only if explicitly requested
    if (opts.stdout) {
      process.stdout.write(text);
      if (!text.endsWith("\n")) process.stdout.write("\n");
    }

    // Clipboard (default unless --no-clip)
    if (cfg.toClipboard) {
      try {
        await clipboard.write(text);
        console.error(chalk.green("Copied to clipboard."));
      } catch (e: any) {
        // Try OSC52 fallback
        const ok = osc52Copy(text);
        if (ok) console.error(chalk.green("Copied to clipboard via OSC52."));
        else console.error(chalk.yellow(`Clipboard copy failed: ${e?.message ?? e}`));
      }
    }

    // Summary to stderr
    const totalTokens = tokens ?? selected.reduce((acc, f) => acc + f.tokens, 0);
    console.error(
      chalk.gray(
        `\nselected=${selected.length}/${eligible.length}  tokens≈${totalTokens}  lines=${selected.reduce(
          (a, f) => a + f.lines,
          0
        )}  bytes=${selected.reduce((a, f) => a + f.bytes, 0)}`
      )
    );

    if (cfg.byDir) {
      const byDir = [...result.byDir.entries()].sort((a, b) => b[1].tokens - a[1].tokens);
      console.error(chalk.bold("\nDirectory breakdown:"));
      for (const [d, agg] of byDir.slice(0, 20)) {
        console.error(`  ${d.padEnd(36)}  ${String(agg.tokens).padStart(8)} tokens  (${agg.files} files)`);
      }
    }
  });

program
  .command("tui [dir]")
  .description("Interactive TUI to browse, filter, and bundle files")
  .option("-C, --cwd <dir>", "working directory (defaults to dir)", "")
  .option("-i, --instructions <text>", "prefill ad-hoc instructions", "")
  .option("--instructions-file <path>", "prefill instructions from a file")
  .option(
    "--prompts-dir <dir>",
    "directory of saved prompts to pick (default: ./prompts or ./.cpai/prompts)"
  )
  .option("--pick-prompts", "open saved prompts picker on launch", false)
  .option("--mouse", "enable mouse hover/selection in the TUI (overrides config)")
  .action(async (dirArg, opts) => {
    const cwd = path.resolve(process.cwd(), opts.cwd || dirArg || ".");
    let promptText: string | undefined = undefined;
    const fileOpt: string | undefined = opts.instructionsFile || undefined;
    const textOpt: string | undefined = opts.instructions || undefined;
    if (fileOpt) {
      try {
        const p = path.isAbsolute(fileOpt) ? fileOpt : path.join(cwd, fileOpt);
        promptText = await fs.readFile(p, "utf8");
      } catch (e: any) {
        console.error(chalk.yellow(`Failed to read instructions file: ${e?.message ?? e}`));
      }
    }
    if (textOpt) {
      promptText = String(textOpt);
    }
    try {
      const adapter = await getTuiAdapter();
      let mouseFlag: boolean | undefined = undefined;
      if (typeof opts.mouse === 'boolean') mouseFlag = !!opts.mouse;
      else {
        try {
          const cfg = await loadAicpConfig(cwd);
          mouseFlag = cfg.mouse ?? false;
        } catch { mouseFlag = false; }
      }
      await adapter.run({
        cwd,
        promptText,
        promptsDir: opts.promptsDir ? String(opts.promptsDir) : undefined,
        openPromptPicker: !!opts.pickPrompts,
        mouse: mouseFlag
      });
    } catch (e: any) {
      console.error(chalk.red(e?.message ?? e));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
