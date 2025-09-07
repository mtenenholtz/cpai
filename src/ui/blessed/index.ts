import type { TuiAdapter } from '../adapter.js';
import { runTui } from '../../tui.js';

export class BlessedAdapter implements TuiAdapter {
  async run(opts: { cwd: string; promptText?: string; promptsDir?: string; openPromptPicker?: boolean; mouse?: boolean }): Promise<void> {
    await runTui(opts.cwd, {
      promptText: opts.promptText,
      promptsDir: opts.promptsDir,
      openPromptPicker: opts.openPromptPicker,
      mouse: opts.mouse
    });
  }
}
