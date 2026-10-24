import { HEAD_RADIUS, type Chair, type Joint, type Point, type Skeleton } from '../exercises/library'

// Explicit colors (not Tailwind classes) so the SVG renders the same when rasterized for the PDF handout
const COLORS = {
  ground: '#cbd5e1', // slate-300
  chair: '#94a3b8', // slate-400
  markerLine: '#60a5fa', // blue-400
  target: '#bfdbfe', // blue-200
  body: '#1e293b', // slate-800
  joint: '#1d4ed8', // blue-700
}

const WIDTH = 220
const HEIGHT = 200
const GROUND_Y = 188
const ORIGIN_X = 105

// world (y up, ground 0) → SVG (y down)
const sx = (p: Point) => ORIGIN_X + p.x
const sy = (p: Point) => GROUND_Y - p.y

function Bones({ s, color }: { s: Skeleton; color: string }) {
  const chain = (pts: Point[]) => pts.map((p) => `${sx(p)},${sy(p)}`).join(' ')
  return (
    <g stroke={color} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={chain([s.toe, s.heel, s.ankle, s.knee, s.hip, s.shoulder])} />
      <polyline points={chain([s.shoulder, s.elbow, s.wrist])} />
      <circle cx={sx(s.head)} cy={sy(s.head)} r={HEAD_RADIUS} />
    </g>
  )
}

function ChairShape({ chair }: { chair: Chair }) {
  const seat = { y: GROUND_Y - chair.seatY, front: ORIGIN_X + chair.front, back: ORIGIN_X + chair.back }
  return (
    <g stroke={COLORS.chair} strokeWidth={3} strokeLinecap="round" fill="none">
      <line x1={seat.back} x2={seat.front} y1={seat.y} y2={seat.y} />
      <line x1={seat.front} x2={seat.front} y1={seat.y} y2={GROUND_Y} />
      <line x1={seat.back} x2={seat.back} y1={seat.y - 50} y2={GROUND_Y} />
    </g>
  )
}

interface Props {
  pose: Skeleton
  target?: Skeleton // faint outline of the target pose
  marker: Joint // dashed line marks this body part's height at the target
  highlight: Joint[] // joints drawn as dots (e.g. the measured angle's vertex)
  chair?: Chair
  label: string
}

export default function StickFigure({ pose, target, marker, highlight, chair, label }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
    >
      <line x1={10} x2={WIDTH - 10} y1={GROUND_Y} y2={GROUND_Y} stroke={COLORS.ground} strokeWidth={2} />
      {chair && <ChairShape chair={chair} />}
      {target && (
        <>
          <line
            x1={10}
            x2={WIDTH - 10}
            y1={sy(target[marker])}
            y2={sy(target[marker])}
            stroke={COLORS.markerLine}
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />
          <Bones s={target} color={COLORS.target} />
        </>
      )}
      <Bones s={pose} color={COLORS.body} />
      {highlight.map((j) => (
        <circle key={j} cx={sx(pose[j])} cy={sy(pose[j])} r={4} fill={COLORS.joint} />
      ))}
    </svg>
  )
}
