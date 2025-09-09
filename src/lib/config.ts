import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export type AicpConfig = {
  include?: string[];
  exclude?: string[];
  useGitignore?: boolean;
  useCpaiIgnore?: boolean;
  hidden?: boolean;
  maxBytesPerFile?: number;
  model?: string;
  encoding?: string;
  format?: 'markdown' | 'json';
  // When true, allow auto-truncating to fit max-tokens (CLI copy)
  truncate?: boolean;
  // UI toggles
  mouse?: boolean;
  // Optional default instructions included at top and bottom
  instructions?: string;
  instructionsFile?: string;
  // Saved prompts (by name) to auto-select/include
  // - In TUI: pre-selects in the Saved Prompts picker
  // - In CLI copy: includes these saved prompts in the composed prompt
  selectedPrompts?: string[];
  // Named profiles that can override include/exclude and prompt per run
  profiles?: Record<string, AicpProfile>;
};

export type AicpProfile = {
  include?: string[];
  exclude?: string[];
  useGitignore?: boolean;
  useCpaiIgnore?: boolean;
  hidden?: boolean;
  maxBytesPerFile?: number;
  model?: string;
  encoding?: string;
  format?: 'markdown' | 'json';
  instructions?: string;
  instructionsFile?: string;
  // Saved prompts (by name) to auto-select/include for this profile
  selectedPrompts?: string[];
  tagsWrap?: boolean;
  xmlWrap?: boolean;
  codeFences?: boolean;
  packOrder?: 'small-first' | 'large-first' | 'path';
  strict?: boolean;
  truncate?: boolean;
  mouse?: boolean;
};

export const DEFAULT_CONFIG: Required<
  Omit<AicpConfig, 'profiles' | 'instructions' | 'instructionsFile' | 'selectedPrompts'>
> = {
  include: ['**/*'],
  exclude: [
    '**/{node_modules,dist,build,.git,.next,.cache,coverage}/**',
    '**/.cpaiignore',

    '**/*.{png,jpg,jpeg,gif,webp,svg,ico,bmp,pdf,zip,tgz,gz,rar,7z,mp3,mp4,ogg,webm,avi,mov,exe,dll,dylib,so,wasm,woff,woff2,ttf,eot}',
    '**/*.min.{js,css}',
    '**/*.lock',
    '**/*.log',
  ],
  useGitignore: true,
  useCpaiIgnore: true,
  hidden: false,
  maxBytesPerFile: 512000, // 0.5 MB per file by default
  model: 'gpt-4o-mini',
  encoding: 'o200k_base',
  format: 'markdown',
  truncate: false,
  mouse: false,
};

export async function loadAicpConfig(cwd: string): Promise<AicpConfig> {
  const configPathNew = path.join(cwd, '.cpairc.json');
  const pkgPath = path.join(cwd, 'package.json');
  const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || '';
  const cpaiHome = home ? path.join(home, '.cpai') : '';

  let config: AicpConfig = {};

  // 1) Global (~/.cpai/config.json or ~/.cpai/.cpairc.json)
  const globalCandidates = [
    cpaiHome && path.join(cpaiHome, 'config.json'),
    cpaiHome && path.join(cpaiHome, '.cpairc.json'),
  ].filter(Boolean) as string[];
  for (const p of globalCandidates) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      config = { ...config, ...JSON.parse(raw) };
    } catch {}
  }

  // 2) Project package.json#cpai
  try {
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    if (pkg.cpai && typeof pkg.cpai === 'object') config = { ...config, ...pkg.cpai };
  } catch {}

  // 3) Project .cpairc.json (highest among files)
  try {
    const raw = await fs.readFile(configPathNew, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  } catch {}

  return config;
}

export async function writeDefaultAicpConfig(cwd: string) {
  const configPath = path.join(cwd, '.cpairc.json');
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n';
  await fs.writeFile(configPath, content, 'utf8');
  return configPath;
}

export async function writeDefaultGlobalAicpConfig() {
  const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE;
  if (!home) throw new Error('Cannot resolve HOME directory for ~/.cpai');
  const dir = path.join(home, '.cpai');
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, 'config.json');
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n';
  await fs.writeFile(p, content, 'utf8');
  return p;
}

/**
 * Locate a named profile by searching in this order:
 *  1) Project .cpairc.json#profiles
 *  2) Project package.json#cpai.profiles
 *  3) Global ~/.cpai/config.json or ~/.cpai/.cpairc.json #profiles
 * Project wins over global; if not found in project, fall back to global.
 */
export async function findProfile(cwd: string, name: string): Promise<AicpProfile | undefined> {
  const configPathNew = path.join(cwd, '.cpairc.json');
  const pkgPath = path.join(cwd, 'package.json');
  // 1) Project .cpairc.json
  try {
    const raw = await fs.readFile(configPathNew, 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg && cfg.profiles && typeof cfg.profiles === 'object' && cfg.profiles[name]) {
      return cfg.profiles[name] as AicpProfile;
    }
  } catch {}
  // 2) Project package.json#cpai.profiles
  try {
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    const p = pkg?.cpai?.profiles;
    if (p && typeof p === 'object' && p[name]) return p[name] as AicpProfile;
  } catch {}
  // 3) Global (~/.cpai/config.json or ~/.cpai/.cpairc.json)
  const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || '';
  const cpaiHome = home ? path.join(home, '.cpai') : '';
  const globalCandidates = [
    cpaiHome && path.join(cpaiHome, 'config.json'),
    cpaiHome && path.join(cpaiHome, '.cpairc.json'),
  ].filter(Boolean) as string[];
  for (const p of globalCandidates) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      const cfg = JSON.parse(raw);
      const profs = cfg?.profiles;
      if (profs && typeof profs === 'object' && profs[name]) return profs[name] as AicpProfile;
    } catch {}
  }
  return undefined;
}
