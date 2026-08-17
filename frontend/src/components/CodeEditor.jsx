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
export default function CodeEditor({ code, language, roomId, onLocalChange, onOtOp, onRun, onEditorMount, socket, users = [] }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const suppressRef = useRef(false);
  const remoteDecorationsRef = useRef(new Map()); // socketId -> decoration IDs

  const monacoLanguage = LANGUAGE_MAP[language] || 'javascript';
  const ext = MODEL_EXT[language] || 'txt';
  const modelPath = `livecode/${roomId || 'session'}/src/main.${ext}`;

  // Emit local cursor/selection changes
  const emitCursorPosition = useCallback(() => {
    if (!socket || !editorRef.current) return;
    const position = editorRef.current.getPosition();
    const selection = editorRef.current.getSelection();
    if (!position) return;

    socket.emit('cursor-move', {
      roomId,
      cursor: { position, selection },
      username: sessionStorage.getItem('lc_username') || 'Anonymous',
    });
  }, [socket, roomId]);

  const handleBeforeMount = useCallback((monaco) => {
    configureMonacoLanguageServices(monaco);
  }, []);

  const handleMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      if (onEditorMount) onEditorMount(editor);
      editor.focus();

      const model = editor.getModel();
      if (!model) return;


      model.onDidChangeContent((e) => {
        if (suppressRef.current) return;
        const newCode = model.getValue();
        const callback = onLocalChange || onOtOp;
        for (const ch of e.changes) {
          const start = model.getOffsetAt(ch.range.getStartPosition());
          const end = model.getOffsetAt(ch.range.getEndPosition());
          const op = { pos: start, del: Math.max(0, end - start), ins: ch.text || '' };
          if (callback) {
            callback(newCode, op);
          }
        }
      });

      // Listen to cursor position / selection changes
      editor.onDidChangeCursorPosition(() => {
        emitCursorPosition();
      });
      editor.onDidChangeCursorSelection(() => {
        emitCursorPosition();
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

      // Cmd/Ctrl+Enter — Run Code shortcut
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (onRun) onRun();
      });
    },
    [onLocalChange, onOtOp, onRun, emitCursorPosition]
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

  // Handle real-time collaborative updates (OT and Cursors) via Socket.IO
  useEffect(() => {
    if (!socket) return;

    // Handle remote OT operations precisely
    const onOtApply = ({ op, sender }) => {
      if (socket.id === sender) return;
      const editor = editorRef.current;
      const model = editor?.getModel?.();
      const monaco = monacoRef.current;
      if (!editor || !model || !monaco || !op) return;

      suppressRef.current = true;
      const startPos = model.getPositionAt(op.pos);
      const endPos = model.getPositionAt(op.pos + op.del);
      const range = new monaco.Range(
        startPos.lineNumber,
        startPos.column,
        endPos.lineNumber,
        endPos.column
      );

      editor.executeEdits('remote-ot', [
        {
          range,
          text: op.ins,
          forceMoveMarkers: true,
        },
      ]);
      suppressRef.current = false;
    };

    // Handle remote cursor updates
    const onCursorUpdate = ({ socketId, cursor, username, color }) => {
      if (!editorRef.current || socket.id === socketId || !cursor) return;
      const monaco = monacoRef.current;
      if (!monaco) return;

      // 1. Create or update style element for the user's cursor color
      const styleId = `remote-cursor-style-${socketId}`;
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.innerHTML = `
        .remote-cursor-${socketId} {
          border-left: 2px solid ${color || '#00d4ff'};
          position: relative;
        }
        .remote-cursor-selection-${socketId} {
          background-color: ${(color || '#00d4ff')}33 !important;
        }
        .remote-cursor-tooltip-${socketId}::after {
          content: "${username}";
          position: absolute;
          top: -20px;
          left: 0;
          background: ${color || '#00d4ff'};
          color: #111;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          z-index: 10;
          font-family: sans-serif;
          font-weight: bold;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .remote-cursor-${socketId}:hover .remote-cursor-tooltip-${socketId}::after {
          opacity: 1;
        }
      `;

      // 2. Generate decorations for position & selection
      const newDecorations = [];
      if (cursor.position) {
        newDecorations.push({
          range: new monaco.Range(
            cursor.position.lineNumber,
            cursor.position.column,
            cursor.position.lineNumber,
            cursor.position.column
          ),
          options: {
            className: `remote-cursor-${socketId}`,
            before: {
              content: '',
              inlineClassName: `remote-cursor-tooltip-${socketId}`,
            },
          },
        });
      }

      if (cursor.selection && (
        cursor.selection.startLineNumber !== cursor.selection.endLineNumber ||
        cursor.selection.startColumn !== cursor.selection.endColumn
      )) {
        newDecorations.push({
          range: new monaco.Range(
            cursor.selection.startLineNumber,
            cursor.selection.startColumn,
            cursor.selection.endLineNumber,
            cursor.selection.endColumn
          ),
          options: {
            className: `remote-cursor-selection-${socketId}`,
          },
        });
      }

      const oldDecorations = remoteDecorationsRef.current.get(socketId) || [];
      const updatedDecorations = editorRef.current.deltaDecorations(oldDecorations, newDecorations);
      remoteDecorationsRef.current.set(socketId, updatedDecorations);
    };

    socket.on('ot-apply', onOtApply);
    socket.on('cursor-update', onCursorUpdate);

    return () => {
      socket.off('ot-apply', onOtApply);
      socket.off('cursor-update', onCursorUpdate);

      // Clean up all styles and decorations when unmounted
      for (const socketId of remoteDecorationsRef.current.keys()) {
        document.getElementById(`remote-cursor-style-${socketId}`)?.remove();
        const oldDecs = remoteDecorationsRef.current.get(socketId) || [];
        if (editorRef.current && oldDecs.length > 0) {
          editorRef.current.deltaDecorations(oldDecs, []);
        }
      }
    };
  }, [socket]);

  // Cleanup stale remote cursors/styles when users list changes
  useEffect(() => {
    if (!users) return;
    const activeSocketIds = new Set(users.map((u) => u.socketId));
    for (const socketId of remoteDecorationsRef.current.keys()) {
      if (!activeSocketIds.has(socketId)) {
        const oldDecs = remoteDecorationsRef.current.get(socketId) || [];
        if (editorRef.current && oldDecs.length > 0) {
          editorRef.current.deltaDecorations(oldDecs, []);
        }
        remoteDecorationsRef.current.delete(socketId);
        document.getElementById(`remote-cursor-style-${socketId}`)?.remove();
      }
    }
  }, [users]);

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
