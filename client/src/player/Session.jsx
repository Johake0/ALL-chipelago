import { useState } from 'react'

function nameFor(players, id) {
  return players.find((p) => p.id === id)?.name || 'someone'
}

function PendingSession({ session, lobby, me, onReady, busy }) {
  const [confirmReady, setConfirmReady] = useState(false)
  const readySet = new Set(session.readyUserIds)
  const myEntry = lobby.find((item) => item.ownerId === me.id)
  const amReady = readySet.has(me.id)
  const unreadyMembers = lobby.filter((item) => !readySet.has(item.ownerId))
  const wouldLockIn = !amReady && myEntry && lobby.length >= 2 && unreadyMembers.length === 1 && unreadyMembers[0].ownerId === me.id

  function clickReady() {
    if (wouldLockIn) {
      setConfirmReady(true)
      return
    }
    onReady(me.id, true)
  }

  function confirmLockIn() {
    setConfirmReady(false)
    onReady(me.id, true)
  }

  return (
    <>
      <p className="lobby-hint">Waiting for everyone in the Lobby to ready up — locks in and opens the Auction once 2+ players are all ready.</p>
      {lobby.map((item) => (
        <div className="hold-row session-row" key={item.id}>
          <span>{readySet.has(item.ownerId) ? '✅' : '⏳'} {item.ownerId === me.id ? 'you' : item.ownerName} — {item.game}</span>
        </div>
      ))}
      {myEntry && (
        amReady ? (
          <button type="button" className="ghost-btn" onClick={() => onReady(me.id, false)} disabled={busy}>Unready</button>
        ) : (
          <button type="button" onClick={clickReady} disabled={busy}>Ready Up</button>
        )
      )}
      {!myEntry && <p className="empty">Add a game to the Lobby to join this session.</p>}

      {confirmReady && (
        <div className="modal-overlay" onClick={() => setConfirmReady(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Start the session?</h3>
            <p>
              You're the last person to ready up — starting the lobby will start the
              auction process with <strong>{lobby.length} players</strong>. Do you want to proceed?
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setConfirmReady(false)}>Not yet</button>
              <button type="button" onClick={confirmLockIn} disabled={busy}>Yes, start it</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function AuctionSession({ session, me, players, onBid, onFinalize, busy }) {
  const { auction } = session
  const [raiseAmount, setRaiseAmount] = useState('')

  const isMember = session.memberUserIds.includes(me.id)
  const droppedSet = new Set(auction.droppedOutUserIds)
  const metSet = new Set(auction.metUserIds)
  const activeBidders = session.memberUserIds.filter((id) => !droppedSet.has(id))
  const iHaveDropped = droppedSet.has(me.id)
  const iAmSoleBidder = activeBidders.length === 1 && activeBidders[0] === me.id
  const rampPhase = auction.stepPercent != null

  const parsedRaise = Number(raiseAmount)
  const validRaise = Number.isInteger(parsedRaise) && parsedRaise > auction.currentMinimum

  return (
    <>
      <div className="auction-summary">
        <p>
          🔨 Auctioning <strong>{auction.game?.name}</strong> (base value 🪙 {auction.game?.coinValue})
        </p>
        <p className="lobby-hint">
          {rampPhase
            ? `Round at ${auction.stepPercent}% of value — current minimum 🪙 ${auction.currentMinimum}. ${metSet.size}/${activeBidders.length} still-active bidders have met it.`
            : `Open bidding — current leading bid 🪙 ${auction.currentMinimum}.`}
        </p>
      </div>

      <div className="session-row-list">
        {session.memberUserIds.map((id) => (
          <div className="hold-row session-row" key={id}>
            <span>
              {droppedSet.has(id) ? '🚪' : metSet.has(id) || (!rampPhase && id !== me.id) ? '🟢' : '🕒'}{' '}
              {id === me.id ? 'you' : nameFor(players, id)}
              {droppedSet.has(id) ? ' — dropped out' : ''}
            </span>
          </div>
        ))}
      </div>

      {!isMember && <p className="empty">Only session members can bid in this auction.</p>}

      {isMember && iHaveDropped && <p className="empty">You've dropped out of this auction.</p>}

      {isMember && !iHaveDropped && iAmSoleBidder && (
        <button type="button" onClick={() => onFinalize()} disabled={busy}>
          Finalize Price at 🪙 {auction.currentMinimum}
        </button>
      )}

      {isMember && !iHaveDropped && !iAmSoleBidder && rampPhase && (
        <div className="lobby-actions">
          <button type="button" onClick={() => onBid('meet', undefined)} disabled={busy || metSet.has(me.id)}>
            {metSet.has(me.id) ? "Meeting it — waiting on others" : `Meet 🪙 ${auction.currentMinimum}`}
          </button>
          <button type="button" className="ghost-btn danger-text" onClick={() => onBid('dropout', undefined)} disabled={busy}>
            Drop Out
          </button>
        </div>
      )}

      {isMember && !iHaveDropped && !iAmSoleBidder && !rampPhase && (
        <form
          className="bid-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!validRaise) return
            onBid('raise', parsedRaise)
            setRaiseAmount('')
          }}
        >
          <label>Raise to
            <input
              type="number"
              min={auction.currentMinimum + 1}
              step="1"
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(e.target.value)}
              placeholder={`> ${auction.currentMinimum}`}
            />
          </label>
          <div className="lobby-actions">
            <button type="submit" disabled={busy || !validRaise}>Raise</button>
            <button type="button" className="ghost-btn danger-text" onClick={() => onBid('dropout', undefined)} disabled={busy}>
              Drop Out
            </button>
          </div>
        </form>
      )}
    </>
  )
}

function ActiveSession({ session, lobby, players }) {
  // A member who's finished/released still has a row in `lobby` now (kept
  // visible in stasis with a ✅/❌ instead of vanishing — see Lobby.jsx), so
  // "still playing" has to check playState, not just presence in the array.
  const stillPlayingIds = new Set(
    lobby.filter((item) => session.memberUserIds.includes(item.ownerId) && item.playState === 'playing').map((item) => item.ownerId)
  )
  const doneCount = session.memberUserIds.length - stillPlayingIds.size
  const waitingOn = session.memberUserIds.filter((id) => stillPlayingIds.has(id)).map((id) => nameFor(players, id))

  return (
    <p className="lobby-hint">
      Session in progress — {doneCount}/{session.memberUserIds.length} players are done.
      {waitingOn.length > 0 && ` Still waiting on ${waitingOn.join(', ')}.`}
    </p>
  )
}

export default function Session({ session, lobby, me, players, onReady, onBid, onFinalize, busy }) {
  if (!session) return null

  return (
    <section className="panel session-panel">
      <h2>Session</h2>
      {session.status === 'pending' && (
        <PendingSession session={session} lobby={lobby} me={me} onReady={onReady} busy={busy} />
      )}
      {session.status === 'auction' && session.auction?.status === 'open' && (
        <AuctionSession session={session} me={me} players={players} onBid={onBid} onFinalize={onFinalize} busy={busy} />
      )}
      {session.status === 'active' && <ActiveSession session={session} lobby={lobby} players={players} />}
    </section>
  )
}
