import type { TuiAdapter } from '../adapter.js';

export class InkAdapter implements TuiAdapter {
  async run(opts: { cwd: string; promptText?: string; promptsDir?: string; openPromptPicker?: boolean }): Promise<void> {
    try {
      const inkMod: any = await (Function('return import("ink")')() as Promise<any>);
      const reactMod: any = await (Function('return import("react")')() as Promise<any>);
      const { App } = await import('./App.js');
      const { render } = inkMod;
      const React = reactMod.default ?? reactMod;
      const element = React.createElement(App, opts);
      const { waitUntilExit } = render(element, {
        patchConsole: true,
        stdin: (process as any).stdin,
        isRawModeSupported: !!(process as any).stdin?.isTTY,
      });
      await waitUntilExit?.();
    } catch (e: any) {
      const msg = e?.message || String(e);
      throw new Error(
        `Ink UI requires dependencies that are not installed. Run: pnpm install\nOriginal error: ${msg}`
      );
    }
  }
}
