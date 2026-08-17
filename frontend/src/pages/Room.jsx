import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import socket, { setSocketAuth } from '../socket';
import { executeCode } from '../api';
import CodeEditor from '../components/CodeEditor';
import Chat from '../components/Chat';
import AiAssistant from '../components/AiAssistant';
import Participants from '../components/Participants';
import Analytics from '../components/Analytics';
import VoiceChat from '../components/VoiceChat';
import './Room.css';

const LANGUAGES = [
  'javascript','typescript','python','java','cpp','go','rust','html','css','sql',
];

function detectLanguage(code, currentLang) {
  if (typeof code !== 'string') return currentLang;
  const trimmed = code.trim();
  if (/public\s+class\s+\w+|System\.out\.print|public\s+static\s+void\s+main/i.test(trimmed)) {
    return 'java';
  }
  if (/#include\s*<iostream>|std::cout|using\s+namespace\s+std/i.test(trimmed)) {
    return 'cpp';
  }
  if (/#include\s*<stdio\.h>|printf\s*\(/i.test(trimmed)) {
    return 'c';
  }
  if (/package\s+main|func\s+main\s*\(/i.test(trimmed)) {
    return 'go';
  }
  if (/fn\s+main\s*\(\)|println!\s*\(/i.test(trimmed)) {
    return 'rust';
  }
  if (/(?:def\s+\w+\s*\(|if\s+__name__\s*==\s*['"]__main__['"]|import\s+sys)/i.test(trimmed) && !/const\s+|let\s+|var\s+|function\s+/.test(trimmed)) {
    return 'python';
  }
  if (/(?:CREATE\s+TABLE|SELECT\s+[\s\S]+FROM|INSERT\s+INTO)/i.test(trimmed)) {
    return 'sql';
  }
  return currentLang;
}

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const username = sessionStorage.getItem('lc_username') || 'Anonymous';
  const token = localStorage.getItem('lc_token');

  const [code, setCode] = useState('// Loading room...\n');
  const [rev, setRev] = useState(0);
  const [language, setLanguage] = useState('javascript');
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [sidePanel, setSidePanel] = useState('chat');
  const [output, setOutput] = useState('');
  const [stdin, setStdin] = useState('');
  const [executing, setExecuting] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [execMeta, setExecMeta] = useState({ status: null, time: null, memory: null, error: null, fallback: false });

  const revRef = useRef(rev);
  const codeRef = useRef(code);
  const joinedRef = useRef(false);

  useEffect(() => { revRef.current = rev; }, [rev]);
  useEffect(() => { codeRef.current = code; }, [code]);

  const handleDownloadCode = () => {
    const fileExts = {
      javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
      cpp: 'cpp', go: 'go', rust: 'rs', html: 'html', css: 'css', sql: 'sql'
    };
    const ext = fileExts[language] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `room_${roomId}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded room_${roomId}.${ext}`);
  };

  // Connect socket — runs once
  useEffect(() => {
    if (!token) {
      toast.error('Please login first');
      navigate('/');
      return;
    }

    // Guard against React StrictMode double-mount
    if (joinedRef.current) return;
    joinedRef.current = true;

    setSocketAuth(token);
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join-room', { roomId, token });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onRoomJoined = ({ code: c, language: l, messages: msgs, users: u }) => {
      setCode(c || '');
      setRev(0);
      setLanguage(l || 'javascript');
      setMessages(msgs || []);
      setUsers(u || []);
      toast.success(`Joined room ${roomId}`);
    };

    // Remote OT: Only update the React state.
    // CodeEditor watches the `code` prop and applies it properly.
    const onOtApply = ({ op, rev: nextRev, sender }) => {
      if (!op) return;
      if (typeof nextRev === 'number') setRev(nextRev);
      // Only apply remote ops (sender !== us) to state
      if (socket.id !== sender) {
        setCode((prev) => applyOpToText(prev, op));
      }
    };

    const onLanguageUpdate = ({ language: l }) => setLanguage(l);
    const onNewMessage = (msg) => setMessages((prev) => [...prev, msg]);
    const onUserJoined = ({ users: u }) => setUsers(u);
    const onUserLeft = ({ users: u }) => setUsers(u);
    const onError = ({ message }) => toast.error(message);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room-joined', onRoomJoined);
    socket.on('ot-apply', onOtApply);
    socket.on('language-update', onLanguageUpdate);
    socket.on('new-message', onNewMessage);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room-joined', onRoomJoined);
      socket.off('ot-apply', onOtApply);
      socket.off('language-update', onLanguageUpdate);
      socket.off('new-message', onNewMessage);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('error', onError);
      socket.disconnect();
      joinedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token]);

  // Called by CodeEditor when the user types locally
  const handleLocalChange = useCallback(
    (newCode, op) => {
      setCode(newCode);
      if (op) {
        socket.emit('ot-op', { roomId, baseRev: revRef.current, op });
      }
    },
    [roomId]
  );

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    socket.emit('language-change', { roomId, language: lang });
  };

  const handleSendMessage = (text) => {
    socket.emit('send-message', { roomId, username, text });
  };

  const terminalBodyRef = useRef(null);
  const editorInstanceRef = useRef(null);

  useEffect(() => {
    if (terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [output]);

  const handleCopyOutput = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast.success('Terminal output copied!');
  };

  const handleRun = async (overrideCode) => {
    const current = (typeof overrideCode === 'string' && overrideCode.trim())
      ? overrideCode
      : (editorInstanceRef.current ? editorInstanceRef.current.getValue() : codeRef.current);

    if (!current || !current.trim()) return toast.error('Code is empty!');

    let targetLang = language;
    const detected = detectLanguage(current, language);
    if (detected !== language) {
      targetLang = detected;
      setLanguage(detected);
      socket.emit('language-change', { roomId, language: detected });
      toast.success(`Auto-switched language to ${detected.toUpperCase()}`);
    }

    if (targetLang === 'html' || targetLang === 'css') {
      setShowTerminal(true);
      setExecMeta({ status: 'Live Preview Active', time: '0.00', memory: '0 KB', error: null, fallback: false });
      return;
    }
    setExecuting(true);
    setShowTerminal(true);
    setOutput('🚀 Running...\n');
    setExecMeta({ status: null, time: null, memory: null, error: null, fallback: false });
    try {
      const res = await executeCode({ roomId, code: current, language: targetLang, stdin });
      setOutput(res.data.output || 'No output');
      setExecMeta({
        status: res.data.status || (res.data.error ? 'Error' : 'Accepted'),
        time: res.data.time,
        memory: res.data.memory,
        error: res.data.error,
        fallback: res.data.fallback,
      });
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Execution failed';
      setOutput(`❌ Error: ${errMsg}`);
      setExecMeta({ status: 'Failed', time: null, memory: null, error: errMsg, fallback: false });
    } finally {
      setExecuting(false);
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room ID copied!');
  };

  const leaveRoom = () => {
    socket.disconnect();
    navigate('/');
  };

  return (
    <div className="room">
      {/* Top Bar */}
      <header className="room__header">
        <div className="room__header-left">
          <button id="btn-home" className="room__logo-btn" onClick={leaveRoom} title="Go Home">
            <span className="room__logo-icon">{'</>'}</span>
            <span className="room__logo-name">LiveCode</span>
          </button>
          <div className="room__divider" />
          <div className="room__id-wrap">
            <span className="room__id-label">Room</span>
            <code className="room__id" id="room-id-display">{roomId}</code>
            <button id="btn-copy-room" className="btn btn-ghost btn-sm btn-icon" onClick={copyRoomId} title="Copy Room ID">
              📋
            </button>
          </div>
          <div className={`room__status ${connected ? 'room__status--online' : 'room__status--offline'}`}>
            <span className={connected ? 'dot-live' : 'dot-offline'} />
            {connected ? 'Live' : 'Disconnected'}
          </div>
        </div>

        <div className="room__header-center">
          <select
            id="select-lang"
            className="select"
            value={language}
            onChange={handleLanguageChange}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div className="room__header-right">
          <button id="btn-download" className="btn btn-ghost btn-sm" onClick={handleDownloadCode} title="Download File">
            📥 Download
          </button>
          <button id="btn-run" className={`btn btn-primary btn-sm ${executing ? 'executing' : ''}`} onClick={() => handleRun()} disabled={executing}>
            {executing ? '⏳ Running' : '▶ Run'}
          </button>
          <div className="room__divider" />
          <div className="room__users-pill">
            {users.slice(0, 4).map((u) => (
              <div
                key={u.socketId}
                className="room__user-avatar"
                style={{ background: u.color, borderColor: u.color }}
                title={u.username}
              >
                {u.username[0].toUpperCase()}
              </div>
            ))}
            {users.length > 4 && (
              <div className="room__user-avatar room__user-avatar--more">+{users.length - 4}</div>
            )}
          </div>
          <button id="btn-leave" className="btn btn-ghost btn-sm" onClick={leaveRoom}>
            ← Leave
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="room__body">
        {/* Editor */}
        <div className="room__editor-wrap">
          <CodeEditor
            code={code}
            language={language}
            roomId={roomId}
            onLocalChange={handleLocalChange}
            onRun={handleRun}
            onEditorMount={(ed) => { editorInstanceRef.current = ed; }}
            socket={socket}
            users={users}
          />

          
          {/* Terminal / Output */}
          <div className={`room__terminal ${showTerminal ? 'room__terminal--show' : ''}`}>
            <div className="room__terminal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>{language === 'html' || language === 'css' ? 'Live Preview' : 'Terminal Output'}</span>
                {execMeta.status && (
                  <span className={`badge ${execMeta.error ? 'badge-red' : execMeta.fallback || String(execMeta.status).includes('Local') ? 'badge-yellow' : 'badge-green'}`}>
                    {execMeta.status}
                  </span>
                )}
                {execMeta.time != null && (
                  <span className="text-muted" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    ⏱️ {execMeta.time}s
                  </span>
                )}
                {execMeta.memory != null && (
                  <span className="text-muted" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    🧠 {typeof execMeta.memory === 'number' ? (execMeta.memory > 1000 ? `${(execMeta.memory / 1024).toFixed(1)} MB` : `${execMeta.memory} KB`) : execMeta.memory}
                  </span>
                )}
              </div>
              <div className="room__terminal-actions">
                {language !== 'html' && language !== 'css' && (
                  <>
                    <button id="btn-copy-output" onClick={handleCopyOutput} title="Copy Output">📋 Copy</button>
                    <button id="btn-clear-output" onClick={() => { setOutput(''); setExecMeta({ status: null, time: null, memory: null, error: null, fallback: false }); }} title="Clear Output">🧹 Clear</button>
                  </>
                )}
                <button id="btn-close-terminal" onClick={() => setShowTerminal(false)}>✕ Close</button>
              </div>
            </div>
            {language === 'html' || language === 'css' ? (
              <iframe
                className="room__terminal-body room__terminal-preview"
                srcDoc={
                  language === 'html'
                    ? code
                    : `<html><head><style>${code}</style></head><body style="background:#1e1e2e;color:#cdd6f4;font-family:sans-serif;padding:20px;"><h2>CSS Live Preview</h2><p>Preview of your styles:</p><button class="btn">Mock Button</button><div class="card" style="margin-top:15px;padding:15px;border:1px dashed #f38ba8;border-radius:6px;">Mock Card</div></body></html>`
                }
                title="Live Preview"
                sandbox="allow-scripts"
                style={{ width: '100%', height: 'calc(100% - 36px)', border: 'none', background: '#ffffff' }}
              />
            ) : (
              <div style={{ height: 'calc(100% - 36px)', display: 'flex', flexDirection: 'column' }}>
                <pre ref={terminalBodyRef} className="room__terminal-body" style={{ flex: 1, margin: 0, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{output || 'Waiting for output...'}</pre>
                <div style={{ padding: '6px 12px', background: '#181825', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#a6adc8', whiteSpace: 'nowrap' }}>Standard Input (stdin):</span>
                  <input
                    id="terminal-stdin-input"
                    type="text"
                    className="input"
                    style={{ flex: 1, height: 28, fontSize: 12, padding: '2px 8px' }}
                    placeholder="Enter input for your program..."
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel */}
        <aside className="room__aside">
          {/* Panel Tabs */}
          <div className="room__aside-tabs">
            {[
              { id: 'chat', icon: '💬', label: 'Chat' },
              { id: 'ai', icon: '🤖', label: 'AI' },
              { id: 'participants', icon: '👥', label: `People (${users.length})` },
              { id: 'analytics', icon: '📊', label: 'Analytics' },
              { id: 'voice', icon: '🎙️', label: 'Voice' },
            ].map((tab) => (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                className={`room__aside-tab ${sidePanel === tab.id ? 'room__aside-tab--active' : ''}`}
                onClick={() => setSidePanel(tab.id)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className="room__aside-content">
            {sidePanel === 'chat' && (
              <Chat
                messages={messages}
                username={username}
                onSend={handleSendMessage}
                socket={socket}
                roomId={roomId}
              />
            )}
            {sidePanel === 'ai' && (
              <AiAssistant code={code} language={language} />
            )}
            {sidePanel === 'participants' && (
              <Participants users={users} currentUsername={username} />
            )}
            {sidePanel === 'analytics' && (
              <Analytics roomId={roomId} />
            )}
            {sidePanel === 'voice' && (
              <VoiceChat socket={socket} users={users} currentUsername={username} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function applyOpToText(text, op) {
  const pos = Math.max(0, Math.min(text.length, Number(op.pos) || 0));
  const del = Math.max(0, Math.min(text.length - pos, Number(op.del) || 0));
  const ins = typeof op.ins === 'string' ? op.ins : '';
  return text.slice(0, pos) + ins + text.slice(pos + del);
}
