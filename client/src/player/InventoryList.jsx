export default function InventoryList({ player, onAddToLobby, hasLobbyEntry, busy }) {
  const empty = player.inventory.length === 0 && !player.forceSlot
  const addDisabled = busy || hasLobbyEntry
  const isBonus = (id) => id === player.bonusGameId

  return (
    <section className="panel">
      <h2 className="hold-heading">Your Hold</h2>
      {empty && <p className="empty">Nothing yet — spin the wheel!</p>}
      {player.forceSlot && (
        <div className={`hold-row forced${isBonus(player.forceSlot.id) ? ' bonus-row' : ''}`}>
          <span>⚔️ {player.forceSlot.game}{isBonus(player.forceSlot.id) && <span className="bonus-tag" title="Bonus game — pays 1.5x if finished">⭐</span>}</span>
          <button onClick={() => onAddToLobby(player.forceSlot.id)} disabled={addDisabled}>Add to Lobby</button>
        </div>
      )}
      {player.inventory.map((item) => (
        <div className={`hold-row${isBonus(item.id) ? ' bonus-row' : ''}`} key={item.id}>
          <span>{item.game}{isBonus(item.id) && <span className="bonus-tag" title="Bonus game — pays 1.5x if finished">⭐</span>}</span>
          <button onClick={() => onAddToLobby(item.id)} disabled={addDisabled}>Add to Lobby</button>
        </div>
      ))}
      {hasLobbyEntry && !empty && (
        <p className="empty">You already have a game in the Lobby — finish or return it there first.</p>
      )}
    </section>
  )
}
