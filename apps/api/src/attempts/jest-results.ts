import type { TestCase } from '@prodlike/shared';

const ANSI = /\x1b\[[0-9;]*m/g; // eslint-disable-line no-control-regex

interface JestJson {
  numPassedTests: number;
  numFailedTests: number;
  numTotalTests: number;
  testResults: {
    name: string;
    assertionResults: { fullName: string; status: string; failureMessages: string[] }[];
  }[];
}

/** Turn Jest's --json output into the shared TestRunResult shape (FR-07). */
export function parseJestJson(raw: string, workdir = '/workspace/') {
  const json = JSON.parse(raw) as JestJson;
  const cases: TestCase[] = json.testResults.flatMap((file) =>
    file.assertionResults.map((a) => ({
      name: a.fullName,
      file: file.name.replace(workdir, ''),
      status: a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped',
      ...(a.failureMessages.length
        ? {
            failure: a.failureMessages
              .join('\n')
              .replace(ANSI, '')
              .split('\n')
              .filter((l) => l.trim() && !l.trim().startsWith('at '))
              .slice(0, 8)
              .join('\n'),
          }
        : {}),
    })),
  );
  return { passed: json.numPassedTests, failed: json.numFailedTests, total: json.numTotalTests, cases };
}
