import { avatarUrl } from '../api.js'

const COLORS = ['#7c5cff', '#2dd4bf', '#f97316', '#ec4899', '#22c55e', '#eab308']

function colorFor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[hash % COLORS.length]
}

export default function Avatar({ player, size = 96 }) {
  const style = { width: size, height: size, fontSize: size * 0.42 }

  if (player.hasAvatar) {
    return <img className="avatar-img" style={style} src={avatarUrl(player.id, player.avatarUpdatedAt)} alt={player.name} />
  }

  return (
    <div className="avatar-fallback" style={{ ...style, background: colorFor(player.name) }}>
      {player.name.charAt(0).toUpperCase()}
    </div>
  )
}
