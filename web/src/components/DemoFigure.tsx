import { useEffect, useState } from 'react'
import { figureJoint, type ExerciseMotion } from '../exercises/library'
import StickFigure from './StickFigure'

const REP_SECONDS = 3

// The stick figure looping one rep down to the PT's target, for patients (no controls)
export default function DemoFigure({ exercise, target }: { exercise: ExerciseMotion; target: number }) {
  const [phase, setPhase] = useState(1) // 0 = start position, 1 = at target

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const cycle = ((now - start) / 1000 / REP_SECONDS) % 1
      setPhase((1 - Math.cos(cycle * 2 * Math.PI)) / 2)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <StickFigure
      pose={exercise.pose(phase * target)}
      target={exercise.pose(target)}
      marker={exercise.marker}
      highlight={[figureJoint(exercise.anglePoints.left.names[1])]}
      chair={exercise.chair}
      label={`${exercise.name}: move until you reach the dashed line`}
    />
  )
}
