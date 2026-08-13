function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

export default function StatsBar({ player, inventorySize }) {
  return (
    <div className="stats-bar">
      <Stat label="Coins" value={`🪙 ${player.coins}`} />
      <Stat label="Streak" value={`${player.streak} (best ${player.longestStreak})`} />
      <Stat label="Hold" value={`${player.inventoryCount}/${inventorySize}${player.inventoryFull ? ' FULL' : ''}`} />
      <Stat label="Force slot" value={player.forceSlot ? '1/1' : '0/1'} />
      <Stat label="Free picks left" value={player.freeClaimsRemaining} />
    </div>
  )
}
