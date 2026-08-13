import { useEffect, useRef, useState } from 'react'

const COLORS = ['#7c5cff', '#2dd4bf']
const SPIN_MS = 4500

export default function Wheel({ segments, spinToken, winner, spinning, disabled, disabledReason, onSpin, onLanded }) {
  const discRef = useRef(null)
  const rotationRef = useRef(0)
  const [displayText, setDisplayText] = useState('Spin to get a game!')

  useEffect(() => {
    if (!spinToken || !winner || segments.length === 0) return

    const idx = segments.indexOf(winner)
    const segAngle = 360 / segments.length
    const targetAngle = idx >= 0 ? idx * segAngle + segAngle / 2 : 0
    const spins = 5
    const current = rotationRef.current
    const next = current + spins * 360 + (360 - targetAngle) - (current % 360)
    rotationRef.current = next
    if (discRef.current) discRef.current.style.transform = `rotate(${next}deg)`

    const flicker = setInterval(() => {
      setDisplayText(segments[Math.floor(Math.random() * segments.length)])
    }, 80)
    const timeout = setTimeout(() => {
      clearInterval(flicker)
      setDisplayText(winner)
      onLanded?.()
    }, SPIN_MS)

    return () => {
      clearInterval(flicker)
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken])

  const segAngle = segments.length ? 360 / segments.length : 0
  const gradient = segments.length
    ? segments.map((_, i) => `${COLORS[i % COLORS.length]} ${i * segAngle}deg ${(i + 1) * segAngle}deg`).join(', ')
    : 'var(--panel-border)'

  return (
    <div className="wheel-wrap">
      <div className="wheel-stage">
        <div className="wheel-pointer" />
        <div className="wheel-disc" ref={discRef} style={{ background: `conic-gradient(${gradient})` }} />
        <div className="wheel-hub">🎲</div>
      </div>
      <div className="wheel-result">{displayText}</div>
      <button className="spin-btn" onClick={onSpin} disabled={disabled || spinning}>
        {spinning ? 'Spinning…' : 'Spin the Wheel'}
      </button>
      {disabled && disabledReason && <p className="wheel-disabled-reason">{disabledReason}</p>}
    </div>
  )
}
