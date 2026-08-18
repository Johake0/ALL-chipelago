import { useCallback, useEffect, useRef, useState } from 'react'
import { getState } from './playerApi.js'

const POLL_MS = 15000
// Faster polling while an auction is actively open, so bids/drop-outs from
// other players show up close to real-time without adding any new
// infrastructure (WebSockets/SSE) — just a shorter interval on the same
// polling loop this app already uses everywhere else.
const AUCTION_POLL_MS = 3000

export function useGameState() {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const stateRef = useRef(null)
  const timeoutRef = useRef(null)

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
      await refresh()
      if (cancelled) return
      const delay = stateRef.current?.session?.auction?.status === 'open' ? AUCTION_POLL_MS : POLL_MS
      timeoutRef.current = setTimeout(tick, delay)
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timeoutRef.current)
    }
  }, [refresh])

  return { state, error, refresh }
}
