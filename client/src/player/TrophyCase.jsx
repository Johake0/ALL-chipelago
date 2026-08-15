export default function TrophyCase({ player }) {
  return (
    <section className="panel trophy-panel">
      <h2>Trophy Case</h2>
      {player.completedGames.length === 0 && <p className="empty">Nothing finished yet.</p>}
      {player.completedGames.map((g) => (
        <div className="hold-row" key={g.id}>
          <span>{g.status === 'released' ? '🏳️' : '🏆'} {g.game}</span>
          <span className="coin-tag">🪙 {g.coinValue}</span>
        </div>
      ))}
    </section>
  )
}
