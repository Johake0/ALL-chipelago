import { useState } from 'react'
import { adminFetch } from '../api.js'

const STATUSES = ['available', 'personal_list', 'in_inventory', 'forced', 'lobby', 'finished']

function toDateInputValue(iso) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

export default function GameEditModal({ game, users, onClose, onSaved }) {
  const isNew = !game
  const [form, setForm] = useState({
    name: game?.name || '',
    coinValue: game?.coinValue ?? 0,
    forceReleaseCost: game?.forceReleaseCost ?? 0,
    status: game?.status || 'available',
    ownerId: game?.ownerId?._id || '',
    forcedByUserId: game?.forcedByUserId?._id || '',
    interestFor: game?.interestFor?._id || '',
    claimMethod: game?.claimMethod || '',
    released: game?.released || false,
    removed: game?.removed || false,
    dateAssigned: toDateInputValue(game?.dateAssigned),
    dateCompleted: toDateInputValue(game?.dateCompleted),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      name: form.name.trim(),
      coinValue: Number(form.coinValue) || 0,
      forceReleaseCost: Number(form.forceReleaseCost) || 0,
      status: form.status,
      ownerId: form.ownerId || null,
      forcedByUserId: form.forcedByUserId || null,
      interestFor: form.interestFor || null,
      claimMethod: form.claimMethod || null,
      released: form.released,
      removed: form.removed,
      dateAssigned: form.dateAssigned ? new Date(form.dateAssigned).toISOString() : null,
      dateCompleted: form.dateCompleted ? new Date(form.dateCompleted).toISOString() : null,
    }
    try {
      if (isNew) {
        await adminFetch('/api/games', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await adminFetch(`/api/games/${game._id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} style={modalStyle}>
        <h2 style={{ marginTop: 0 }}>{isNew ? 'Add game' : `Edit "${game.name}"`}</h2>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

        <label>Name
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </label>

        <div style={row2}>
          <label style={{ flex: 1 }}>Coin value
            <input type="number" value={form.coinValue} onChange={(e) => set('coinValue', e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>Force release cost
            <input type="number" value={form.forceReleaseCost} onChange={(e) => set('forceReleaseCost', e.target.value)} />
          </label>
        </div>

        <label>Status
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <div style={row2}>
          <label style={{ flex: 1 }}>Owner
            <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
              <option value="">— none —</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.username}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>Forced by
            <select value={form.forcedByUserId} onChange={(e) => set('forcedByUserId', e.target.value)}>
              <option value="">— none —</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.username}</option>)}
            </select>
          </label>
        </div>

        <label>Interest for (free-pick pool)
          <select value={form.interestFor} onChange={(e) => set('interestFor', e.target.value)}>
            <option value="">— none —</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.username}</option>)}
          </select>
        </label>

        <label>Claim method
          <select value={form.claimMethod} onChange={(e) => set('claimMethod', e.target.value)}>
            <option value="">— none —</option>
            <option value="wheel">wheel</option>
            <option value="interest">interest</option>
          </select>
        </label>

        <div style={row2}>
          <label style={{ flex: 1 }}>Date assigned
            <input type="date" value={form.dateAssigned} onChange={(e) => set('dateAssigned', e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>Date completed
            <input type="date" value={form.dateCompleted} onChange={(e) => set('dateCompleted', e.target.value)} />
          </label>
        </div>

        <div style={row2}>
          <label style={checkboxLabel}>
            <input type="checkbox" checked={form.released} onChange={(e) => set('released', e.target.checked)} /> Released (bailed on)
          </label>
          <label style={checkboxLabel}>
            <input type="checkbox" checked={form.removed} onChange={(e) => set('removed', e.target.checked)} /> Removed from pool
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: 40, paddingBottom: 40, overflowY: 'auto', zIndex: 10,
}
const modalStyle = {
  background: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 10,
  padding: 24, width: 460, display: 'flex', flexDirection: 'column', gap: 10,
}
const row2 = { display: 'flex', gap: 10 }
const checkboxLabel = { display: 'flex', alignItems: 'center', gap: 6, flexDirection: 'row', flex: 1 }
