import { useMemo, useState } from 'react'
import { useGameState } from './useGameState.js'
import { spin, completeGame, claimInterest, trade, force, release, reroll, addToLobby, returnFromLobby, gift } from './playerApi.js'
import Wheel from './Wheel.jsx'
import StatsBar from './StatsBar.jsx'
import InventoryList from './InventoryList.jsx'
import InterestPicks from './InterestPicks.jsx'
import TrophyCase from './TrophyCase.jsx'
import Lobby from './Lobby.jsx'
import Bazaar from './Bazaar.jsx'
import Leaderboard from './Leaderboard.jsx'
import Activity from './Activity.jsx'
import GamesPool from './GamesPool.jsx'
import PassGate from './PassGate.jsx'
import ProfileSelect from './ProfileSelect.jsx'
import Avatar from './Avatar.jsx'
import './player.css'

const PLAYER_KEY = 'archipelago_player_id'
// The wheel's conic-gradient needs one color stop per segment. The pool can
// have 600+ available games, and a gradient with that many stops overflows
// WebRender's vertex texture buffer and crashes the browser (seen in
// practice: "assertion failed: max_block_count <= MAX_VERTEX_TEXTURE_WIDTH").
// The actual winner is still chosen server-side across the full pool — this
// only bounds what's drawn.
const MAX_WHEEL_SEGMENTS = 40

export default function PlayerApp() {
  return (
    <PassGate>
      <PlayerHome />
    </PassGate>
  )
}

function PlayerHome() {
  const { state, error, refresh } = useGameState()
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(PLAYER_KEY) || '')
  const [view, setView] = useState('game') // 'game' | 'activity'
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [spinToken, setSpinToken] = useState(0)
  const [winner, setWinner] = useState('')
  const [spinLocked, setSpinLocked] = useState(false)

  const me = useMemo(() => state?.players.find((p) => p.id === playerId), [state, playerId])
  const myLobbyEntry = useMemo(() => state?.lobby?.find((item) => item.ownerId === playerId), [state, playerId])

  const wheelSegments = useMemo(() => {
    if (!state) return []
    const names = state.games.map((g) => g.name)
    if (names.length <= MAX_WHEEL_SEGMENTS) return names
    const capped = names.slice(0, MAX_WHEEL_SEGMENTS)
    if (winner && !capped.includes(winner)) capped[capped.length - 1] = winner
    return capped
  }, [state, winner])

  function selectPlayer(id) {
    setPlayerId(id)
    localStorage.setItem(PLAYER_KEY, id)
  }

  function switchProfile() {
    setPlayerId('')
    localStorage.removeItem(PLAYER_KEY)
  }

  async function runAction(fn, successMsg) {
    setBusy(true)
    setStatus('')
    try {
      await fn()
      setStatus(successMsg)
      await refresh()
    } catch (err) {
      setStatus(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSpin() {
    if (!me || spinLocked || me.inventoryFull) return
    setSpinLocked(true)
    setStatus('')
    try {
      const result = await spin(me.id)
      setWinner(result.winner)
      setSpinToken((t) => t + 1)
      refresh()
    } catch (err) {
      setStatus(err.message)
      setSpinLocked(false)
    }
  }

  function handleWheelLanded() {
    setSpinLocked(false)
    setStatus(`${me?.name} added ${winner} to their hold!`)
  }

  const handleComplete = (gameId) => runAction(() => completeGame(me.id, gameId), `${me.name} finished a game!`)
  const handleClaimInterest = (gameId) => runAction(() => claimInterest(me.id, gameId), 'Free pick claimed!')
  const handleTrade = ({ gameId, targetUserId, targetGameId }) =>
    runAction(() => trade(me.id, gameId, targetUserId, targetGameId), 'Trade complete!')
  const handleForce = ({ gameId, targetUserId }) =>
    runAction(() => force(me.id, gameId, targetUserId), 'Game forced!')
  const handleRelease = (gameId) => runAction(() => release(me.id, gameId), 'Game released.')
  const handleReroll = (gameId) => runAction(() => reroll(me.id, gameId), 'Game rerolled back into the pool!')
  const handleGift = ({ targetUserId, amount }) =>
    runAction(() => gift(me.id, targetUserId, amount), `Sent ${amount} coins!`)
  const handleAddToLobby = (gameId) => runAction(() => addToLobby(me.id, gameId), `${me.name} added a game to the Lobby!`)
  const handleReturnFromLobby = (gameId) => runAction(() => returnFromLobby(me.id, gameId), 'Game returned to your hold.')

  if (error) return <p className="load-error">Couldn't reach the server: {error}</p>
  if (!state) return <p className="loading">Loading…</p>
  if (state.players.length === 0) return <p className="loading">No players yet — add some in the admin tool.</p>

  return (
    <div className="player-app">
      <header className="hero">
        <p className="eyebrow">Archipelago Randomizer</p>
        <h1>The Wheel</h1>
        {me && (
          <div className="current-player">
            <Avatar player={me} size={40} />
            <span className="current-player-name">{me.name}</span>
            <button type="button" className="switch-profile-btn" onClick={switchProfile}>Switch Profile</button>
          </div>
        )}
      </header>

      {!me ? (
        <ProfileSelect players={state.players} onSelect={selectPlayer} />
      ) : (
        <>
          <nav className="view-tabs">
            <button type="button" className={view === 'game' ? 'active' : ''} onClick={() => setView('game')}>Play</button>
            <button type="button" className={view === 'activity' ? 'active' : ''} onClick={() => setView('activity')}>Activity Feed</button>
          </nav>

          {view === 'activity' ? (
            <Activity />
          ) : (
            <>
              <Wheel
                segments={wheelSegments}
                spinToken={spinToken}
                winner={winner}
                spinning={spinLocked}
                disabled={me.inventoryFull || state.games.length === 0}
                disabledReason={me.inventoryFull ? 'Your hold is full.' : state.games.length === 0 ? 'No games left in the pool.' : ''}
                onSpin={handleSpin}
                onLanded={handleWheelLanded}
              />

              {status && <p className="status-msg">{status}</p>}

              <div className="panel-grid">
                <Lobby lobby={state.lobby} me={me} onComplete={handleComplete} onReturn={handleReturnFromLobby} onRelease={handleRelease} busy={busy} />
                <InventoryList player={me} onAddToLobby={handleAddToLobby} hasLobbyEntry={!!myLobbyEntry} busy={busy} />
              </div>

              <StatsBar player={me} inventorySize={state.inventorySize} />

              <div className="panel-grid">
                <Bazaar
                  me={me}
                  players={state.players}
                  onTrade={handleTrade}
                  onForce={handleForce}
                  onRelease={handleRelease}
                  onReroll={handleReroll}
                  onGift={handleGift}
                  freeRerolls={state.freeRerolls}
                  busy={busy}
                />
                <Leaderboard players={state.players} />
                <TrophyCase player={me} />
              </div>

              {me.freeClaimsRemaining > 0 && (
                <div className="interest-section">
                  <InterestPicks player={me} onClaim={handleClaimInterest} busy={busy} />
                </div>
              )}

              <GamesPool games={state.games} />
            </>
          )}
        </>
      )}
    </div>
  )
}
