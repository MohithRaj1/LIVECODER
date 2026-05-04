import { useState, useEffect, useRef } from 'react';
import './Chat.css';

const formatTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function Chat({ messages, username, onSend, socket, roomId }) {
  const [text, setText] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  useEffect(() => {
    socket.on('user-typing', ({ username: u, isTyping }) => {
      setTypingUsers((prev) =>
        isTyping ? [...new Set([...prev, u])] : prev.filter((x) => x !== u)
      );
    });
    return () => socket.off('user-typing');
  }, [socket]);

  const handleTyping = (e) => {
    setText(e.target.value);
    socket.emit('typing', { roomId, username, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing', { roomId, username, isTyping: false });
    }, 1500);
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
    socket.emit('typing', { roomId, username, isTyping: false });
  };

  const getTypeStyle = (type) => {
    if (type === 'system') return 'chat__msg--system';
    if (type === 'ai') return 'chat__msg--ai';
    return '';
  };

  return (
    <div className="chat">
      <div className="chat__messages">
        {messages.length === 0 && (
          <div className="chat__empty">
            <span>💬</span>
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isOwn = msg.username === username && msg.type === 'user';
          return (
            <div
              key={msg._id || i}
              className={`chat__msg ${isOwn ? 'chat__msg--own' : ''} ${getTypeStyle(msg.type)} animate-fade-in`}
            >
              {msg.type === 'system' ? (
                <div className="chat__system-text">{msg.text}</div>
              ) : (
                <>
                  {!isOwn && (
                    <div className="chat__sender">{msg.username}</div>
                  )}
                  <div className="chat__bubble">{msg.text}</div>
                  <div className="chat__time">{formatTime(msg.timestamp)}</div>
                </>
              )}
            </div>
          );
        })}
        {typingUsers.filter(u => u !== username).length > 0 && (
          <div className="chat__typing">
            <span className="chat__typing-dots">
              <span /><span /><span />
            </span>
            {typingUsers.filter(u => u !== username).join(', ')} typing...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat__input-wrap" onSubmit={handleSend} id="chat-form">
        <input
          id="chat-input"
          className="input chat__input"
          placeholder="Type a message..."
          value={text}
          onChange={handleTyping}
          autoComplete="off"
          maxLength={500}
        />
        <button id="chat-send-btn" type="submit" className="btn btn-primary btn-icon" disabled={!text.trim()}>
          ➤
        </button>
      </form>
    </div>
  );
}
