'use client';

import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { tags as t } from '@lezer/highlight';
import { createTheme } from '@uiw/codemirror-themes';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { useMemo } from 'react';

/** Dark editor theme matching the A2 workspace palette. */
const prodlikeDark = createTheme({
  theme: 'dark',
  settings: {
    background: '#0B1120',
    foreground: '#CBD5E1',
    caret: '#FFFFFF',
    selection: 'rgba(79,70,229,.35)',
    selectionMatch: 'rgba(79,70,229,.2)',
    lineHighlight: 'rgba(30,41,59,.55)',
    gutterBackground: '#0B1120',
    gutterForeground: '#7C8BA1', // 5:1 on the editor background (NFR-07)
    gutterBorder: 'transparent',
  },
  styles: [
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: '#C084FC' },
    { tag: [t.string, t.special(t.string)], color: '#86EFAC' },
    { tag: [t.number, t.bool, t.null], color: '#FDBA74' },
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#8B9BB4', fontStyle: 'italic' }, // ≥ 4.5:1 on the editor and the active line
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#7DD3FC' },
    { tag: [t.propertyName], color: '#E2E8F0' },
    { tag: [t.operator], color: '#F9A8D4' },
    { tag: [t.heading], color: '#7DD3FC', fontWeight: '600' },
  ],
});

function languageFor(path: string) {
  if (/\.(m?js|cjs|jsx|ts|tsx)$/.test(path))
    return [javascript({ jsx: true, typescript: /\.tsx?$/.test(path) })];
  if (path.endsWith('.json')) return [json()];
  if (path.endsWith('.md')) return [markdown()];
  return [];
}

export function CodeEditor({
  path,
  value,
  readOnly,
  onChange,
}: {
  path: string;
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  const label = `Code editor: ${path}${readOnly ? ' (read-only)' : ''}`;
  // The editable area itself needs the name (NFR-07): screen readers land on .cm-content.
  const extensions = useMemo(
    () => [...languageFor(path), EditorView.contentAttributes.of({ 'aria-label': label })],
    [path, label],
  );
  return (
    <CodeMirror
      key={path}
      value={value}
      theme={prodlikeDark}
      extensions={extensions}
      readOnly={readOnly}
      editable={!readOnly}
      onChange={onChange}
      height="100%"
      className="h-full text-[13px]"
      basicSetup={{ foldGutter: false, highlightActiveLineGutter: true, autocompletion: false }}
    />
  );
}
