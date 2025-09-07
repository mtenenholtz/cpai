import path from "node:path";

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function extnameLower(p: string): string {
  return path.extname(p).toLowerCase().replace(/^\./, "");
}

export function sortBy<T>(arr: T[], key: (x: T) => number | string, dir: "asc" | "desc" = "asc"): T[] {
  return [...arr].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return 0;
    const cmp = ka < kb ? -1 : 1;
    return dir === "asc" ? cmp : -cmp;
  });
}

export function humanBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : v < 10 ? 1 : 0)} ${units[i]}`;
}

// Minimal ANSI escape stripper for width calculations
const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_PATTERN, "");
}

export function padPlain(s: string, w: number): string {
  const plain = stripAnsi(s);
  if (plain.length > w) return plain.slice(0, Math.max(1, w - 1)) + "…";
  return plain.padEnd(w);
}
