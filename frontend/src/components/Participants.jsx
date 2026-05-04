import './Participants.css';

export default function Participants({ users, currentUsername }) {
  return (
    <div className="participants">
      <div className="participants__header">
        <span className="participants__count">{users.length} online</span>
        <span className="dot-live" />
      </div>
      <div className="participants__list">
        {users.length === 0 && (
          <div className="participants__empty">No users in room</div>
        )}
        {users.map((user) => (
          <div key={user.socketId} className="participants__item animate-fade-in">
            <div
              className="participants__avatar"
              style={{ background: user.color, boxShadow: `0 0 12px ${user.color}55` }}
            >
              {user.username[0].toUpperCase()}
            </div>
            <div className="participants__info">
              <div className="participants__name">
                {user.username}
                {user.username === currentUsername && (
                  <span className="participants__you">You</span>
                )}
              </div>
              <div className="participants__status">
                <span className="dot-live" />
                Active
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="participants__invite">
        <div className="participants__invite-label">Invite others</div>
        <div className="participants__invite-hint">
          Share the Room ID from the top bar to invite collaborators.
        </div>
      </div>
    </div>
  );
}
