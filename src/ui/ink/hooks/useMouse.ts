import {useEffect} from 'react';

export type MouseEvent = {
  x: number; // 1-based column
  y: number; // 1-based row
  type: 'down' | 'up' | 'wheelUp' | 'wheelDown' | 'drag';
  button: 'left' | 'middle' | 'right' | 'wheel';
};

// Enable SGR mouse tracking and parse events from stdin.
export function useMouse(onEvent: (ev: MouseEvent) => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    if (!process.stdout.isTTY || !process.stdin.isTTY) return;

    // Enable SGR extended mouse mode
    try {
      process.stdout.write('\u001b[?1000h'); // basic mouse tracking
      process.stdout.write('\u001b[?1002h'); // button-drag mode
      process.stdout.write('\u001b[?1003h'); // any-motion mode (some terminals/tmux configs)
      process.stdout.write('\u001b[?1006h'); // SGR extended coordinates
    } catch {}

    const onData = (buf: Buffer) => {
      const s = buf.toString('utf8');
      // Parse sequences like: ESC [ < btn ; x ; y (M|m)
      // Multiple events can arrive in a single chunk.
      const re = /\u001b\[<(\d+);(\d+);(\d+)([Mm])/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const btn = Number(m[1]);
        const x = Number(m[2]);
        const y = Number(m[3]);
        const press = m[4] === 'M';
        let type: MouseEvent['type'] = press ? 'down' : 'up';
        let button: MouseEvent['button'] = 'left';

        if ((btn & 0x40) === 0x40) {
          // wheel
          button = 'wheel';
          type = (btn & 1) === 1 ? 'wheelDown' : 'wheelUp';
        } else {
          const b = btn & 0x03;
          button = b === 0 ? 'left' : b === 1 ? 'middle' : 'right';
          // drag not differentiated here; press vs release is enough for clicks
        }
        onEvent({ x, y, type, button });
      }
    };

    process.stdin.on('data', onData);

    return () => {
      process.stdin.off('data', onData);
      try {
        process.stdout.write('\u001b[?1006l');
        process.stdout.write('\u001b[?1003l');
        process.stdout.write('\u001b[?1002l');
        process.stdout.write('\u001b[?1000l');
      } catch {}
    };
  }, [onEvent, enabled]);
}
