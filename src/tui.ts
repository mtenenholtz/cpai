import blessed from "blessed";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs/promises";
import clipboard from "clipboardy";
import { scan, scanConcurrent } from "./lib/scan.js";
import { loadAicpConfig, DEFAULT_CONFIG } from "./lib/config.js";
import { ensureEncoder } from "./lib/tokenizer.js";
import { formatOutput, formatTags, formatXml, packFilesToBudget, wrapWithPrompt } from "./lib/format.js";
import type { CopyOptions, FileEntry, ScanOptions } from "./types.js";
import { humanBytes, toPosix } from "./lib/utils.js";

type State = {
  cwd: string;
  include: string[];
  exclude: string[];
  useGitignore: boolean;
  useAicpIgnore: boolean;
  hidden: boolean;
  maxBytesPerFile: number;
  model?: string;
  encoding?: string;
  // copy options
  maxTokens?: number;
  packOrder: "small-first" | "large-first" | "path";
  strict: boolean;
  format: "markdown" | "plain" | "json";
  xmlWrap: boolean;
  tagsWrap: boolean;
  promptText?: string;
  // computed
  files: FileEntry[];
  selectedIdx: number;
  manualExcluded: Set<string>; // relPath excluded manually in the UI
  // tree view state
  treeMode: boolean;
  treeExpanded: Set<string>; // posix dir paths expanded
  paneMode: "rank" | "details";
};

function makeDefaultState(cwd: string, fileCfg: any): State {
  return {
    cwd,
    include: fileCfg.include || DEFAULT_CONFIG.include,
    exclude: fileCfg.exclude || DEFAULT_CONFIG.exclude,
    useGitignore: fileCfg.useGitignore ?? DEFAULT_CONFIG.useGitignore,
    useAicpIgnore: fileCfg.useAicpIgnore ?? DEFAULT_CONFIG.useAicpIgnore,
    hidden: fileCfg.hidden ?? DEFAULT_CONFIG.hidden,
    maxBytesPerFile: fileCfg.maxBytesPerFile ?? DEFAULT_CONFIG.maxBytesPerFile,
    model: fileCfg.model ?? DEFAULT_CONFIG.model,
    encoding: fileCfg.encoding ?? DEFAULT_CONFIG.encoding,
    maxTokens: undefined,
    packOrder: "small-first",
    strict: true,
    format: "markdown",
    xmlWrap: false,
    tagsWrap: true,
    promptText: undefined,
    files: [],
    selectedIdx: 0,
    manualExcluded: new Set(),
    treeMode: true,
    treeExpanded: new Set<string>(["."]),
    paneMode: "rank"
  };
}

async function rescan(state: State, onProgress?: (done: number, total: number) => void, signal?: AbortSignal) {
  await ensureEncoder(state.model, state.encoding);
  const opts: ScanOptions = {
    cwd: state.cwd,
    include: state.include,
    exclude: state.exclude,
    useGitignore: state.useGitignore,
    useAicpIgnore: state.useAicpIgnore,
    hidden: state.hidden,
    maxBytesPerFile: state.maxBytesPerFile,
    model: state.model,
    encoding: state.encoding
  };
  const result = await scanConcurrent(opts, { concurrency: 16, onProgress, signal });
  const list = result.files.filter((f) => !f.skipped);
  state.files = list;
  if (state.selectedIdx >= list.length) state.selectedIdx = Math.max(0, list.length - 1);
}

function renderFileLine(f: FileEntry, excluded: boolean): string {
  const status = excluded ? chalk.gray("✖") : chalk.green("✔");
  const name = f.relPath.length > 60 ? f.relPath.slice(0, 57) + "…" : f.relPath;
  const tok = String(f.tokens).padStart(7);
  const bytes = humanBytes(f.bytes).padStart(8);
  return `${status}  ${name.padEnd(60)}  ${tok}  ${bytes}`;
}

// --- Tree building & rendering ---
type DirNode = { name: string; path: string; dirs: Map<string, DirNode>; files: FileEntry[] };

