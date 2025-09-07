import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { toPosix, extnameLower, sortBy, humanBytes, stripAnsi, padPlain } from './utils.js';

describe('utils', () => {
  it('toPosix converts OS path to posix-style', () => {
    const joined = path.join('a', 'b', 'c');
    expect(toPosix(joined)).toBe('a/b/c');
  });

  it('extnameLower returns lowercase extension without dot', () => {
    expect(extnameLower('File.TS')).toBe('ts');
    expect(extnameLower('archive.tar.gz')).toBe('gz');
    expect(extnameLower('noext')).toBe('');
  });

  it('sortBy sorts ascending and descending', () => {
    const arr = [{ n: 3 }, { n: 1 }, { n: 2 }];
    expect(sortBy(arr, (x) => x.n, 'asc').map((x) => x.n)).toEqual([1, 2, 3]);
    expect(sortBy(arr, (x) => x.n, 'desc').map((x) => x.n)).toEqual([3, 2, 1]);
  });

  it('humanBytes formats sizes', () => {
    expect(humanBytes(0)).toBe('0 B');
    expect(humanBytes(1023)).toBe('1023 B');
    expect(humanBytes(1024)).toBe('1.0 KB');
    expect(humanBytes(1536)).toBe('1.5 KB');
  });

  it('stripAnsi removes ANSI escape codes', () => {
    const colored = '\u001b[31mred\u001b[0m';
    expect(stripAnsi(colored)).toBe('red');
  });

  it('padPlain pads or truncates plain text width', () => {
    expect(padPlain('hi', 5)).toBe('hi   ');
    // Truncates and adds ellipsis when too long
    expect(padPlain('hello', 4)).toBe('hel…');
  });
});
