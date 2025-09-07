import blessed from "blessed";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs/promises";
import clipboard from "clipboardy";
import { loadAicpConfig } from "./lib/config.js";
import type { FileEntry } from "./types.js";
import { humanBytes, toPosix } from "./lib/utils.js";
import { makeDefaultState, type State, type SavedPrompt } from "./ui/core/state.js";
import { rescan, loadSavedPrompts, renderPackedText } from "./ui/core/actions.js";
import { buildDirTree, computeDirStats, makeVisibleTree, metricOfDir, metricOfFile, type VisibleNode } from "./ui/core/tree.js";
import { buildEligible } from "./ui/core/selectors.js";

function renderFileLine(f: FileEntry, excluded: boolean): string {
  const status = excluded ? chalk.gray("✖") : chalk.green("✔");
  const name = f.relPath.length > 60 ? f.relPath.slice(0, 57) + "…" : f.relPath;
  const tok = String(f.tokens).padStart(7);
  const bytes = humanBytes(f.bytes).padStart(8);
  return `${status}  ${name.padEnd(60)}  ${tok}  ${bytes}`;
}

function renderTreeLine(v: VisibleNode, metric: State["treeMetric"]): string {
  const indent = "  ".repeat(Math.max(0, v.depth));
  if (v.kind === "dir") {
    const box = v.mixed ? chalk.yellow("◐") : v.included ? chalk.green("✔") : chalk.gray("✖");
    const label = v.node.name; // root name comes from buildDirTree
    const val = metricOfDir(v, metric);
    const num = String(val).padStart(9);
    return `${box}  ${indent}${label}/`.padEnd(64) + `  ${num}`;
  } else {
    const box = v.included ? chalk.green("✔") : chalk.gray("✖");
    const name = v.file.relPath.split("/").pop()!;
    const pathPart = `${indent}${name}`;
    const val = metricOfFile(v.file, metric);
    const num = String(val).padStart(9);
    return `${box}  ${pathPart}`.padEnd(64) + `  ${num}`;
  }
}

