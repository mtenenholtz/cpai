import type { FileEntry } from '../../types.js';
import type { State } from './state.js';

export type DirNode = { name: string; path: string; dirs: Map<string, DirNode>; files: FileEntry[] };

export function buildDirTree(files: FileEntry[], rootName: string = '.'): DirNode {
  const root: DirNode = { name: rootName, path: '.', dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.relPath.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const last = i === parts.length - 1;
      if (last) {
        node.files.push(f);
      } else {
        const subPath = node.path === '.' ? part : `${node.path}/${part}`;
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

export type VisibleNode =
  | { kind: 'dir'; depth: number; node: DirNode; included: boolean; mixed: boolean; tokens: number }
  | { kind: 'file'; depth: number; file: FileEntry; included: boolean };

export function computeDirStats(
  node: DirNode,
  eligibleSet: Set<string>
): { tokens: number; included: number; total: number } {
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

export function makeVisibleTree(
  root: DirNode,
  expanded: Set<string>,
  eligibleSet: Set<string>
): VisibleNode[] {
  const out: VisibleNode[] = [];
  function walk(n: DirNode, depth: number) {
    const stats = computeDirStats(n, eligibleSet);
    const mixed = stats.included > 0 && stats.included < stats.total;
    const included = stats.included === stats.total && stats.total > 0;
    out.push({ kind: 'dir', depth, node: n, included, mixed, tokens: stats.tokens });
    if (!expanded.has(n.path)) return;
    // directories in alpha order, then files
    const dirNames = [...n.dirs.keys()].sort();
    for (const name of dirNames) walk(n.dirs.get(name)!, depth + 1);
    const files = [...n.files].sort((a, b) => a.relPath.localeCompare(b.relPath));
    for (const f of files) {
      const inc = eligibleSet.has(f.relPath);
      out.push({ kind: 'file', depth: depth + 1, file: f, included: inc });
    }
  }
  walk(root, 0);
  return out;
}

export function metricOfFile(f: FileEntry, metric: State['treeMetric']) {
  return metric === 'tokens' ? f.tokens : metric === 'bytes' ? f.bytes : f.lines;
}

export function metricOfDir(v: { tokens: number }, metric: State['treeMetric']) {
  // Directories aggregate tokens by default.
  return metric === 'tokens' ? v.tokens : v.tokens;
}
