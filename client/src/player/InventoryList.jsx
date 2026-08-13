export default function InventoryList({ player, onComplete, busy }) {
  const empty = player.inventory.length === 0 && !player.forceSlot

  return (
    <section className="panel">
      <h2>Your Hold</h2>
      {empty && <p className="empty">Nothing yet — spin the wheel!</p>}
      {player.forceSlot && (
        <div className="hold-row forced">
          <span>⚔️ {player.forceSlot.game}</span>
          <button onClick={() => onComplete(player.forceSlot.id)} disabled={busy}>Mark Finished</button>
        </div>
      )}
      {player.inventory.map((item) => (
        <div className="hold-row" key={item.id}>
          <span>{item.game}</span>
          <button onClick={() => onComplete(item.id)} disabled={busy}>Mark Finished</button>
        </div>
      ))}
    </section>
  )
}