export async function runTui(cwd: string, initial?: { promptText?: string; promptsDir?: string; openPromptPicker?: boolean; mouse?: boolean }) {
  const absCwd = path.resolve(process.cwd(), cwd || ".");
  const fileCfg = await loadAicpConfig(absCwd);
  const state = makeDefaultState(absCwd, fileCfg);
  state.availablePrompts = await loadSavedPrompts(absCwd, initial?.promptsDir);
  state.promptText = initial?.promptText ?? state.promptText;
  await rescan(state);

  const screen = blessed.screen({ smartCSR: true, title: "aicp — TUI" });

  // Graceful shutdown helper (handles Ctrl+C anywhere)
  let exiting = false;
  function gracefulExit(code = 0) {
    if (exiting) return;
    exiting = true;
    try { screen.destroy(); } catch {}
    // ensure stdout ends with newline to avoid broken prompt
    try { if (process.stdout.write) process.stdout.write("\n"); } catch {}
    process.exit(code);
  }
  process.on('SIGINT', () => gracefulExit(0));

  const help = "? Help  3 Prompts  / Filter  Space Toggle  A All  N None  V Invert  i include  x exclude  g .gitignore  a .aicpignore  . Hidden  b Budget  p EditPrompt  P Prompts  h/l Fold/Unfold  H clear mutes  d Toggle Details  w Swap Focus  L Layout  F2 Metric  o Write  c Copy  Ctrl‑R Rescan  s Sort  m Format  e XML  t Tags  q Quit";

  const tabs = blessed.listbar({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    mouse: true,
    keys: true,
    autoCommandKeys: true,
    commands: {
      "Tree": () => { state.treeMode = true; refreshList(true); list.focus(); },
      "Flat": () => { state.treeMode = false; refreshList(true); list.focus(); },
      "Details": () => { toggleRankDetails(); },
      "Prompts": async () => { await showPromptPicker(); }
    }
  } as any);

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

  // Interactive lists inside Rankings pane
  const rankFilesList = blessed.list({
    parent: info,
    top: 0,
    left: 0,
    width: "50%",
    height: "100%-2",
    keys: true,
    vi: true,
    mouse: true,
    style: { selected: { inverse: true } },
    hidden: true
  });
  const rankDirsList = blessed.list({
    parent: info,
    top: 0,
    left: "50%",
    width: "50%",
    height: "100%-2",
    keys: true,
    vi: true,
    mouse: true,
    style: { selected: { inverse: true } },
    hidden: true
  });

  // Rank list interactions
  function toggleFileInclusionByPath(rel: string) {
    if (state.manualExcluded.has(rel)) state.manualExcluded.delete(rel);
    else state.manualExcluded.add(rel);
  }
  function toggleDirInclusion(dir: string) {
    const prefix = dir === "." ? "" : dir.endsWith("/") ? dir : dir + "/";
    let allIncluded = true;
    for (const f of state.files) {
      if (prefix === "" || f.relPath.startsWith(prefix)) {
        if (state.manualExcluded.has(f.relPath)) { allIncluded = false; break; }
      }
    }
    for (const f of state.files) {
      if (prefix === "" || f.relPath.startsWith(prefix)) {
        if (allIncluded) state.manualExcluded.add(f.relPath); else state.manualExcluded.delete(f.relPath);
      }
    }
  }

  rankFilesList.key(["space", "enter", "x"], () => {
    if (state.paneMode !== "rank") return;
    const idx = (rankFilesList as any).selected ?? 0;
    const f = rankCacheFiles[idx];
    if (!f) return;
    toggleFileInclusionByPath(f.relPath);
    refreshList();
    refreshRightPane();
  });
  rankDirsList.key(["space", "enter", "x"], () => {
    if (state.paneMode !== "rank") return;
    const idx = (rankDirsList as any).selected ?? 0;
    const d = rankCacheDirs[idx]?.[0];
    if (d === undefined) return;
    toggleDirInclusion(d);
    refreshList();
    refreshRightPane();
  });
  // mute from rank lists
  rankFilesList.key(["h"], () => {
    const idx = (rankFilesList as any).selected ?? 0;
    const f = rankCacheFiles[idx];
    if (!f) return;
    if (state.rankMutedFiles.has(f.relPath)) state.rankMutedFiles.delete(f.relPath); else state.rankMutedFiles.add(f.relPath);
    refreshRightPane(); screen.render();
  });
  rankDirsList.key(["h"], () => {
    const idx = (rankDirsList as any).selected ?? 0;
    const d = rankCacheDirs[idx]?.[0];
    if (!d) return;
    if (state.rankMutedDirs.has(d)) state.rankMutedDirs.delete(d); else state.rankMutedDirs.add(d);
    refreshRightPane(); screen.render();
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

  // Always-visible prompt input bar (above the status bar)
  const promptBar = blessed.textarea({
    parent: screen,
    bottom: 3,
    left: 0,
    width: "100%",
    height: 3,
    keys: true,
    mouse: true,
    inputOnFocus: true,
    wrap: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: " ", style: { inverse: true } },
    border: { type: "line" },
    value: state.promptText ?? ""
  });

  function applyLayout() {
    const wide = (screen.width as number) || 0;
    const h = (screen.height as number) || 24;
    const mode = state.layoutMode === "auto" ? (wide >= 100 ? "horizontal" : "vertical") : state.layoutMode;
    const promptH = (promptBar.height as number) || 3;
    const statusH = (status.height as number) || 3;
    const bottomBars = promptH + statusH; // dynamic prompt + status
    const contentTop = 1; // tabs
    const contentHeight = Math.max(3, h - bottomBars - contentTop);

    if (mode === "horizontal") {
      // Give Rankings more width for long paths when emphasized
      const leftPct = state.emphasizeRight ? 40 : 65; // files pane width
      const rightLeftPct = leftPct + 1; // small gutter between panes
      const rightWidthPct = 100 - rightLeftPct;
      list.top = contentTop; list.left = 0; list.width = `${leftPct}%`; (list as any).height = contentHeight;
      info.top = contentTop; (info as any).left = `${rightLeftPct}%`; (info as any).width = `${rightWidthPct}%`; (info as any).height = contentHeight;
    } else {
      list.top = contentTop; list.left = 0; list.width = "100%"; (list as any).height = Math.max(3, Math.floor(contentHeight * 0.55));
      ;(info as any).top = (contentTop as any) + (list.height as number); info.left = 0; info.width = "100%"; (info as any).height = Math.max(3, contentHeight - (list.height as number));
    }
    // Recompute right-pane content widths after layout changes
    refreshRightPane();
    screen.render();
  }

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
      "{bold}Tree{/bold}: left/right or h/l to collapse/expand",
      "{bold}Filter{/bold}: / filter prompt (coming soon)",
      "{bold}Rules{/bold}: i include globs, x exclude globs, g .gitignore, a .aicpignore, . hidden",
      "{bold}Packing{/bold}: b budget, s sort (small-first/large-first/path)",
      "{bold}Output{/bold}: m format (markdown/plain/json), e XML, t Tags, F2 metric (tokens/bytes/lines)",
      "{bold}Prompts{/bold}: p edit ad-hoc, P pick saved (space=toggle, v=preview)",
      "{bold}Pane{/bold}: d toggle Details/Rank; w swap focus; T toggle Tree/Flat",
      "{bold}Ranking{/bold}: h mutes (in Rankings), H unmute all",
      "{bold}Layout{/bold}: L toggle auto/horizontal/vertical",
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
  // Numeric shortcut for prompts picker
  screen.key(["3"], async () => { await showPromptPicker(); });

  // Status helpers
  function setStatus(msgTop: string, msgBottom?: string) {
    status.setContent(msgBottom ? `${help}\n${msgTop}  ${msgBottom}` : `${help}\n${msgTop}`);
  }

  // Keep state.promptText in sync with the visible prompt bar
  function syncPromptFromBar() {
    const val = typeof (promptBar as any).getValue === 'function' ? (promptBar as any).getValue() : String((promptBar as any).value ?? "");
    state.promptText = val.trim() ? val : undefined;
    setStatus(summaryLine());
  }
  // Auto-grow the prompt bar height based on wrapped content (up to 3 lines of content)
  function recomputePromptHeight() {
    const text = typeof (promptBar as any).getValue === 'function' ? (promptBar as any).getValue() : String((promptBar as any).value ?? "");
    const innerWidth = Math.max(1, ((promptBar.width as number) || (screen.width as number)) - 4); // border padding
    const parts = text.replace(/\r\n?/g, '\n').split('\n');
    const wrapped = parts.reduce((acc: number, line: string) => acc + Math.max(1, Math.ceil(line.length / innerWidth)), 0);
    const maxContentLines = 3; // allow up to 3 lines inside the bar
    const contentLines = Math.min(maxContentLines, wrapped);
    const needed = contentLines + 2; // +2 for borders
    if ((promptBar.height as number) !== needed) {
      (promptBar as any).height = needed;
      applyLayout();
    }
  }
  promptBar.on('submit', () => { syncPromptFromBar(); recomputePromptHeight(); list.focus(); });
  promptBar.on('blur', () => { syncPromptFromBar(); recomputePromptHeight(); });
  promptBar.on('keypress', (_ch, key) => {
    setTimeout(recomputePromptHeight, 0);
    if (key.full === 'C-c') { gracefulExit(0); return; }
    if (key.name === 'escape') { (promptBar as any).cancel(); list.focus(); }
  });

  function tokenGauge(): string {
    const eligible = buildEligible(state);
    const totalTok = eligible.reduce((a, f) => a + f.tokens, 0);
    return state.maxTokens ? `tokens ${totalTok}/${state.maxTokens}` : `tokens≈${totalTok}`;
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
    const fmt = state.xmlWrap ? "xml" : state.tagsWrap ? "tags" : state.format;
    const muted = state.rankMutedFiles.size + state.rankMutedDirs.size;
    return `eligible=${eligible.length}/${state.files.length}  ${tokenGauge()}  order=${state.packOrder}  format=${fmt}` + (muted ? `  muted=${muted}` : "");
  }
  function refreshList(full = true) {
    clampViewport();
    const eligible = buildEligible(state);
    const metric = state.treeMetric;
    const maxMetric = Math.max(1, ...(eligible.length ? eligible : state.files).map((f) => metricOfFile(f, metric)));
    // Update Files pane label with current selected token sum
    const selectedTokens = eligible.reduce((a, f) => a + f.tokens, 0);
    list.setLabel(` Files (✔ included / ✖ excluded) — tokens=${selectedTokens} `);
    if (full) {
      const count = visibleCount();
      let lines: string[] = [];
      if (state.treeMode) {
        const root = buildDirTree(state.files, path.basename(state.cwd));
        const eligSet = new Set(eligible.map((f) => f.relPath));
        const vis = makeVisibleTree(root, state.treeExpanded, eligSet);
        // rebuild a global list of visible nodes and map selectedIdx to position
        // selectedIdx refers to index in vis list; clamp
        if (state.selectedIdx >= vis.length) state.selectedIdx = Math.max(0, vis.length - 1);
        const slice = vis.slice(viewTop, viewTop + count);
        lines = slice.map((v) => renderTreeLine(v, metric));
        (refreshList as any)._vis = vis; // stash for key handlers
      } else {
        const slice = state.files.slice(viewTop, viewTop + count);
        lines = slice.map((f) => renderFileLine(f, state.manualExcluded.has(f.relPath) || state.autoDeselected.has(f.relPath)));
      }
      list.setItems(lines);
    }
    const selInView = Math.max(0, state.selectedIdx - viewTop);
    list.select(selInView);
    setStatus(summaryLine());
    refreshRightPane();
    screen.render();
  }

  // cache for current rankings
  let rankCacheFiles: FileEntry[] = [];
  let rankCacheDirs: Array<[string, number]> = [];
  let rankActiveSide: "files" | "dirs" = "files";

  function refreshRightPane() {
    if (state.paneMode === "details") {
      // hide rank lists when not in rank view
      rankFilesList.hide();
      rankDirsList.hide();
      // Details label (no token sum here; shown on Files pane only)
      info.setLabel(" Details ");
      updateFocusStyles();

      // When in tree mode, selectedIdx refers to visible nodes (dirs/files).
      if (state.treeMode) {
        const vis: VisibleNode[] = (refreshList as any)._vis || [];
        const node = vis[state.selectedIdx];
        if (!node) { info.setContent("(no selection)"); return; }
        if (node.kind === "file") {
          const f = node.file;
          const excluded = state.manualExcluded.has(f.relPath) || state.autoDeselected.has(f.relPath);
          const lines = [
            chalk.bold(f.relPath),
            `bytes=${humanBytes(f.bytes)}  lines=${f.lines}  tokens=${f.tokens}  ${excluded ? "EXCLUDED" : "INCLUDED"}`
          ];
          info.setContent(lines.join("\n"));
        } else {
          // Directory aggregate details
          const dirPath = node.node.path === "." ? "" : node.node.path + "/";
          const files = state.files.filter((f) => dirPath === "" || f.relPath.startsWith(dirPath));
          let bytes = 0, lines = 0, tokens = 0, included = 0;
          for (const f of files) {
            bytes += f.bytes; lines += f.lines; tokens += f.tokens;
            if (!state.manualExcluded.has(f.relPath) && !state.autoDeselected.has(f.relPath)) included += 1;
          }
          const linesOut = [
            chalk.bold(((node.node.path === "." ? path.basename(state.cwd) : node.node.path) + "/")),
            `files=${included}/${files.length}  tokens=${tokens}  lines=${lines}  bytes=${humanBytes(bytes)}`
          ];
          info.setContent(linesOut.join("\n"));
        }
        return;
      }

      // Flat mode details: selectedIdx maps to state.files
      const f = state.files[state.selectedIdx];
      if (!f) { info.setContent("(no files)"); return; }
      const excluded = state.manualExcluded.has(f.relPath) || state.autoDeselected.has(f.relPath);
      const lines = [
        chalk.bold(f.relPath),
        `bytes=${humanBytes(f.bytes)}  lines=${f.lines}  tokens=${f.tokens}  ${excluded ? "EXCLUDED" : "INCLUDED"}`
      ];
      info.setContent(lines.join("\n"));
    } else {
      // Rankings: Top Files (eligible - muted) and Top Folders (eligible - muted, aggregated)
      info.setLabel(" Rankings ");
      const eligible0 = buildEligible(state);
      const mutedDirs = [...state.rankMutedDirs];
      const isDirMuted = (p: string) => mutedDirs.some((d) => d === p || p.startsWith(d.endsWith("/") ? d : d + "/"));
      const eligible = eligible0.filter((f) => !state.rankMutedFiles.has(f.relPath) && !isDirMuted(path.posix.dirname(f.relPath)));

      const topFiles = [...eligible].sort((a, b) => b.tokens - a.tokens).slice(0, 20);
      const byDir = new Map<string, number>();
      for (const f of eligible) {
        const d = path.posix.dirname(f.relPath);
        byDir.set(d, (byDir.get(d) ?? 0) + f.tokens);
      }
      const topDirs = [...byDir.entries()]
        .filter(([d]) => !isDirMuted(d))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      // cache
      rankCacheFiles = topFiles;
      rankCacheDirs = topDirs;

      // build items
      const colW = Math.floor(((info.width as number) - 4) / 2) - 2;
      const pad = (s: string, w: number) => (s.length > w ? s.slice(0, w - 1) + "…" : s.padEnd(w));
      const fileItems = topFiles.map((f) => `${pad(f.relPath, colW - 10)} ${String(f.tokens).padStart(9)}`);
      const dirItems = topDirs.map(([d, t]) => `${pad(d || ".", colW - 10)} ${String(t).padStart(9)}`);
      rankFilesList.setItems(fileItems.length ? fileItems : ["(no files)"]);
      rankDirsList.setItems(dirItems.length ? dirItems : ["(no folders)"]);
      // show lists (do not steal focus from the files pane)
      rankFilesList.show();
      rankDirsList.show();
      // ensure an initial selection exists so arrows work immediately
      if (((rankFilesList as any).selected ?? -1) < 0 && fileItems.length) {
        rankFilesList.select(0);
        (rankFilesList as any).scrollTo(0);
      }
      if (((rankDirsList as any).selected ?? -1) < 0 && dirItems.length) {
        rankDirsList.select(0);
        (rankDirsList as any).scrollTo(0);
      }
      // clear box content so lists render cleanly
      info.setContent("");
      // focus is controlled explicitly on entering Rankings (R/tab) or via Tab key
      updateFocusStyles();
    }
  }

  // Focus helpers for quick pane switching
  function focusFilesPane() {
    list.focus();
    state.emphasizeRight = false;
    applyLayout();
    updateFocusStyles();
    screen.render();
  }
  function focusRankPane() {
    if (state.paneMode !== "rank") {
      state.paneMode = "rank";
      rankActiveSide = "files";
      refreshRightPane();
    }
    state.emphasizeRight = true;
    applyLayout();
    if (rankActiveSide === "files") {
      if (((rankFilesList as any).selected ?? -1) < 0) rankFilesList.select(0);
      rankFilesList.focus();
    } else {
      if (((rankDirsList as any).selected ?? -1) < 0) rankDirsList.select(0);
      rankDirsList.focus();
    }
    updateFocusStyles();
    screen.render();
  }

  function updateFocusStyles() {
    (list as any).style.selected = { inverse: !!(list as any).focused };
    (rankFilesList as any).style.selected = { inverse: !!(rankFilesList as any).focused };
    (rankDirsList as any).style.selected = { inverse: !!(rankDirsList as any).focused };
  }

  async function promptInput(title: string, initial = ""): Promise<string | undefined> {
    return new Promise((resolve) => {
      const prompt = blessed.prompt({ parent: screen, border: "line", height: 7, width: "80%", top: "center", left: "center", label: ` ${title} ` });
      prompt.input(initial, "", (err: any, value: any) => {
        prompt.destroy();
        screen.render();
        if (err) return resolve(undefined);
        resolve(typeof value === "string" ? value : undefined);
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
  screen.key(["q", "C-c"], () => gracefulExit(0));
  list.key(["up", "k"], () => {
    if (state.selectedIdx > 0) state.selectedIdx--;
    refreshList(false);
  });
  list.key(["down", "j"], () => {
    if (state.selectedIdx < state.files.length - 1) state.selectedIdx++;
    refreshList(false);
  });
  // Tree expand/collapse and toggling
  list.key(["left", "h"], () => {
    if (!state.treeMode) return;
    const vis: VisibleNode[] = (refreshList as any)._vis || [];
    const node = vis[state.selectedIdx];
    if (node && node.kind === "dir" && state.treeExpanded.has(node.node.path) && node.node.path !== ".") {
      state.treeExpanded.delete(node.node.path);
      refreshList();
    }
  });
  list.key(["right", "l"], () => {
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
  // Rescan now on Ctrl-R to free up `r` as a toggle alias
  screen.key(["C-r"], async () => { queueRescan(); });
  screen.key(["b"], async () => {
    const s = await promptInput("Token budget (empty = unlimited)", state.maxTokens ? String(state.maxTokens) : "");
    if (s !== undefined) state.maxTokens = s.trim() ? Number(s) || undefined : undefined;
    refreshList();
  });
  // Focus the prompt bar for quick editing
  screen.key(["p"], () => { promptBar.focus(); (promptBar as any).readInput(); });
  screen.key(["P"], async () => { await showPromptPicker(); });
  // Limit global 'h' to Rankings context (Tree uses h to collapse)
  screen.key(["h"], () => {
    if (state.paneMode !== "rank") return;
    // Delegate to the focused rankings list
    const active = rankActiveSide === "files" ? rankFilesList : rankDirsList;
    (active as any).emit('keypress', 'h', { name: 'h' });
  });
  screen.key(["H"], () => { state.rankMutedDirs.clear(); state.rankMutedFiles.clear(); setStatus("Cleared all ranking mutes"); refreshRightPane(); screen.render(); });
  screen.key(["L"], () => { state.layoutMode = state.layoutMode === "auto" ? "horizontal" : state.layoutMode === "horizontal" ? "vertical" : "auto"; applyLayout(); });
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
  screen.key(["T"], () => { state.treeMode = !state.treeMode; refreshList(); list.focus(); });
  // Toggle Rank <-> Details with the same hotkey (R)
  function toggleRankDetails() {
    if (state.paneMode === "rank") {
      state.paneMode = "details";
      refreshRightPane();
      state.emphasizeRight = false;
      applyLayout();
      updateFocusStyles();
      screen.render();
    } else {
      state.paneMode = "rank";
      rankActiveSide = "files";
      refreshRightPane();
      state.emphasizeRight = true;
      applyLayout();
      if (((rankFilesList as any).selected ?? -1) < 0) rankFilesList.select(0);
      rankFilesList.focus();
      updateFocusStyles();
      screen.render();
    }
  }
  // Single hotkey to toggle Details/Rank
  screen.key(["d"], () => { if ((promptBar as any).focused) return; toggleRankDetails(); });
  // Swap focus between Files and Rankings
  screen.key(["w"], () => {
    if ((promptBar as any).focused) return;
    const inFiles = !!(list as any).focused;
    const inRank = !!(rankFilesList as any).focused || !!(rankDirsList as any).focused;
    if (inFiles) { focusRankPane(); }
    else if (inRank) { focusFilesPane(); }
    else {
      // default: go to rankings if visible, else files
      if (state.paneMode === "rank") focusRankPane(); else focusFilesPane();
    }
  });
  // switch between rank columns
  screen.key(["tab"], () => {
    if (state.paneMode !== "rank") return;
    rankActiveSide = rankActiveSide === "files" ? "dirs" : "files";
    if (rankActiveSide === "files") {
      if (((rankFilesList as any).selected ?? -1) < 0) rankFilesList.select(0);
      rankFilesList.focus();
    } else {
      if (((rankDirsList as any).selected ?? -1) < 0) rankDirsList.select(0);
      rankDirsList.focus();
    }
    updateFocusStyles();
    screen.render();
  });
  screen.key(["f2"], () => { state.treeMetric = state.treeMetric === "tokens" ? "bytes" : state.treeMetric === "bytes" ? "lines" : "tokens"; refreshList(); });
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

  async function showPromptPicker(): Promise<void> {
    return new Promise((resolve) => {
      const box = blessed.box({ parent: screen, top: "center", left: "center", width: "70%", height: "70%", border: { type: "line" }, label: " Prompts (space=toggle, v=preview, Enter=apply, Esc=cancel) ", keys: true, mouse: true });
      const lst = blessed.list({ parent: box, top: 0, left: 0, width: "100%", height: "100%", keys: true, vi: true, mouse: true, style: { selected: { inverse: true } } });
      function renderItems() {
        const items = state.availablePrompts.map((p) => `[${state.selectedPrompts.has(p.name) ? "x" : " "}] ${p.name}`);
        lst.setItems(items.length ? items : ["(no saved prompts found)"]); screen.render();
      }
      renderItems();
      lst.key(["space"], () => { const i = (lst as any).selected ?? 0; const p = state.availablePrompts[i]; if (!p) return; if (state.selectedPrompts.has(p.name)) state.selectedPrompts.delete(p.name); else state.selectedPrompts.add(p.name); renderItems(); });
      lst.key(["v"], () => { const i = (lst as any).selected ?? 0; const p = state.availablePrompts[i]; if (!p) return; const preview = blessed.message({ parent: screen, border: "line", width: "80%", height: "80%", top: "center", left: "center", label: ` Preview: ${p.name} `, keys: true }); (preview as any).display(p.text, 0, () => {}); });
      lst.key(["enter"], () => { (box as any).destroy(); refreshList(); resolve(); });
      lst.key(["escape", "q"], () => { (box as any).destroy(); screen.render(); resolve(); });
      lst.focus(); screen.render();
    });
  }

  refreshList();
  list.focus();
  updateFocusStyles();
  applyLayout();
  screen.on("resize", applyLayout);
  screen.on("resize", () => setTimeout(() => recomputePromptHeight(), 0));
  // initial sizing for the prompt bar
  setTimeout(() => recomputePromptHeight(), 0);
  if (initial?.openPromptPicker && state.availablePrompts.length) await showPromptPicker();
}
