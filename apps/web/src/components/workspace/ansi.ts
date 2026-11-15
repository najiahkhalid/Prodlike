/** Minimal ANSI SGR colour parser for terminal output (Jest, git). No dependencies, no HTML injection. */
export interface AnsiSpan {
  text: string;
  className: string;
}

const FG: Record<number, string> = {
  30: 'text-slate-500',
  31: 'text-bad-dark',
  32: 'text-ok-dark',
  33: 'text-warn-dark',
  34: 'text-sky-400',
  35: 'text-fuchsia-400',
  36: 'text-accent-live',
  37: 'text-console-text',
  90: 'text-slate-500',
  91: 'text-bad-dark',
  92: 'text-ok-dark',
  93: 'text-warn-dark',
  94: 'text-sky-400',
  95: 'text-fuchsia-400',
  96: 'text-accent-live',
  97: 'text-white',
};

export function parseAnsi(input: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let fg = '';
  let bold = false;
  let dim = false;
  // eslint-disable-next-line no-control-regex
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (text: string) => {
    if (text)
      spans.push({
        text,
        className: [fg, bold && 'font-semibold', dim && 'opacity-60'].filter(Boolean).join(' '),
      });
  };
  while ((m = re.exec(input))) {
    push(input.slice(last, m.index));
    for (const code of (m[1] || '0').split(';').map(Number)) {
      if (code === 0) {
        fg = '';
        bold = false;
        dim = false;
      } else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 22) {
        bold = false;
        dim = false;
      } else if (code === 39) fg = '';
      else if (FG[code]) fg = FG[code];
    }
    last = re.lastIndex;
  }
  // Strip any other escape sequences (cursor movement etc.) from the tail.
  // eslint-disable-next-line no-control-regex
  push(input.slice(last).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));
  return spans;
}
