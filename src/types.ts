export type OutputFormat = 'markdown' | 'json';

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
  // Optional content filter: include files whose bodies match this regex
  grep?: string;
}

export interface ScanOptions extends BaseOptions {}

export interface CopyOptions extends BaseOptions {
  format: OutputFormat;
  outFile?: string;
  toClipboard: boolean;
  byDir: boolean; // if we want directory-level report too
  maxTokens?: number; // budget for packed copy
  packOrder: 'small-first' | 'large-first' | 'path';
  strict: boolean; // verify maxTokens after rendering; error if exceeded unless truncate=true
  truncate?: boolean; // when strict and over budget, auto-trim selection instead of error
  codeFences: boolean;
  header?: string;
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
  // When a grep pattern is provided, indicates whether the file body matched
  grepMatched?: boolean;
}

export interface ScanResult {
  files: FileEntry[];
  totalTokens: number;
  totalBytes: number;
  totalLines: number;
  byDir: Map<string, { tokens: number; bytes: number; files: number; lines: number }>;
}
