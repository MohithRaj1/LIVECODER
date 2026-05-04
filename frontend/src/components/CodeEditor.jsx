import { useRef } from 'react';
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

export default function CodeEditor({ code, language, onChange }) {
  const editorRef = useRef(null);

  const handleMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

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
        onChange={(val) => onChange(val || '')}
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
