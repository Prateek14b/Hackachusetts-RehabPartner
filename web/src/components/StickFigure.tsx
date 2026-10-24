import { HEAD_RADIUS, type Point, type Skeleton } from '../exercises/library'

const WIDTH = 220
const HEIGHT = 200
const GROUND_Y = 188
const ORIGIN_X = 105

// world (y up, ground 0) → SVG (y down)
const sx = (p: Point) => ORIGIN_X + p.x
const sy = (p: Point) => GROUND_Y - p.y

function Bones({ s, className }: { s: Skeleton; className: string }) {
  const chain = (pts: Point[]) => pts.map((p) => `${sx(p)},${sy(p)}`).join(' ')
  return (
    <g className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={chain([s.toe, s.heel, s.ankle, s.knee, s.hip, s.shoulder])} />
      <polyline points={chain([s.shoulder, s.elbow, s.wrist])} />
      <circle cx={sx(s.head)} cy={sy(s.head)} r={HEAD_RADIUS} />
    </g>
  )
}

interface Props {
  pose: Skeleton
  target?: Skeleton // faint outline of the target pose
  label: string
}

export default function StickFigure({ pose, target, label }: Props) {
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={label}>
      <line x1={10} x2={WIDTH - 10} y1={GROUND_Y} y2={GROUND_Y} className="stroke-slate-300" strokeWidth={2} />
      {target && (
        <>
          {/* how low the hips should go */}
          <line
            x1={10}
            x2={WIDTH - 10}
            y1={sy(target.hip)}
            y2={sy(target.hip)}
            className="stroke-blue-400"
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />
          <Bones s={target} className="stroke-blue-200 [stroke-width:5]" />
        </>
      )}
      <Bones s={pose} className="stroke-slate-800 [stroke-width:5]" />
      <circle cx={sx(pose.hip)} cy={sy(pose.hip)} r={4} className="fill-blue-700" />
      <circle cx={sx(pose.knee)} cy={sy(pose.knee)} r={4} className="fill-blue-700" />
    </svg>
  )
}
