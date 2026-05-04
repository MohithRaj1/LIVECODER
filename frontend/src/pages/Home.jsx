import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createRoom, getRoom } from '../api';
import './Home.css';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
];

const FEATURES = [
  { icon: '⚡', title: 'Real-Time Sync', desc: 'Every keystroke synced instantly across all collaborators via Socket.IO.' },
  { icon: '🤖', title: 'AI Assistant', desc: 'OpenAI-powered code suggestions, debugging, and explanations built in.' },
  { icon: '💬', title: 'Live Chat', desc: 'Built-in group chat so you can discuss code without leaving the editor.' },
  { icon: '🌍', title: '10+ Languages', desc: 'Support for JavaScript, Python, Java, Go, Rust, and more.' },
];

export default function Home() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('create');
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!username.trim()) return toast.error('Please enter your name');
    setLoading(true);
    try {
      const res = await createRoom({ name: roomName || 'My Room', language });
      const roomId = res.data.room.roomId;
      sessionStorage.setItem('lc_username', username.trim());
      toast.success(`Room ${roomId} created!`);
      navigate(`/room/${roomId}`);
    } catch {
      toast.error('Failed to create room. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!username.trim()) return toast.error('Please enter your name');
    if (!joinRoomId.trim()) return toast.error('Please enter a Room ID');
    setLoading(true);
    try {
      await getRoom(joinRoomId.trim().toUpperCase());
      sessionStorage.setItem('lc_username', username.trim());
      navigate(`/room/${joinRoomId.trim().toUpperCase()}`);
    } catch {
      toast.error('Room not found. Double-check the Room ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home">
      {/* Background orbs */}
      <div className="home__orb home__orb--1" />
      <div className="home__orb home__orb--2" />
      <div className="home__orb home__orb--3" />

      {/* Navbar */}
      <nav className="home__nav">
        <div className="home__logo">
          <span className="home__logo-icon">{'</>'}</span>
          <span className="home__logo-text">LiveCode</span>
        </div>
        <div className="badge badge-green">
          <span className="dot-live" /> Live Platform
        </div>
      </nav>

      <main className="home__main">
        {/* Hero */}
        <section className="home__hero animate-fade-in">
          <div className="badge badge-cyan" style={{ marginBottom: '20px' }}>
            ✨ Real-Time Collaboration
          </div>
          <h1 className="home__title">
            Code Together,<br />
            <span className="text-gradient">Ship Faster</span>
          </h1>
          <p className="home__subtitle">
            LiveCode is the collaborative coding platform for developers, students, and teams.
            Write, debug, and ship code together — in real time.
          </p>
        </section>

        {/* Card */}
        <section className="home__card-wrap animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="home__card card-glass">
            {/* Tabs */}
            <div className="home__tabs">
              <button
                id="tab-create"
                className={`home__tab ${tab === 'create' ? 'home__tab--active' : ''}`}
                onClick={() => setTab('create')}
              >
                + Create Room
              </button>
              <button
                id="tab-join"
                className={`home__tab ${tab === 'join' ? 'home__tab--active' : ''}`}
                onClick={() => setTab('join')}
              >
                → Join Room
              </button>
            </div>

            {tab === 'create' ? (
              <form className="home__form" onSubmit={handleCreate} id="form-create">
                <div className="home__field">
                  <label className="home__label">Your Name</label>
                  <input
                    id="input-username-create"
                    className="input"
                    placeholder="e.g. Alex Chen"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={24}
                  />
                </div>
                <div className="home__field">
                  <label className="home__label">Room Name <span className="text-muted">(optional)</span></label>
                  <input
                    id="input-room-name"
                    className="input"
                    placeholder="e.g. Sprint Planning Session"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    maxLength={40}
                  />
                </div>
                <div className="home__field">
                  <label className="home__label">Language</label>
                  <select
                    id="select-language"
                    className="select w-full"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <button id="btn-create-room" className="btn btn-primary btn-lg w-full" disabled={loading}>
                  {loading ? '⏳ Creating...' : '🚀 Create Room'}
                </button>
              </form>
            ) : (
              <form className="home__form" onSubmit={handleJoin} id="form-join">
                <div className="home__field">
                  <label className="home__label">Your Name</label>
                  <input
                    id="input-username-join"
                    className="input"
                    placeholder="e.g. Jordan Lee"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={24}
                  />
                </div>
                <div className="home__field">
                  <label className="home__label">Room ID</label>
                  <input
                    id="input-room-id"
                    className="input text-mono"
                    placeholder="e.g. A1B2C3D4"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                    maxLength={8}
                    style={{ letterSpacing: '0.15em', fontSize: '16px' }}
                  />
                </div>
                <button id="btn-join-room" className="btn btn-primary btn-lg w-full" disabled={loading}>
                  {loading ? '⏳ Joining...' : '→ Join Room'}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Features */}
        <section className="home__features animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="home__feature-card card">
              <div className="home__feature-icon">{f.icon}</div>
              <h3 className="home__feature-title">{f.title}</h3>
              <p className="home__feature-desc">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="home__footer">
        <p>Built with ❤️ using React · Node.js · Socket.IO · Monaco Editor · OpenAI</p>
      </footer>
    </div>
  );
}
