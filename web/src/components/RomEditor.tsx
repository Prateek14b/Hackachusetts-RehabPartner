import { useEffect, useRef, useState } from 'react'
import type { ExerciseMotion } from '../exercises/library'
import StickFigure from './StickFigure'

const REP_SECONDS = 3
const AT_TARGET = 0.5 // point in the rep cycle where the figure is at the target pose

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

interface Props {
  exercise: ExerciseMotion
  value: number // target ROM in degrees
  onChange: (value: number) => void
}

// Animated stick figure doing the exercise down to the PT's target ROM, with a slider to set it
export default function RomEditor({ exercise, value, onChange }: Props) {
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  // Position within one rep: 0 = standing, AT_TARGET = bottom, 1 = standing again
  const [cycle, setCycle] = useState(() => (prefersReducedMotion() ? AT_TARGET : 0))
  const cycleRef = useRef(cycle)

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const start = performance.now() - cycleRef.current * REP_SECONDS * 1000 // resume where we paused
    const tick = (now: number) => {
      cycleRef.current = ((now - start) / 1000 / REP_SECONDS) % 1
      setCycle(cycleRef.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  // While paused, changing the target shows the figure at the new target
  function setTarget(v: number) {
    onChange(v)
    if (!playing) {
      cycleRef.current = AT_TARGET
      setCycle(AT_TARGET)
    }
  }

  const phase = (1 - Math.cos(cycle * 2 * Math.PI)) / 2 // smooth down-and-up, 0..1
  const shownRom = phase * value
  const pct = Math.round((value / exercise.fullRom) * 100)

  return (
    <div className="grid items-center gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
      <div className="mx-auto w-full max-w-56">
        <StickFigure
          pose={exercise.pose(shownRom)}
          target={exercise.pose(value)}
          label={`${exercise.name} to ${value}° ${exercise.metric.toLowerCase()}`}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">Target {exercise.metric.toLowerCase()}</span>
            <span className="text-2xl font-bold tabular-nums">{value}°</span>
          </div>
          <p className="text-sm text-slate-500">
            {exercise.hint} · {pct}% of full range ({exercise.fullRom}°)
          </p>
        </div>

        <input
          type="range"
          min={exercise.minRom}
          max={exercise.fullRom}
          step={5}
          value={value}
          onChange={(e) => setTarget(Number(e.target.value))}
          aria-label={`Target ${exercise.metric.toLowerCase()} in degrees`}
          className="w-full accent-blue-700"
        />
        <div className="flex justify-between text-sm text-slate-500">
          <span>Less</span>
          <span>Full range</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 font-semibold hover:border-slate-500"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => setTarget(exercise.fullRom)}
            disabled={value === exercise.fullRom}
            className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 font-semibold hover:border-slate-500 disabled:opacity-50"
          >
            Reset to full range
          </button>
        </div>
      </div>
    </div>
  )
}
