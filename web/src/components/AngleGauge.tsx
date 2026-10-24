// Semicircle gauge: how far the patient is moving right now, against the PT's target
interface Props {
  value: number | null // null when the body isn't in view
  target: number
  max: number // the exercise's full range
  label: string // e.g. "Knee bend"
}

const R = 80
const CX = 100
const CY = 95

// point on the arc for a fraction 0..1 (left → right)
function arcPoint(f: number) {
  const a = Math.PI * (1 - f)
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) }
}

function arcPath(from: number, to: number) {
  const a = arcPoint(from)
  const b = arcPoint(to)
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`
}

export default function AngleGauge({ value, target, max, label }: Props) {
  const f = value === null ? 0 : Math.min(1, Math.max(0, value / max))
  const t = Math.min(1, target / max)
  const reached = value !== null && value >= target * 0.9
  const tickIn = { x: CX + (R - 16) * Math.cos(Math.PI * (1 - t)), y: CY - (R - 16) * Math.sin(Math.PI * (1 - t)) }
  const tickOut = { x: CX + (R + 16) * Math.cos(Math.PI * (1 - t)), y: CY - (R + 16) * Math.sin(Math.PI * (1 - t)) }

  return (
    <figure className="text-center">
      <svg
        viewBox="0 0 200 110"
        className="mx-auto w-full max-w-64"
        role="img"
        aria-label={`${label}: ${value === null ? 'not visible' : `${Math.round(value)} degrees`}, target ${target} degrees`}
      >
        <path d={arcPath(0, 1)} stroke="#334155" strokeWidth={16} fill="none" strokeLinecap="round" />
        {f > 0.005 && (
          <path
            d={arcPath(0, f)}
            stroke={reached ? '#22c55e' : '#38bdf8'}
            strokeWidth={16}
            fill="none"
            strokeLinecap="round"
          />
        )}
        <line
          x1={tickIn.x}
          y1={tickIn.y}
          x2={tickOut.x}
          y2={tickOut.y}
          stroke="#fbbf24"
          strokeWidth={4}
          strokeLinecap="round"
        />
      </svg>
      <figcaption className="-mt-10">
        <span className="block text-5xl font-bold tabular-nums">
          {value === null ? '–' : `${Math.max(0, Math.round(value))}°`}
        </span>
        <span className="text-slate-300">
          {label} · target <span className="font-semibold text-amber-300">{target}°</span>
        </span>
      </figcaption>
    </figure>
  )
}
