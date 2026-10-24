import { figureJoint, type ExerciseMotion } from '../exercises/library'
import StickFigure from './StickFigure'

// The stick figure frozen at the PT's target, with the dashed line marking how far to go
export default function TargetFigure({ exercise, target }: { exercise: ExerciseMotion; target: number }) {
  const pose = exercise.pose(target)
  return (
    <StickFigure
      pose={pose}
      target={pose}
      marker={exercise.marker}
      highlight={[figureJoint(exercise.anglePoints.left.names[1])]}
      chair={exercise.chair}
      label={`${exercise.name} at ${target}° ${exercise.metric.toLowerCase()}`}
    />
  )
}
