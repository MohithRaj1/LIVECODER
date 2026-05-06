import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import './CodeEditor.css';

const LANGUAGE_MAP = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
  go: 'go',
  rust: 'rust',
  html: 'html',
  css: 'css',
  sql: 'sql',
};

export default function CodeEditor({ code, language, onOtOp }) {
  const editorRef = useRef(null);
  const suppressRef = useRef(false);

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.focus();

    const model = editor.getModel();
    if (!model) return;

    model.onDidChangeContent((e) => {
      if (suppressRef.current) return;
      if (!onOtOp) return;
      for (const ch of e.changes) {
        const start = model.getOffsetAt(ch.range.getStartPosition());
        const end = model.getOffsetAt(ch.range.getEndPosition());
        onOtOp({ pos: start, del: Math.max(0, end - start), ins: ch.text || '' });
      }
    });
  };

  // Keep editor in sync with remote changes by setting value,
  // while preventing echo back into OT.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!editor || !model) return;

    const current = model.getValue();
    if (current === code) return;

    suppressRef.current = true;
    editor.executeEdits('remote', [
      {
        range: model.getFullModelRange(),
        text: code,
      },
    ]);
    suppressRef.current = false;
  }, [code]);

  return (
    <div className="code-editor">
      <div className="code-editor__bar">
        <div className="code-editor__dots">
          <span className="code-editor__dot code-editor__dot--red" />
          <span className="code-editor__dot code-editor__dot--yellow" />
          <span className="code-editor__dot code-editor__dot--green" />
        </div>
        <span className="code-editor__lang-tag">{language}</span>
        <div className="code-editor__bar-right">
          <span className="code-editor__hint">✦ Changes sync in real time</span>
        </div>
      </div>
      <Editor
        height="100%"
        language={LANGUAGE_MAP[language] || 'javascript'}
        value={code}
        onMount={handleMount}
        theme="vs-dark"
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'expand',
          cursorSmoothCaretAnimation: 'on',
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          tabSize: 2,
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
          bracketPairColorization: { enabled: true },
          formatOnPaste: true,
          wordWrap: 'off',
          renderLineHighlight: 'all',
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
        }}
      />
    </div>
  );
}
