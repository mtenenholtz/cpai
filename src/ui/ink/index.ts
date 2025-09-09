import type { TuiAdapter } from '../adapter.js';

export class InkAdapter implements TuiAdapter {
  async run(opts: {
    cwd: string;
    promptText?: string;
    grep?: string;
    promptsDir?: string;
    openPromptPicker?: boolean;
    mouse?: boolean;
  }): Promise<void> {
    try {
      const inkMod: any = await (Function('return import("ink")')() as Promise<any>);
      const reactMod: any = await (Function('return import("react")')() as Promise<any>);
      const { App } = await import('./App.js');
      const { render } = inkMod;
      const React = reactMod.default ?? reactMod;
      let emitted: string | undefined;
      const element = React.createElement(App, {
        ...opts,
        onEmit: (text: string) => {
          emitted = text;
        },
      } as any);
      const { waitUntilExit } = render(element, {
        // Always render UI to stderr so stdout can be used for clean exports
        stdout: (process as any).stderr,
        stderr: (process as any).stderr,
        patchConsole: true,
        stdin: (process as any).stdin,
        isRawModeSupported: !!(process as any).stdin?.isTTY,
      });
      await waitUntilExit?.();
      if (typeof emitted === 'string') {
        // Ensure trailing newline for friendlier piping
        if (!emitted.endsWith('\n')) emitted += '\n';
        (process as any).stdout.write(emitted);
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      throw new Error(
        `Ink UI requires dependencies that are not installed. Run: pnpm install\nOriginal error: ${msg}`,
      );
    }
  }
}