function buildDirTree(files: FileEntry[]): DirNode {
  const root: DirNode = { name: ".", path: ".", dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.relPath.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const last = i === parts.length - 1;
      if (last) {
        node.files.push(f);
      } else {
        const subPath = node.path === "." ? part : `${node.path}/${part}`;
        let next = node.dirs.get(part);
        if (!next) {
          next = { name: part, path: subPath, dirs: new Map(), files: [] };
          node.dirs.set(part, next);
        }
        node = next;
      }
    }
  }
  return root;
}

type VisibleNode =
  | { kind: "dir"; depth: number; node: DirNode; included: boolean; mixed: boolean; tokens: number }
  | { kind: "file"; depth: number; file: FileEntry; included: boolean };

function computeDirStats(node: DirNode, eligibleSet: Set<string>): { tokens: number; included: number; total: number } {
  let tokens = 0;
  let included = 0;
  let total = 0;
  for (const f of node.files) {
    total++;
    if (eligibleSet.has(f.relPath)) {
      included++;
      tokens += f.tokens;
    }
  }
  for (const child of node.dirs.values()) {
    const s = computeDirStats(child, eligibleSet);
    tokens += s.tokens;
    included += s.included;
    total += s.total;
  }
  return { tokens, included, total };
}

function makeVisibleTree(root: DirNode, expanded: Set<string>, eligibleSet: Set<string>): VisibleNode[] {
  const out: VisibleNode[] = [];
  function walk(n: DirNode, depth: number) {
    const stats = computeDirStats(n, eligibleSet);
    const mixed = stats.included > 0 && stats.included < stats.total;
    const included = stats.included === stats.total && stats.total > 0;
    out.push({ kind: "dir", depth, node: n, included, mixed, tokens: stats.tokens });
    if (!expanded.has(n.path)) return;
    // directories in alpha order, then files
    const dirNames = [...n.dirs.keys()].sort();
    for (const name of dirNames) walk(n.dirs.get(name)!, depth + 1);
    const files = [...n.files].sort((a, b) => a.relPath.localeCompare(b.relPath));
    for (const f of files) {
      const inc = eligibleSet.has(f.relPath);
      out.push({ kind: "file", depth: depth + 1, file: f, included: inc });
    }
  }
  walk(root, 0);
  return out;
}

function renderTreeLine(v: VisibleNode): string {
  const indent = "  ".repeat(Math.max(0, v.depth));
  if (v.kind === "dir") {
    const box = v.mixed ? chalk.yellow("◐") : v.included ? chalk.green("✔") : chalk.gray("✖");
    const icon = chalk.cyan("▸");
    const label = v.node.path === "." ? "." : v.node.name;
    const tok = String(v.tokens).padStart(7);
    return `${box}  ${indent}${label}/`.padEnd(64) + `  ${tok}`;
  } else {
    const box = v.included ? chalk.green("✔") : chalk.gray("✖");
    const name = v.file.relPath.split("/").pop()!;
    const pathPart = `${indent}${name}`;
    const tok = String(v.file.tokens).padStart(7);
    return `${box}  ${pathPart}`.padEnd(64) + `  ${tok}`;
  }
}

function buildEligible(state: State): FileEntry[] {
  const s = state.manualExcluded;
  return state.files.filter((f) => !s.has(f.relPath));
}

async function renderPackedText(entries: FileEntry[], state: State): Promise<{ text: string; selected: FileEntry[]; tokens: number }>{
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
    blockSeparator: "\n\n",
    xmlWrap: state.xmlWrap,
    tagsWrap: state.tagsWrap,
    promptText: state.promptText
  };
  const { selected, rendered, tokens } = await packFilesToBudget(entries, cfg);
  let body = rendered ?? (state.xmlWrap ? await formatXml(selected, cfg) : state.tagsWrap ? await formatTags(selected, cfg) : await formatOutput(selected, cfg));
  const text = wrapWithPrompt(body, state.promptText);
  const tokCount = tokens ?? selected.reduce((a, f) => a + f.tokens, 0);
  return { text, selected, tokens: tokCount };
}

