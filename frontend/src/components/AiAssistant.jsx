import { useState } from 'react';
import { aiAnalyze } from '../api';
import './AiAssistant.css';

export default function AiAssistant({ code, language }) {
  const [mode, setMode] = useState('suggest'); // suggest | explain | debug
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const QUICK_PROMPTS = [
    { label: 'Explain this code', mode: 'explain', question: '' },
    { label: 'Find bugs', mode: 'debug', question: '' },
    { label: 'Suggest improvements', mode: 'suggest', question: '' },
    { label: 'Optimize performance', mode: 'suggest', question: 'Optimize this for performance and readability.' },
    { label: 'Add comments', mode: 'suggest', question: 'Add helpful comments and clarify intent.' },
    { label: 'Convert to async/await', mode: 'suggest', question: 'Convert this to async/await (if applicable).' },
  ];

  const ask = async (q) => {
    const prompt = q || question;
    if (!prompt.trim() && !code.trim()) return;
    setLoading(true);
    setError('');
    setResponse('');
    try {
      const res = await aiAnalyze({ code, language, mode, question: prompt });
      setResponse(res.data.response);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reach AI. Check backend & OpenAI key.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    ask(question);
  };

  return (
    <div className="ai">
      {/* Header */}
      <div className="ai__header">
        <div className="ai__header-icon">🤖</div>
        <div>
          <div className="ai__header-title">AI Assistant</div>
          <div className="ai__header-sub">Powered by OpenAI GPT</div>
        </div>
      </div>

      <div className="ai__modes">
        {[
          { id: 'suggest', label: 'Suggest' },
          { id: 'explain', label: 'Explain' },
          { id: 'debug', label: 'Debug' },
        ].map((m) => (
          <button
            key={m.id}
            className={`ai__mode-btn ${mode === m.id ? 'ai__mode-btn--active' : ''}`}
            onClick={() => setMode(m.id)}
            disabled={loading}
            type="button"
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Quick prompts */}
      <div className="ai__quick">
        <div className="ai__quick-label">Quick Actions</div>
        <div className="ai__quick-grid">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              id={`ai-quick-${p.label.replace(/\s+/g, '-').toLowerCase()}`}
              className="ai__quick-btn"
              onClick={() => {
                setMode(p.mode);
                setQuestion(p.question || p.label);
                ask(p.question || p.label);
              }}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom question */}
      <form className="ai__form" onSubmit={handleSubmit} id="ai-form">
        <textarea
          id="ai-question-input"
          className="ai__textarea input"
          placeholder="Ask anything about the code... e.g. 'Why does this loop not terminate?'"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          disabled={loading}
        />
        <button
          id="ai-ask-btn"
          className="btn btn-primary w-full"
          type="submit"
          disabled={loading || (!question.trim() && !code)}
        >
          {loading ? (
            <span className="ai__spinner" />
          ) : (
            '✨ Ask AI'
          )}
        </button>
      </form>

      {/* Response */}
      {error && (
        <div className="ai__error animate-fade-in">
          ⚠️ {error}
        </div>
      )}
      {response && (
        <div className="ai__response animate-fade-in">
          <div className="ai__response-header">
            <span>🤖 AI Response</span>
            <button
              id="ai-copy-btn"
              className="btn btn-ghost btn-sm"
              onClick={() => { navigator.clipboard.writeText(response); }}
            >
              Copy
            </button>
          </div>
          <pre className="ai__response-body">{response}</pre>
        </div>
      )}
    </div>
  );
}
