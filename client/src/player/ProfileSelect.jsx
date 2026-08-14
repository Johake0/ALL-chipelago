import Avatar from './Avatar.jsx'

export default function ProfileSelect({ players, onSelect }) {
  return (
    <div className="profile-select">
      <h2>Who's playing?</h2>
      <div className="profile-grid">
        {players.map((p) => (
          <button key={p.id} type="button" className="profile-card" onClick={() => onSelect(p.id)}>
            <Avatar player={p} size={120} />
            <span className="profile-name">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