export async function runTui(cwd: string) {
  const absCwd = path.resolve(process.cwd(), cwd || ".");
  const fileCfg = await loadAicpConfig(absCwd);
  const state = makeDefaultState(absCwd, fileCfg);
  await rescan(state);

  const screen = blessed.screen({ smartCSR: true, title: "aicp — TUI" });

  const help = "? Help  / Filter  Space Toggle  A All  N None  V Invert  i include  x exclude  g .gitignore  a .aicpignore  . Hidden  b Budget  p Prompt  o Write  c Copy  r Rescan  s Sort  m Format  e XML  t Tags  q Quit";

  const list = blessed.list({
    parent: screen,
    top: 1,
    left: 0,
    width: "65%",
    height: "80%",
    keys: true,
    vi: true,
    mouse: true,
    border: { type: "line" },
    label: " Files (✔ included / ✖ excluded) ",
    style: { selected: { inverse: true } }
  });

  const info = blessed.box({
    parent: screen,
    top: 1,
    left: "66%",
    width: "34%",
    height: "80%",
    border: { type: "line" },
    label: " Rankings ",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    scrollbar: { ch: " ", style: { inverse: true } }
  });

  const status = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    border: { type: "line" },
    content: help
  });

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: `${absCwd}`
  });

  // Cheatsheet overlay
  const cheatsheet = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "90%",
    height: "90%",
    keys: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    hidden: true,
    border: { type: "line" },
    label: " aicp — Help ",
    tags: true,
    scrollbar: { ch: " ", style: { inverse: true } },
    content: [
      "{bold}Navigation{/bold}: Up/Down, j/k, PgUp/PgDn, g/G",
      "{bold}Selection{/bold}: Space toggle, A all, N none, V invert",
      "{bold}Filter{/bold}: / filter prompt (coming soon)",
      "{bold}Rules{/bold}: i include globs, x exclude globs, g .gitignore, a .aicpignore, . hidden",
      "{bold}Packing{/bold}: b budget, s sort (small-first/large-first/path)",
      "{bold}Output{/bold}: m format (markdown/plain/json), e XML, t Tags, p prompt",
      "{bold}Actions{/bold}: c copy (clipboardy→OSC52), o write file",
      "{bold}App{/bold}: ?/F1 help, q/C-c quit",
      "",
      "Tip: statuses do not rely on color; ✔ included / ✖ excluded; details show INCLUDED/EXCLUDED."
    ].join("\n")
  });
  function toggleCheatsheet(show?: boolean) {
    const visible = show ?? cheatsheet.hidden;
    cheatsheet.hidden = !visible;
    if (visible) cheatsheet.focus();
    screen.render();
  }
  cheatsheet.key(["escape", "enter", "q", "?", "f1"], () => toggleCheatsheet(false));

  // Status helpers
  function setStatus(msgTop: string, msgBottom?: string) {
    status.setContent(msgBottom ? `${help}\n${msgTop}  ${msgBottom}` : `${help}\n${msgTop}`);
  }

  // Virtualized list viewport
  let viewTop = 0;
  function visibleCount(): number {
    const h = (list.height as number) || 20;
    return Math.max(3, h - 2);
  }
  function clampViewport() {
    const count = visibleCount();
    const maxTop = Math.max(0, state.files.length - count);
    if (viewTop > maxTop) viewTop = maxTop;
    if (state.selectedIdx < viewTop) viewTop = state.selectedIdx;
    if (state.selectedIdx >= viewTop + count) viewTop = Math.max(0, state.selectedIdx - count + 1);
  }
  function summaryLine(): string {
    const eligible = buildEligible(state);
    const totalTok = eligible.reduce((a, f) => a + f.tokens, 0);
    const fmt = state.xmlWrap ? "xml" : state.tagsWrap ? "tags" : state.format;
    return `eligible=${eligible.length}/${state.files.length}  tokens≈${totalTok}  max=${state.maxTokens ?? "∞"}  order=${state.packOrder}  format=${fmt}`;
  }
  function refreshList(full = true) {
    clampViewport();
    const eligible = buildEligible(state);
    if (full) {
      const count = visibleCount();
      let lines: string[] = [];
      if (state.treeMode) {
        const root = buildDirTree(state.files);
        const eligSet = new Set(eligible.map((f) => f.relPath));
        const vis = makeVisibleTree(root, state.treeExpanded, eligSet);
        // rebuild a global list of visible nodes and map selectedIdx to position
        // selectedIdx refers to index in vis list; clamp
        if (state.selectedIdx >= vis.length) state.selectedIdx = Math.max(0, vis.length - 1);
        const slice = vis.slice(viewTop, viewTop + count);
        lines = slice.map(renderTreeLine);
        (refreshList as any)._vis = vis; // stash for key handlers
      } else {
        const slice = state.files.slice(viewTop, viewTop + count);
        lines = slice.map((f) => renderFileLine(f, state.manualExcluded.has(f.relPath)));
      }
      list.setItems(lines);
    }
    const selInView = Math.max(0, state.selectedIdx - viewTop);
    list.select(selInView);
    setStatus(summaryLine());
    refreshRightPane();
    screen.render();
  }

  function refreshRightPane() {
    if (state.paneMode === "details") {
      const f = state.files[state.selectedIdx];
      if (!f) { info.setContent("(no files)"); return; }
      const excluded = state.manualExcluded.has(f.relPath);
      const lines = [chalk.bold(f.relPath), `bytes=${humanBytes(f.bytes)}  lines=${f.lines}  tokens=${f.tokens}  ${excluded ? "EXCLUDED" : "INCLUDED"}`];
      info.setContent(lines.join("\n"));
      info.setLabel(" Details ");
    } else {
      // Rankings: Top Files (eligible) and Top Folders (eligible, aggregated)
      const eligible = buildEligible(state);
      const topFiles = [...eligible].sort((a, b) => b.tokens - a.tokens).slice(0, 20);
      const byDir = new Map<string, number>();
      for (const f of eligible) {
        const d = path.posix.dirname(f.relPath);
        byDir.set(d, (byDir.get(d) ?? 0) + f.tokens);
      }
      const topDirs = [...byDir.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      const colW = Math.floor(((info.width as number) - 4) / 2);
      const pad = (s: string, w: number) => (s.length > w ? s.slice(0, w - 1) + "…" : s.padEnd(w));
      const lines: string[] = [];
      lines.push(chalk.bold(pad("Top Files", colW)) + "  " + chalk.bold(pad("Top Folders", colW)));
      const rows = Math.max(topFiles.length, topDirs.length);
      for (let i = 0; i < rows; i++) {
        const lf = topFiles[i];
        const rf = topDirs[i];
        const l = lf ? `${pad(lf.relPath, colW - 10)} ${String(lf.tokens).padStart(9)}` : "".padEnd(colW);
        const r = rf ? `${pad(rf[0], colW - 10)} ${String(rf[1]).padStart(9)}` : "".padEnd(colW);
        lines.push(l + "  " + r);
      }
      info.setLabel(" Rankings ");
      info.setContent(lines.join("\n"));
    }
  }

  async function promptInput(title: string, initial = ""): Promise<string | undefined> {
    return new Promise((resolve) => {
      const prompt = blessed.prompt({ parent: screen, border: "line", height: 7, width: "80%", top: "center", left: "center", label: ` ${title} ` });
      prompt.input(initial, "", (err: any, value: string) => {
        prompt.destroy();
        screen.render();
        resolve(err ? undefined : value);
      });
    });
  }

  // OSC52 fallback
  function osc52Copy(text: string): boolean {
    try {
      if (!process.stdout.isTTY) return false;
      const b64 = Buffer.from(text, "utf8").toString("base64");
      const seq = `\u001b]52;c;${b64}\u0007`;
      process.stdout.write(seq);
      return true;
    } catch {
      return false;
    }
  }

  async function doCopyToClipboard() {
    const eligible = buildEligible(state);
    const { text, selected, tokens } = await renderPackedText(eligible, state);
    try {
      await clipboard.write(text);
      setStatus(chalk.green(`Copied ${selected.length} files (≈${tokens} tokens) to clipboard.`));
    } catch (e: any) {
      const ok = osc52Copy(text);
      if (ok) setStatus(chalk.green(`Copied ${selected.length} files via OSC52.`));
      else setStatus(chalk.yellow(`Clipboard failed: ${e?.message ?? e}`));
    }
    screen.render();
  }

  async function doWriteToFile() {
    const dest = await promptInput("Write bundle to file", path.join(state.cwd, "aicp-bundle.txt"));
    if (!dest) return;
    const eligible = buildEligible(state);
    const { text, selected, tokens } = await renderPackedText(eligible, state);
    try {
      await fs.writeFile(dest, text, "utf8");
      setStatus(chalk.green(`Wrote ${selected.length} files (≈${tokens} tokens) to ${dest}`));
    } catch (e: any) {
      setStatus(chalk.yellow(`Write failed: ${e?.message ?? e}`));
    }
    screen.render();
  }

  // Keybindings
  screen.key(["q", "C-c"], () => screen.destroy());
  list.key(["up", "k"], () => {
    if (state.selectedIdx > 0) state.selectedIdx--;
    refreshList(false);
  });
  list.key(["down", "j"], () => {
    if (state.selectedIdx < state.files.length - 1) state.selectedIdx++;
    refreshList(false);
  });
  // Tree expand/collapse and toggling
  list.key(["left"], () => {
    if (!state.treeMode) return;
    const vis: VisibleNode[] = (refreshList as any)._vis || [];
    const node = vis[state.selectedIdx];
    if (node && node.kind === "dir" && state.treeExpanded.has(node.node.path) && node.node.path !== ".") {
      state.treeExpanded.delete(node.node.path);
      refreshList();
    }
  });
  list.key(["right"], () => {
    if (!state.treeMode) return;
    const vis: VisibleNode[] = (refreshList as any)._vis || [];
    const node = vis[state.selectedIdx];
    if (node && node.kind === "dir") {
      state.treeExpanded.add(node.node.path);
      refreshList();
    }
  });
  list.key(["pageup"], () => { state.selectedIdx = Math.max(0, state.selectedIdx - visibleCount()); refreshList(); });
  list.key(["pagedown"], () => { state.selectedIdx = Math.min(state.files.length - 1, state.selectedIdx + visibleCount()); refreshList(); });
  list.key(["g"], () => { state.selectedIdx = 0; refreshList(); });
  list.key(["G"], () => { state.selectedIdx = Math.max(0, state.files.length - 1); refreshList(); });
  list.key(["space"], () => {
    if (state.treeMode) {
      const vis: VisibleNode[] = (refreshList as any)._vis || [];
      const node = vis[state.selectedIdx];
      if (!node) return;
      if (node.kind === "file") {
        const f = node.file;
        if (state.manualExcluded.has(f.relPath)) state.manualExcluded.delete(f.relPath);
        else state.manualExcluded.add(f.relPath);
      } else {
        // toggle whole directory
        const dirPath = node.node.path === "." ? "" : node.node.path + "/";
        const makeExcluded = !(node.included && !node.mixed); // if not fully included, exclude -> include all; else exclude all
        for (const f of state.files) {
          if (dirPath === "" || f.relPath.startsWith(dirPath)) {
            if (makeExcluded) state.manualExcluded.delete(f.relPath);
            else state.manualExcluded.add(f.relPath);
          }
        }
      }
    } else {
      const f = state.files[state.selectedIdx];
      if (!f) return;
      if (state.manualExcluded.has(f.relPath)) state.manualExcluded.delete(f.relPath);
      else state.manualExcluded.add(f.relPath);
    }
    refreshList();
  });
  // Bulk selection
  screen.key(["A"], () => { state.manualExcluded.clear(); refreshList(); });
  screen.key(["N"], () => { state.manualExcluded = new Set(state.files.map((f) => f.relPath)); refreshList(); });
  screen.key(["V"], () => {
    const next = new Set<string>();
    for (const f of state.files) if (!state.manualExcluded.has(f.relPath)) next.add(f.relPath);
    state.manualExcluded = next; refreshList();
  });
  // Help overlay
  screen.key(["?", "f1"], () => toggleCheatsheet(true));
  screen.key(["i"], async () => {
    const s = await promptInput("Include globs (comma or space)", state.include.join(","));
    if (s != null) {
      state.include = s.split(/[\s,]+/).filter(Boolean);
      queueRescan();
    }
  });
  screen.key(["x"], async () => {
    const s = await promptInput("Exclude globs (comma or space)", state.exclude.join(","));
    if (s != null) {
      state.exclude = s.split(/[\s,]+/).filter(Boolean);
      queueRescan();
    }
  });
  screen.key(["g"], async () => { state.useGitignore = !state.useGitignore; queueRescan(); });
  screen.key(["a"], async () => { state.useAicpIgnore = !state.useAicpIgnore; queueRescan(); });
  screen.key(["."], async () => { state.hidden = !state.hidden; queueRescan(); });
  screen.key(["r"], async () => { queueRescan(); });
  screen.key(["b"], async () => {
    const s = await promptInput("Token budget (empty = unlimited)", state.maxTokens ? String(state.maxTokens) : "");
    if (s !== undefined) state.maxTokens = s.trim() ? Number(s) || undefined : undefined;
    refreshList();
  });
  screen.key(["p"], async () => {
    const s = await promptInput("Prompt text (top and bottom)", state.promptText ?? "");
    if (s !== undefined) state.promptText = s.trim() ? s : undefined;
    refreshList();
  });
  screen.key(["s"], async () => {
    const next = state.packOrder === "small-first" ? "large-first" : state.packOrder === "large-first" ? "path" : "small-first";
    state.packOrder = next; refreshList();
  });
  screen.key(["m"], async () => {
    const next = state.format === "markdown" ? "plain" : state.format === "plain" ? "json" : "markdown";
    state.format = next; refreshList();
  });
  screen.key(["e"], async () => { state.xmlWrap = !state.xmlWrap; refreshList(); });
  screen.key(["t"], async () => { state.tagsWrap = !state.tagsWrap; refreshList(); });
  screen.key(["T"], () => { state.treeMode = !state.treeMode; refreshList(); });
  screen.key(["R"], () => { state.paneMode = "rank"; refreshRightPane(); screen.render(); });
  screen.key(["D"], () => { state.paneMode = "details"; refreshRightPane(); screen.render(); });
  screen.key(["c"], async () => { await doCopyToClipboard(); });
  screen.key(["o"], async () => { await doWriteToFile(); });

  // Debounced/coalesced rescan machinery
  let rescanTimer: NodeJS.Timeout | null = null;
  let scanning = false;
  let pendingScan = false;
  let scanGen = 0;
  let abortCtrl: AbortController | null = null;
  async function runRescanNow() {
    if (scanning) { pendingScan = true; return; }
    scanning = true;
    const myGen = ++scanGen;
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    setStatus(chalk.cyan("Rescanning…"));
    try {
      let last = 0;
      await rescan(state, (d, t) => {
        const now = Date.now();
        if (now - last > 100) { setStatus(chalk.cyan(`Rescanning… ${d}/${t}`)); screen.render(); last = now; }
      }, abortCtrl.signal);
      if (myGen !== scanGen) return; // stale results ignored
    } catch (e: any) {
      setStatus(chalk.yellow(`Scan failed: ${e?.message ?? e}`));
    } finally {
      scanning = false;
    }
    refreshList();
    if (pendingScan) { pendingScan = false; setImmediate(runRescanNow); }
    else setStatus(summaryLine());
  }
  function queueRescan() {
    if (rescanTimer) clearTimeout(rescanTimer);
    setStatus(chalk.cyan("Rescan queued…"));
    rescanTimer = setTimeout(runRescanNow, 150);
  }

  refreshList();
  list.focus();
}
