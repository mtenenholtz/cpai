import { DEFAULT_CONFIG, loadAicpConfig } from '../../lib/config.js';
import type { FileEntry } from '../../types.js';

export type SavedPrompt = {
  name: string;
  path: string;
  text: string;
  origin: 'project' | 'global';
};

export type State = {
  cwd: string;
  include: string[];
  exclude: string[];
  useGitignore: boolean;
  useCpaiIgnore: boolean;
  hidden: boolean;
  maxBytesPerFile: number;
  model?: string;
  encoding?: string;
  grep?: string;
  // copy options
  maxTokens?: number;
  packOrder: 'small-first' | 'large-first' | 'path';
  strict: boolean;
  format: 'markdown' | 'json';
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
  paneMode: 'rank' | 'details';
  // layout & metrics
  layoutMode: 'auto' | 'horizontal' | 'vertical';
  treeMetric: 'tokens' | 'bytes' | 'lines';
  // ranking mutes (affects Rankings only)
  rankMutedFiles: Set<string>;
  rankMutedDirs: Set<string>;
  // prompts
  availablePrompts: SavedPrompt[];
  selectedPrompts: Set<string>;
  // layout emphasis: when true, give right pane more width
  emphasizeRight: boolean;
  // auto-deselections from .cpaiignore (still visible, just not selected)
  autoDeselected: Set<string>;
};

export function makeDefaultState(cwd: string, fileCfg: any): State {
  return {
    cwd,
    include: fileCfg.include || DEFAULT_CONFIG.include,
    exclude: fileCfg.exclude || DEFAULT_CONFIG.exclude,
    useGitignore: fileCfg.useGitignore ?? DEFAULT_CONFIG.useGitignore,
    useCpaiIgnore: fileCfg.useCpaiIgnore ?? DEFAULT_CONFIG.useCpaiIgnore,
    hidden: fileCfg.hidden ?? DEFAULT_CONFIG.hidden,
    maxBytesPerFile: fileCfg.maxBytesPerFile ?? DEFAULT_CONFIG.maxBytesPerFile,
    model: fileCfg.model ?? DEFAULT_CONFIG.model,
    encoding: fileCfg.encoding ?? DEFAULT_CONFIG.encoding,
    grep: undefined,
    maxTokens: undefined,
    packOrder: 'small-first',
    strict: true,
    format: 'markdown',
    xmlWrap: false,
    tagsWrap: true,
    promptText: undefined,
    files: [],
    selectedIdx: 0,
    manualExcluded: new Set(),
    treeMode: true,
    treeExpanded: new Set<string>(['.']),
    paneMode: 'rank',
    layoutMode: 'auto',
    treeMetric: 'tokens',
    rankMutedFiles: new Set(),
    rankMutedDirs: new Set(),
    availablePrompts: [],
    selectedPrompts: new Set(),
    emphasizeRight: false,
    autoDeselected: new Set(),
  };
}
