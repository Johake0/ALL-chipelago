export default function InterestPicks({ player, onClaim, busy }) {
  const noPicksLeft = player.freeClaimsRemaining <= 0

  return (
    <section className="panel">
      <h2>Free Starting Picks</h2>
      {noPicksLeft && <p className="empty">No free picks left.</p>}
      {!noPicksLeft && player.interestPicksAvailable.length === 0 && (
        <p className="empty">Nothing on your interest list is available right now.</p>
      )}
      {player.interestPicksAvailable.map((g) => (
        <div className="hold-row" key={g.id}>
          <span>{g.game}</span>
          <button onClick={() => onClaim(g.id)} disabled={busy || noPicksLeft}>Claim (free)</button>
        </div>
      ))}
    </section>
  )
}
