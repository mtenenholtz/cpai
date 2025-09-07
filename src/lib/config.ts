import fs from "node:fs/promises";
import path from "node:path";

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
  format: "markdown"
};

export async function loadAicpConfig(cwd: string): Promise<AicpConfig> {
  const configPath = path.join(cwd, ".aicprc.json");
  const pkgPath = path.join(cwd, "package.json");

  let config: AicpConfig = {};

  try {
    const raw = await fs.readFile(configPath, "utf8");
    config = { ...config, ...JSON.parse(raw) };
  } catch {}

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
