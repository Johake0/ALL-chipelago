export default function InventoryList({ player, onAddToLobby, hasLobbyEntry, busy }) {
  const empty = player.inventory.length === 0 && !player.forceSlot
  const addDisabled = busy || hasLobbyEntry

  return (
    <section className="panel">
      <h2>Your Hold</h2>
      {empty && <p className="empty">Nothing yet — spin the wheel!</p>}
      {player.forceSlot && (
        <div className="hold-row forced">
          <span>⚔️ {player.forceSlot.game}</span>
          <button onClick={() => onAddToLobby(player.forceSlot.id)} disabled={addDisabled}>Add to Lobby</button>
        </div>
      )}
      {player.inventory.map((item) => (
        <div className="hold-row" key={item.id}>
          <span>{item.game}</span>
          <button onClick={() => onAddToLobby(item.id)} disabled={addDisabled}>Add to Lobby</button>
        </div>
      ))}
      {hasLobbyEntry && !empty && (
        <p className="empty">You already have a game in the Lobby — finish or return it there first.</p>
      )}
    </section>
  )
}
