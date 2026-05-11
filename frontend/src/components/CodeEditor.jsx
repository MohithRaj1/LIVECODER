import { useEffect, useRef, useCallback } from 'react';
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

/** File extension for Monaco model URI (VS Code–style virtual workspace). */
const MODEL_EXT = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  cpp: 'cpp',
  go: 'go',
  rust: 'rs',
  html: 'html',
  css: 'css',
  sql: 'sql',
};

function configureMonacoLanguageServices(monaco) {
  const ts = monaco.languages.typescript;
  if (!ts) return;

  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    allowJs: true,
    checkJs: false,
    strict: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    isolatedModules: true,
    lib: ['esnext', 'dom'],
  };

  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.setCompilerOptions(compilerOptions);

  const diag = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
  };
  ts.javascriptDefaults.setDiagnosticsOptions(diag);
  ts.typescriptDefaults.setDiagnosticsOptions(diag);

  ts.javascriptDefaults.setEagerModelSync(true);
  ts.typescriptDefaults.setEagerModelSync(true);
}

/**
 * Collaborative code editor using the Monaco API (same engine as VS Code):
 * IntelliSense, diagnostics, format document, parameter hints, and Vite-backed workers.
 */
export default function CodeEditor({ code, language, roomId, onOtOp }) {
  const editorRef = useRef(null);
  const suppressRef = useRef(false);

  const monacoLanguage = LANGUAGE_MAP[language] || 'javascript';
  const ext = MODEL_EXT[language] || 'txt';
  const modelPath = `livecode/${roomId || 'session'}/src/main.${ext}`;

  const handleBeforeMount = useCallback((monaco) => {
    configureMonacoLanguageServices(monaco);
  }, []);

  const handleMount = useCallback(
    (editor, monaco) => {
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

      // VS Code–style Format Document (Shift + Alt + F)
      editor.addAction({
        id: 'livecode.formatDocument',
        label: 'Format Document',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        run: (ed) => {
          void ed.getAction('editor.action.formatDocument')?.run();
        },
      });

      // Cmd/Ctrl+S — common editor habit (no server save; document is already synced)
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void editor.getAction('editor.action.formatDocument')?.run();
      });
    },
    [onOtOp]
  );

  // Apply remote OT updates without echoing back into the socket
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
          <span className="code-editor__hint">
            Monaco · Shift+Alt+F format · Ctrl/Cmd+S format · Live sync
          </span>
        </div>
      </div>
      <Editor
        height="100%"
        path={modelPath}
        language={monacoLanguage}
        theme="vs-dark"
        value={code}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        loading={<span className="code-editor__loading">Loading editor…</span>}
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          fontLigatures: true,
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          lineNumbers: 'on',
          glyphMargin: true,
          folding: true,
          foldingStrategy: 'indentation',
          renderWhitespace: 'selection',
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: true,
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
          bracketPairColorization: { enabled: true },
          matchBrackets: 'always',
          formatOnPaste: true,
          formatOnType: true,
          wordWrap: 'off',
          renderLineHighlight: 'all',
          quickSuggestions: { other: true, comments: true, strings: true },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
          wordBasedSuggestions: 'matchingDocuments',
          parameterHints: { enabled: true, cycle: true },
          hover: { enabled: true, delay: 250 },
          lightbulb: { enabled: 'on' },
          inlayHints: { enabled: 'on' },
          unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: true },
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          accessibilitySupport: 'auto',
          'semanticHighlighting.enabled': true,
        }}
      />
    </div>
  );
}
