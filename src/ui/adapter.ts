export interface TuiAdapter {
  run(opts: {
    cwd: string;
    promptText?: string;
    promptsDir?: string;
    openPromptPicker?: boolean;
    mouse?: boolean;
  }): Promise<void>;
}

export type UiKind = 'blessed' | 'ink';

// Lazy resolve to avoid importing React/Ink until implemented.
export async function getTuiAdapter(kind: UiKind): Promise<TuiAdapter> {
  if (kind === 'blessed') {
    const mod = await import('./blessed/index.js');
    return new mod.BlessedAdapter();
  }
  if (kind === 'ink') {
    const mod = await import('./ink/index.js');
    return new mod.InkAdapter();
  }
  throw new Error('Unknown UI kind');
}
