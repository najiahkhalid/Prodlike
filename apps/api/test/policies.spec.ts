import { decideCommand, parseCommandLine } from '../src/sandbox/command-policy';
import { safeWorkspacePath } from '../src/sandbox/path-policy';

const ALLOW = ['npm test', 'git diff', 'git log', 'logs', 'rollback'];

describe('parseCommandLine', () => {
  it('splits on spaces and keeps quoted groups', () => {
    expect(parseCommandLine('git log --oneline  -n 3')).toEqual(['git', 'log', '--oneline', '-n', '3']);
    expect(parseCommandLine(`npm test -- -t "boundary case"`)).toEqual([
      'npm',
      'test',
      '--',
      '-t',
      'boundary case',
    ]);
  });
  it('rejects unbalanced quotes', () => {
    expect(parseCommandLine('npm test "oops')).toBeNull();
  });
});

describe('decideCommand (FR-06 restricted terminal)', () => {
  it('runs allowlisted commands with extra arguments', () => {
    expect(decideCommand('npm test', ALLOW)).toEqual({ kind: 'exec', argv: ['npm', 'test'] });
    expect(decideCommand('git log --oneline', ALLOW)).toEqual({
      kind: 'exec',
      argv: ['git', 'log', '--oneline'],
    });
  });

  it('routes simulated-production commands to the engine', () => {
    expect(decideCommand('logs payments', ALLOW)).toEqual({
      kind: 'engine',
      name: 'logs',
      args: ['payments'],
    });
  });

  it.each([
    ['rm -rf /', 'not permitted'],
    ['curl https://example.com', 'not permitted'],
    ['git push origin main', 'not permitted'],
    ['npm install left-pad', 'not permitted'],
    ['node -e "process.exit()"', 'not permitted'],
    ['npm test; rm -rf .', 'shell operators'],
    ['git log | head', 'shell operators'],
    ['echo $HOME', 'shell operators'],
    ['npm test -- --watch', '--watch'],
    ['git -c core.pager=sh log', 'not permitted'],
  ])('denies %p', (line, reason) => {
    const d = decideCommand(line, ALLOW);
    expect(d.kind).toBe('denied');
    expect(d.kind === 'denied' && d.reason).toContain(reason);
  });
});

describe('safeWorkspacePath', () => {
  it.each([
    ['src/discount.js', 'src/discount.js'],
    ['./tests/discount.test.js', 'tests/discount.test.js'],
    ['src\\discount.js', 'src/discount.js'],
  ])('accepts %p', (raw, clean) => expect(safeWorkspacePath(raw)).toBe(clean));

  it.each([
    '/etc/passwd',
    '../../etc/passwd',
    'src/../../outside',
    'C:/Windows',
    'node_modules/jest/index.js',
    '.git/config',
    '.hidden-tests/discount.hidden.test.js',
    '',
    '.',
    'src/$(whoami).js',
  ])('rejects %p', (raw) => expect(safeWorkspacePath(raw)).toBeNull());
});
