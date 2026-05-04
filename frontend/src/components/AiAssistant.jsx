import { useState } from 'react';
import { getAISuggestion } from '../api';
import './AiAssistant.css';

export default function AiAssistant({ code, language }) {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const QUICK_PROMPTS = [
    'Explain this code',
    'Find bugs',
    'Optimize performance',
    'Add comments',
    'Suggest improvements',
    'Convert to async/await',
  ];

  const ask = async (q) => {
    const prompt = q || question;
    if (!prompt.trim() && !code.trim()) return;
    setLoading(true);
    setError('');
    setResponse('');
    try {
      const res = await getAISuggestion({ code, language, question: prompt });
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

      {/* Quick prompts */}
      <div className="ai__quick">
        <div className="ai__quick-label">Quick Actions</div>
        <div className="ai__quick-grid">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              id={`ai-quick-${p.replace(/\s+/g, '-').toLowerCase()}`}
              className="ai__quick-btn"
              onClick={() => { setQuestion(p); ask(p); }}
              disabled={loading}
            >
              {p}
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
