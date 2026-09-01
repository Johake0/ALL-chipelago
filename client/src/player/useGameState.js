import { useCallback, useEffect, useRef, useState } from 'react'
import { getState } from './playerApi.js'
import { getPlayerSecret, liveUpdatesUrl } from '../api.js'

const POLL_MS = 15000
// Faster polling while an auction is actively open — used only as a
// fallback for when the live-update socket below isn't connected (was the
// only mechanism before the socket existed).
const AUCTION_POLL_MS = 3000
// While the socket IS connected, it's the primary trigger for "go refetch
// state" — this long interval is just a safety net in case a server-side
// broadcast gets missed for some reason, not the normal path.
const FALLBACK_POLL_MS = 90000
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15000

export function useGameState() {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const stateRef = useRef(null)
  const timeoutRef = useRef(null)
  const wsRef = useRef(null)
  const wsConnectedRef = useRef(false)
  const reconnectDelayRef = useRef(RECONNECT_BASE_MS)
  const reconnectTimeoutRef = useRef(null)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const data = await getState()
      stateRef.current = data
      setState(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function tick() {
      // A backgrounded/minimized tab stops polling entirely instead of
      // continuing to hit the API every 15s (or 3s during an open auction)
      // indefinitely — the leading cause found for a real bandwidth spike
      // was a PC left on with the site open in an unwatched tab overnight.
      if (document.visibilityState === 'hidden') return
      await refresh()
      if (cancelled || document.visibilityState === 'hidden') return
      const delay = wsConnectedRef.current
        ? FALLBACK_POLL_MS
        : stateRef.current?.session?.auction?.status === 'open' ? AUCTION_POLL_MS : POLL_MS
      timeoutRef.current = setTimeout(tick, delay)
    }

    // "State changed" doorbell — see src/lib/liveUpdates.js on the backend.
    // Every mutating route broadcasts this after it writes; on receiving
    // it we just refetch GET /api/state immediately instead of waiting for
    // the next scheduled poll. If the socket can't connect at all (blocked
    // network, server restart, whatever), wsConnectedRef simply stays
    // false and tick() above falls back to exactly the polling behavior
    // this app always had — the socket is additive, never load-bearing.
    function connectSocket() {
      if (document.visibilityState === 'hidden') return
      const ws = new WebSocket(liveUpdatesUrl())
      wsRef.current = ws

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'auth', secret: getPlayerSecret() }))
      })

      ws.addEventListener('message', (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        if (msg.type === 'auth-ok') {
          wsConnectedRef.current = true
          reconnectDelayRef.current = RECONNECT_BASE_MS
        } else if (msg.type === 'state-changed') {
          refresh()
        }
      })

      const scheduleReconnect = () => {
        wsConnectedRef.current = false
        if (cancelled || document.visibilityState === 'hidden') return
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = setTimeout(connectSocket, reconnectDelayRef.current)
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, RECONNECT_MAX_MS)
      }
      ws.addEventListener('close', scheduleReconnect)
      ws.addEventListener('error', () => ws.close())
      ws.__scheduleReconnect = scheduleReconnect
    }

    function disconnectSocket() {
      clearTimeout(reconnectTimeoutRef.current)
      wsConnectedRef.current = false
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        // Detach before closing — otherwise the 'close' event this
        // triggers would itself call scheduleReconnect. (It has its own
        // cancelled/hidden guard too, so this isn't strictly load-bearing,
        // but it avoids an extra pointless reconnect attempt on every
        // deliberate close, e.g. every time the tab is hidden.)
        ws.removeEventListener('close', ws.__scheduleReconnect)
        ws.close()
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Coming back into view: refresh immediately (state may be stale by
        // however long the tab was hidden), resume polling, and reconnect
        // the socket.
        clearTimeout(timeoutRef.current)
        tick()
        reconnectDelayRef.current = RECONNECT_BASE_MS
        connectSocket()
      } else {
        disconnectSocket()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    tick()
    connectSocket()
    return () => {
      cancelled = true
      clearTimeout(timeoutRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      disconnectSocket()
    }
  }, [refresh])

  return { state, error, refresh }
}
