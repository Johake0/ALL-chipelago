import { useEffect, useState } from 'react'
import { adminFetch, adminUploadAvatar, avatarUrl } from '../api.js'

export default function UsersTable() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(null) // user._id being renamed
  const [renameValue, setRenameValue] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setUsers(await adminFetch('/api/users'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await adminFetch('/api/users', { method: 'POST', body: JSON.stringify({ username: newName.trim() }) })
      setNewName('')
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleRename(user) {
    try {
      await adminFetch(`/api/users/${user._id}`, { method: 'PATCH', body: JSON.stringify({ username: renameValue.trim() }) })
      setRenaming(null)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Delete player "${user.username}"? Their games stay assigned to this now-missing user — reassign them on the Games tab first if you don't want that.`)) return
    try {
      await adminFetch(`/api/users/${user._id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleAvatarChange(user, file) {
    if (!file) return
    try {
      await adminUploadAvatar(user._id, file)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleAvatarRemove(user) {
    try {
      await adminFetch(`/api/users/${user._id}/avatar`, { method: 'DELETE' })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <p>Loading users…</p>

  return (
    <div>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input placeholder="New player name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit">+ Add player</button>
      </form>
      <table>
        <thead><tr><th>Avatar</th><th>Username</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => {
            const hasAvatar = !!u.avatar?.contentType
            return (
            <tr key={u._id}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {hasAvatar
                    ? <img src={avatarUrl(u._id)} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--panel-border)' }} />}
                  <label style={{ fontSize: 12, cursor: 'pointer', color: 'var(--accent-2)' }}>
                    Change
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      style={{ display: 'none' }}
                      onChange={(e) => handleAvatarChange(u, e.target.files[0])}
                    />
                  </label>
                  {hasAvatar && <button onClick={() => handleAvatarRemove(u)} style={{ fontSize: 12 }}>Remove</button>}
                </div>
              </td>
              <td>
                {renaming === u._id
                  ? <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                  : u.username}
              </td>
              <td>
                {renaming === u._id ? (
                  <>
                    <button onClick={() => handleRename(u)}>Save</button>{' '}
                    <button onClick={() => setRenaming(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setRenaming(u._id); setRenameValue(u.username) }}>Rename</button>{' '}
                    <button onClick={() => handleDelete(u)}>Delete</button>
                  </>
                )}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
