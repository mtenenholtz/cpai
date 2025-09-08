export function hyperlink(text: string, url: string): string {
  // OSC 8 hyperlink: ESC ] 8 ;; url ST text ESC ] 8 ;; ST
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}
