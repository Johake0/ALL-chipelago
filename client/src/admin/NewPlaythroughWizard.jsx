import { useEffect, useMemo, useState } from 'react'
import { adminFetch, adminUploadPlaythroughXlsx, adminConfirmPlaythrough } from '../api.js'

const STEP_LABELS = ['Upload catalog', 'Pick games', 'Players', 'Free picks', 'Features', 'Confirm']

export default function NewPlaythroughWizard() {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resultMessage, setResultMessage] = useState('')

  // Step 0/1 — parsed candidates + per-name selection state.
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected] = useState({}) // name -> { checked, coinValue }
  const [filter, setFilter] = useState('')

  // Step 2 — draft roster, not written until Confirm. { id: existing user's
  // _id or null for a new player, username }.
  const [roster, setRoster] = useState([])
  const [newPlayerName, setNewPlayerName] = useState('')

  // Step 3 — mirrors the old Excel sheet's "each player picks a few free
  // starting games" step, using the same mechanism as the app's existing
  // Free Interest Picks feature. gameName -> rosterIndex (number) or
  // undefined/'' for unassigned. A game can only be reserved for one
  // player, hence a single value per name rather than a list.
  const [freePicks, setFreePicks] = useState({})
  const [freePickFilter, setFreePickFilter] = useState('')

  // Step 4
  const [bonusGameEnabled, setBonusGameEnabled] = useState(true)
  const [auctionEnabled, setAuctionEnabled] = useState(true)

  // Step 5
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    adminFetch('/api/users')
      .then((users) => setRoster(users.map((u) => ({ id: u._id, username: u.username }))))
      .catch((err) => setError(err.message))
  }, [])

  async function handleUpload(file) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const { candidates } = await adminUploadPlaythroughXlsx(file)
      setCandidates(candidates)
      const initial = {}
      for (const c of candidates) {
        initial[c.name] = { checked: false, coinValue: c.currentCoinValue ?? '' }
      }
      setSelected(initial)
      setStep(1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(
    () => candidates.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())),
    [candidates, filter]
  )
  const selectedCount = Object.values(selected).filter((v) => v.checked).length

  function toggleGame(name, checked) {
    setSelected((prev) => ({ ...prev, [name]: { ...prev[name], checked } }))
  }
  function setCoinValue(name, coinValue) {
    setSelected((prev) => ({ ...prev, [name]: { ...prev[name], coinValue } }))
  }
  function selectAllFiltered(checked) {
    setSelected((prev) => {
      const next = { ...prev }
      for (const c of filtered) next[c.name] = { ...next[c.name], checked }
      return next
    })
  }

  function addPlayer() {
    if (!newPlayerName.trim()) return
    setRoster((prev) => [...prev, { id: null, username: newPlayerName.trim() }])
    setNewPlayerName('')
  }
  function renamePlayer(index, username) {
    setRoster((prev) => prev.map((p, i) => (i === index ? { ...p, username } : p)))
  }
  function removePlayer(index) {
    setRoster((prev) => prev.filter((_, i) => i !== index))
    // Keep freePicks' rosterIndex references valid after the array shifts —
    // clear anything pointing at the removed player, shift down anything
    // pointing past it.
    setFreePicks((prev) => {
      const next = {}
      for (const [gameName, idx] of Object.entries(prev)) {
        if (idx === index) continue
        next[gameName] = idx > index ? idx - 1 : idx
      }
      return next
    })
  }

  const pickedGames = useMemo(
    () => Object.entries(selected).filter(([, v]) => v.checked).map(([name]) => name),
    [selected]
  )
  const filteredPickedGames = useMemo(
    () => pickedGames.filter((name) => name.toLowerCase().includes(freePickFilter.toLowerCase())),
    [pickedGames, freePickFilter]
  )
  // Carries each player's ORIGINAL roster array index (not a re-numbered
  // one) — freePicks stores rosterIndex values against that same original
  // index space (see removePlayer above), so this has to match exactly.
  // The mismatch only gets reconciled once, at submit time in
  // handleConfirm, when blank rows actually get dropped from the payload.
  const namedRoster = roster
    .map((p, originalIndex) => ({ ...p, originalIndex }))
    .filter((p) => p.username.trim())

  function assignFreePick(gameName, rosterIndexValue) {
    setFreePicks((prev) => {
      const next = { ...prev }
      if (rosterIndexValue === '') delete next[gameName]
      else next[gameName] = Number(rosterIndexValue)
      return next
    })
  }

  const canConfirm = confirmText === 'START'

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      // freePicks was built against roster's ORIGINAL array indices
      // (namedRoster/removePlayer above) — remap those to the filtered
      // positions actually being sent, in case any blank rows exist.
      const indexMap = {}
      namedRoster.forEach((p, filteredIndex) => { indexMap[p.originalIndex] = filteredIndex })

      const payload = {
        games: Object.entries(selected)
          .filter(([, v]) => v.checked)
          .map(([name, v]) => ({ name, coinValue: Number(v.coinValue) || 0 })),
        roster: namedRoster.map((p) => ({ id: p.id, username: p.username.trim() })),
        freePicks: Object.entries(freePicks)
          .filter(([, idx]) => idx in indexMap)
          .map(([gameName, idx]) => ({ gameName, rosterIndex: indexMap[idx] })),
        bonusGameEnabled,
        auctionEnabled
      }
      await adminConfirmPlaythrough(payload)
      setResultMessage('New playthrough started — everyone\'s coins, streaks, and holds have been reset.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (resultMessage) {
    return (
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: 10, padding: 20, maxWidth: 480 }}>
        <p>{resultMessage}</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {STEP_LABELS.map((label, i) => (
          <span
            key={label}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              background: i === step ? 'var(--accent)' : 'var(--panel-border)',
              color: i === step ? 'var(--bg)' : 'var(--text-dim)'
            }}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {step === 0 && (
        <div>
          <p style={{ color: 'var(--text-dim)' }}>
            Upload an Archipelago Games Sheet export (.xlsx). Only the "Playable Worlds" sheet is used —
            tools/meta-games and duplicate sheets are ignored automatically.
          </p>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={(e) => handleUpload(e.target.files[0])}
          />
          {busy && <p>Parsing…</p>}
        </div>
      )}

      {step === 1 && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <input
              placeholder="Filter by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ flex: 1, padding: 6 }}
            />
            <button onClick={() => selectAllFiltered(true)}>Select all shown</button>
            <button onClick={() => selectAllFiltered(false)}>Deselect all shown</button>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            {selectedCount} selected · {filtered.length} of {candidates.length} shown
          </p>
          <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: 8 }}>
            <table>
              <thead>
                <tr><th></th><th>Game</th><th>Stability</th><th></th><th>Coin value</th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const sel = selected[c.name] || { checked: false, coinValue: '' }
                  return (
                    <tr key={c.name}>
                      <td>
                        <input type="checkbox" checked={sel.checked} onChange={(e) => toggleGame(c.name, e.target.checked)} />
                      </td>
                      <td>{c.name}</td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{c.stability || '—'}</td>
                      <td>{c.unrated && <span style={{ fontSize: 11, color: 'var(--danger)' }}>18+</span>}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={sel.coinValue}
                          disabled={!sel.checked}
                          onChange={(e) => setCoinValue(c.name, e.target.value)}
                          style={{ width: 80 }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setStep(0)}>Back</button>{' '}
            <button onClick={() => setStep(2)} disabled={selectedCount === 0}>Next ({selectedCount} games)</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p style={{ color: 'var(--text-dim)' }}>
            Starts prefilled with the current player list — edit freely. Nothing is written until you confirm
            on the last step.
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input placeholder="New player name" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} />
            <button onClick={addPlayer}>+ Add player</button>
          </div>
          <table>
            <tbody>
              {roster.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input value={p.username} onChange={(e) => renamePlayer(i, e.target.value)} />
                  </td>
                  <td>
                    <button onClick={() => removePlayer(i)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setStep(1)}>Back</button>{' '}
            <button onClick={() => setStep(3)} disabled={roster.filter((p) => p.username.trim()).length === 0}>
              Next ({roster.filter((p) => p.username.trim()).length} players)
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <p style={{ color: 'var(--text-dim)' }}>
            Reserve a few of the picked games as each player's free starting choice — same idea as the old
            Excel sheet's free-pick step. Reserved games still show up in the wheel pool for everyone; the
            reservation just lets that one player claim it for free instead (up to this app's free-pick limit)
            via the existing Free Interest Picks flow once the playthrough starts.
          </p>
          <input
            placeholder="Filter by name…"
            value={freePickFilter}
            onChange={(e) => setFreePickFilter(e.target.value)}
            style={{ width: '100%', padding: 6, marginBottom: 12 }}
          />
          <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: 8 }}>
            <table>
              <thead><tr><th>Game</th><th>Free pick for</th></tr></thead>
              <tbody>
                {filteredPickedGames.map((name) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      <select value={freePicks[name] ?? ''} onChange={(e) => assignFreePick(name, e.target.value)}>
                        <option value="">— none —</option>
                        {namedRoster.map((p) => (
                          <option key={p.originalIndex} value={p.originalIndex}>{p.username}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            {Object.keys(freePicks).length} game(s) reserved
          </p>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setStep(2)}>Back</button>{' '}
            <button onClick={() => setStep(4)}>Next</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <p>
            <label>
              <input type="checkbox" checked={bonusGameEnabled} onChange={(e) => setBonusGameEnabled(e.target.checked)} />{' '}
              Bonus Game (flags one held game per player for a 1.5x payout)
            </label>
          </p>
          <p>
            <label>
              <input type="checkbox" checked={auctionEnabled} onChange={(e) => setAuctionEnabled(e.target.checked)} />{' '}
              Auction (mandatory bidding round when a Lobby session locks in)
            </label>
          </p>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setStep(3)}>Back</button>{' '}
            <button onClick={() => setStep(5)}>Next</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div style={{ border: '1px solid var(--danger)', background: 'var(--danger-bg)', borderRadius: 10, padding: 20, maxWidth: 480 }}>
          <h2 style={{ color: 'var(--danger)', marginTop: 0 }}>Start this playthrough?</h2>
          <p>This wipes every player's coins, streak, trade history, and current holds, replaces the entire
            game catalog with the {selectedCount} games you picked, sets the roster to the {roster.filter((p) => p.username.trim()).length} players
            listed, and reserves {Object.keys(freePicks).length} free pick(s). This cannot be undone.</p>
          <p>Type <code>START</code> to confirm:</p>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <button onClick={() => setStep(4)} disabled={busy}>Back</button>{' '}
          <button onClick={handleConfirm} disabled={!canConfirm || busy} style={{ background: 'var(--danger)' }}>
            {busy ? 'Starting…' : 'Start new playthrough'}
          </button>
        </div>
      )}
    </div>
  )
}
