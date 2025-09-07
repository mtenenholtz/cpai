// Light wrapper around @dqbd/tiktoken to centralize model/encoding handling.
import type { Tiktoken } from "@dqbd/tiktoken";

let encoder: Tiktoken | null = null;

type TiktokenModule = typeof import("@dqbd/tiktoken");

let modPromise: Promise<TiktokenModule> | null = null;
async function loadModule(): Promise<TiktokenModule> {
  if (!modPromise) modPromise = import("@dqbd/tiktoken");
  return modPromise;
}

/**
 * Map model names to a reasonable default encoding.
 * These defaults reflect common pairings but may not be exact for every vendor.
 */
function defaultEncodingForModel(model?: string): string {
  if (!model) return "o200k_base";
  const m = model.toLowerCase();
  if (m.includes("4o") || m.includes("4.1") || m.startsWith("o3") || m.startsWith("o1")) return "o200k_base";
  if (m.includes("gpt-4") || m.includes("gpt-3.5")) return "cl100k_base";
  // fallback
  return "o200k_base";
}

/**
 * Ensure a global encoder is ready.
 * If encodingForModel is available, try that, else fall back to get_encoding.
 */
export async function ensureEncoder(model?: string, encodingOverride?: string) {
  if (encoder) return encoder;
  const t = await loadModule();
  const encName = encodingOverride ?? defaultEncodingForModel(model);

  // Prefer encoding_for_model when possible; fall back gracefully.
  try {
    if ((t as any).encoding_for_model && model) {
      encoder = (t as any).encoding_for_model(model as any);
    }
  } catch {
    encoder = null;
  }
  if (!encoder) {
    encoder = (t as any).get_encoding(encName as any);
  }

  // Free on exit to reduce leaks for long-lived shells.
  process.on("exit", () => {
    try {
      encoder?.free();
    } catch {}
    encoder = null;
  });
  return encoder!;
}

export async function countTokens(text: string): Promise<number> {
  const enc = await ensureEncoder();
  // encoder.encode returns a Uint32Array; length is the token count
  return enc.encode(text).length;
}

