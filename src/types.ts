export type OutputFormat = "markdown" | "plain" | "json";

export interface BaseOptions {
  cwd: string;
  include: string[];
  exclude: string[];
  useGitignore: boolean;
  useCpaiIgnore: boolean;
  hidden: boolean;
  maxBytesPerFile: number;
  model?: string;
  encoding?: string; // e.g., "o200k_base", "cl100k_base"
}

export interface ScanOptions extends BaseOptions {}

export interface CopyOptions extends BaseOptions {
  format: OutputFormat;
  outFile?: string;
  toClipboard: boolean;
  byDir: boolean; // if we want directory-level report too
  maxTokens?: number; // budget for packed copy
  packOrder: "small-first" | "large-first" | "path";
  strict: boolean; // enforce maxTokens after rendering (drop trailing files if needed)
  codeFences: boolean;
  header?: string;
  blockSeparator: string;
  // XML wrapping
  xmlWrap?: boolean;
  // Simple per-file tag wrapping (<FILE_1 path="...">...)</FILE_1>)
  tagsWrap?: boolean;
  // Optional prompt to include at top and bottom of the final output
  promptText?: string;
}

export interface FileEntry {
  absPath: string;
  relPath: string;
  bytes: number;
  lines: number;
  tokens: number;
  ext: string;
  skipped?: boolean;
  reason?: string;
}

export interface ScanResult {
  files: FileEntry[];
  totalTokens: number;
  totalBytes: number;
  totalLines: number;
  byDir: Map<string, { tokens: number; bytes: number; files: number; lines: number }>;
}
