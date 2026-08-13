import { useCallback, useEffect, useRef, useState } from 'react'
import { getState } from './playerApi.js'

const POLL_MS = 15000

export function useGameState() {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const data = await getState()
      setState(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  return { state, error, refresh }
}
