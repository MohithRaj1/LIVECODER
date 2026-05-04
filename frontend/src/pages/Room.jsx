import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import socket from '../socket';
import CodeEditor from '../components/CodeEditor';
import Chat from '../components/Chat';
import AiAssistant from '../components/AiAssistant';
import Participants from '../components/Participants';
import './Room.css';

const LANGUAGES = [
  'javascript','typescript','python','java','cpp','go','rust','html','css','sql',
];

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const username = sessionStorage.getItem('lc_username') || 'Anonymous';

  const [code, setCode] = useState('// Loading room...\n');
  const [language, setLanguage] = useState('javascript');
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [sidePanel, setSidePanel] = useState('chat'); // 'chat' | 'ai' | 'participants'

  const codeRef = useRef(code);
  codeRef.current = code;

  // Connect socket
  useEffect(() => {
    if (!username || username === 'Anonymous' && !sessionStorage.getItem('lc_username')) {
      toast.error('Please enter your name first');
      navigate('/');
      return;
    }

    socket.connect();
    socket.emit('join-room', { roomId, username });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('room-joined', ({ code: c, language: l, messages: msgs, users: u }) => {
      setCode(c);
      setLanguage(l);
      setMessages(msgs);
      setUsers(u);
      toast.success(`Joined room ${roomId}`);
    });

    socket.on('code-update', ({ code: c }) => setCode(c));
    socket.on('language-update', ({ language: l }) => setLanguage(l));
    socket.on('new-message', (msg) => setMessages((prev) => [...prev, msg]));
    socket.on('user-joined', ({ users: u }) => setUsers(u));
    socket.on('user-left', ({ users: u }) => setUsers(u));
    socket.on('error', ({ message }) => toast.error(message));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room-joined');
      socket.off('code-update');
      socket.off('language-update');
      socket.off('new-message');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('error');
      socket.disconnect();
    };
  }, [roomId, username, navigate]);

  const handleCodeChange = useCallback((newCode) => {
    setCode(newCode);
    socket.emit('code-change', { roomId, code: newCode });
  }, [roomId]);

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    socket.emit('language-change', { roomId, language: lang });
  };

  const handleSendMessage = (text) => {
    socket.emit('send-message', { roomId, username, text });
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
          <CodeEditor code={code} language={language} onChange={handleCodeChange} />
        </div>

        {/* Side Panel */}
        <aside className="room__aside">
          {/* Panel Tabs */}
          <div className="room__aside-tabs">
            {[
              { id: 'chat', icon: '💬', label: 'Chat' },
              { id: 'ai', icon: '🤖', label: 'AI' },
              { id: 'participants', icon: '👥', label: `People (${users.length})` },
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
          </div>
        </aside>
      </div>
    </div>
  );
}
