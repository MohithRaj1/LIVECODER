import { useEffect, useState } from 'react';
import { getRoomAnalytics } from '../api';

export default function Analytics({ roomId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr('');
    try {
      const res = await getRoomAnalytics(roomId);
      setData(res.data);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800 }}>Analytics</div>
        <button className="btn btn-ghost btn-sm" onClick={() => refresh().catch(() => {})} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {err ? <div className="ai__error">⚠️ {err}</div> : null}
      {!data ? (
        <div style={{ opacity: 0.7, fontSize: 13 }}>No analytics yet.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
            Totals:{' '}
            {Object.entries(data.totals || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(' · ')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.users || []).map((u) => (
              <div
                key={`${u.userId}-${u.username}`}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.15)',
                  background: 'rgba(2,6,23,0.35)',
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{u.username}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  Edits: {u.edits} (Δ chars: {u.editDelta}) · Runs: {u.runs} · Chats: {u.chats}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

