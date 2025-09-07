import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type AicpConfig = {
  include?: string[];
  exclude?: string[];
  useGitignore?: boolean;
  useAicpIgnore?: boolean;
  hidden?: boolean;
  maxBytesPerFile?: number;
  model?: string;
  encoding?: string;
  format?: "markdown" | "plain" | "json";
  // UI toggles
  mouse?: boolean;
  // Optional default prompt included at top and bottom
  prompt?: string;
  promptFile?: string;
  // Named profiles that can override include/exclude and prompt per run
  profiles?: Record<string, AicpProfile>;
};

export type AicpProfile = {
  include?: string[];
  exclude?: string[];
  useGitignore?: boolean;
  useAicpIgnore?: boolean;
  hidden?: boolean;
  maxBytesPerFile?: number;
  model?: string;
  encoding?: string;
  format?: "markdown" | "plain" | "json";
  prompt?: string;
  promptFile?: string;
  tagsWrap?: boolean;
  xmlWrap?: boolean;
  codeFences?: boolean;
  blockSeparator?: string;
  packOrder?: "small-first" | "large-first" | "path";
  strict?: boolean;
  mouse?: boolean;
};

export const DEFAULT_CONFIG: Required<Omit<AicpConfig, "profiles" | "prompt" | "promptFile">> = {
  include: ["**/*"],
  exclude: [
    "**/{node_modules,dist,build,.git,.next,.cache,coverage}/**",
    "**/.aicpignore",
    "**/*.{png,jpg,jpeg,gif,webp,svg,ico,bmp,pdf,zip,tgz,gz,rar,7z,mp3,mp4,ogg,webm,avi,mov,exe,dll,dylib,so,wasm,woff,woff2,ttf,eot}",
    "**/*.min.{js,css}",
    "**/*.lock",
    "**/*.log"
  ],
  useGitignore: true,
  useAicpIgnore: true,
  hidden: false,
  maxBytesPerFile: 512000, // 0.5 MB per file by default
  model: "gpt-4o-mini",
  encoding: "o200k_base",
  format: "markdown",
  mouse: false
};

export async function loadAicpConfig(cwd: string): Promise<AicpConfig> {
  const configPath = path.join(cwd, ".aicprc.json");
  const pkgPath = path.join(cwd, "package.json");
  const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || "";
  const aicpHome = home ? path.join(home, ".aicp") : "";

  let config: AicpConfig = {};

  // Global (~/.aicp/config.json or ~/.aicp/.aicprc.json)
  const globalCandidates = aicpHome ? [path.join(aicpHome, "config.json"), path.join(aicpHome, ".aicprc.json")] : [];
  for (const p of globalCandidates) {
    try {
      const raw = await fs.readFile(p, "utf8");
      config = { ...config, ...JSON.parse(raw) };
    } catch {}
  }

  // Project .aicprc.json
  try {
    const raw = await fs.readFile(configPath, "utf8");
    config = { ...config, ...JSON.parse(raw) };
  } catch {}

  // package.json#aicp
  try {
    const raw = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.aicp && typeof pkg.aicp === "object") {
      config = { ...config, ...pkg.aicp };
    }
  } catch {}

  return config;
}

export async function writeDefaultAicpConfig(cwd: string) {
  const configPath = path.join(cwd, ".aicprc.json");
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n";
  await fs.writeFile(configPath, content, "utf8");
  return configPath;
}

export async function writeDefaultGlobalAicpConfig() {
  const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE;
  if (!home) throw new Error("Cannot resolve HOME directory for ~/.aicp");
  const dir = path.join(home, ".aicp");
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, "config.json");
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n";
  await fs.writeFile(p, content, "utf8");
  return p;
}
