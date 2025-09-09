export interface TuiAdapter {
  run(opts: {
    cwd: string;
    promptText?: string;
    grep?: string;
    promptsDir?: string;
    openPromptPicker?: boolean;
    mouse?: boolean;
  }): Promise<void>;
}

export type UiKind = 'ink';

export async function getTuiAdapter(kind: UiKind = 'ink'): Promise<TuiAdapter> {
  const mod = await import('./ink/index.js');
  return new mod.InkAdapter();
}
