import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProgress, type Progress, type Session } from '../api'
import { useAuth } from '../auth'
import StatusBadge from '../components/StatusBadge'

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const dateTimeFmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

// Peak range of motion per session (oldest → newest) with the PT's target as a dashed line.
// The y-axis is zoomed to the data so real progress is visible.
function Trend({ points, target }: { points: number[]; target: number }) {
  const W = 400
  const H = 72
  const lo = Math.min(target, ...points) - 10
  const hi = Math.max(target, ...points) + 5
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 12) + 6)
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo)) * (H - 12)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 h-auto w-full"
      role="img"
      aria-label={`Range of motion over ${points.length} sessions`}
    >
      <line x1={0} x2={W} y1={y(target)} y2={y(target)} stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5} />
      {points.length > 1 && (
        <polyline
          points={points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      )}
      {points.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={4.5} fill={v >= target * 0.9 ? '#16a34a' : '#2563eb'} />
      ))}
    </svg>
  )
}

function sessionMinutes(s: Session) {
  return Math.max(1, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60_000))
}

// Provider's view of a patient's home sessions: personal bests vs target, trends, and session history
export default function ProgressPage() {
  const { planId = '' } = useParams()
  const { user } = useAuth()
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const providerId = user?.id

  useEffect(() => {
    if (!providerId) return
    getProgress(planId, { provider_id: providerId })
      .then(setProgress)
      .catch((err: Error) => setError(err.message))
  }, [planId, providerId])

  if (error || !progress) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Link to="/provider/home" className="text-blue-700 underline-offset-4 hover:underline">
          ← Back to dashboard
        </Link>
        <p className={`mt-6 ${error ? 'rounded-xl bg-red-50 px-4 py-3 font-medium text-red-800' : 'text-slate-600'}`}>
          {error ?? 'Loading…'}
        </p>
      </main>
    )
  }

  const { plan, sessions, bests } = progress
  const chronological = [...sessions].reverse()
  const days = new Set(sessions.map((s) => s.started_at.slice(0, 10))).size
  const pains = sessions.flatMap((s) => s.exercises.map((e) => e.pain)).filter((p): p is number => p != null)
  const avgPain = pains.length ? (pains.reduce((a, b) => a + b, 0) / pains.length).toFixed(1) : '–'
  const completedCount = sessions.filter((s) => s.completed).length

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/provider/home" className="text-blue-700 underline-offset-4 hover:underline">
        ← Back to dashboard
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{plan.assigned_name}</h1>
        <StatusBadge status={plan.status} />
      </div>
      <p className="mt-1 text-slate-600">
        {plan.assigned_email} · Plan from {dateFmt(plan.created_at)}
        {plan.patient_id ? '' : ' · Waiting for the patient to scan the QR code'}
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Chip label="Sessions" value={String(sessions.length)} />
        <Chip label="Days active" value={String(days)} />
        <Chip label="Last session" value={sessions[0] ? daysAgo(sessions[0].started_at) : '–'} />
        <Chip
          label="Completed fully"
          value={sessions.length ? `${Math.round((completedCount / sessions.length) * 100)}%` : '–'}
        />
        <Chip label="Avg pain" value={pains.length ? `${avgPain}/10` : '–'} />
      </section>

      <h2 className="mt-10 text-xl font-semibold">Exercises</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {plan.exercises.map((ex) => {
          const best = bests[String(ex.position)]
          const peaks = chronological
            .map((s) => s.exercises.find((e) => e.position === ex.position)?.peak_rom)
            .filter((v): v is number => v != null)
          const latest = sessions[0]?.exercises.find((e) => e.position === ex.position)
          const first = peaks[0]
          return (
            <article key={ex.position} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{ex.name}</h3>
                <span className="text-sm text-slate-500">
                  {ex.sets} × {ex.reps}
                </span>
              </div>
              {ex.target_rom != null ? (
                <>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-4xl font-bold tabular-nums">{best ? `${best.best_rom}°` : '–'}</span>
                    <span className="text-slate-500">best · target {ex.target_rom}°</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${best && best.best_rom >= ex.target_rom * 0.9 ? 'bg-green-500' : 'bg-blue-600'}`}
                      style={{ width: `${Math.min(100, ((best?.best_rom ?? 0) / ex.target_rom) * 100)}%` }}
                    />
                  </div>
                  {peaks.length > 0 ? (
                    <>
                      <Trend points={peaks} target={ex.target_rom} />
                      {peaks.length > 1 && first != null && (
                        <p className="text-sm text-slate-600">
                          {peaks[peaks.length - 1] >= first ? '↑' : '↓'} {Math.abs(peaks[peaks.length - 1] - first)}°
                          since the first session
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No tracked reps yet.</p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Not camera-tracked (patient records sets).</p>
              )}
              {latest && (
                <p className="mt-2 text-sm text-slate-600">
                  Last session: {latest.reps_completed}/{latest.sets_target * latest.reps_target} reps
                  {ex.target_rom != null && ` · ${latest.reps_at_target} at target`}
                  {latest.pain != null && ` · pain ${latest.pain}/10`}
                </p>
              )}
            </article>
          )
        })}
      </div>

      <h2 className="mt-10 text-xl font-semibold">Session history</h2>
      {sessions.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-slate-100 px-6 py-8 text-center text-slate-600">No sessions yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {sessions.map((s) => {
            const setsDone = s.exercises.reduce((a, e) => a + e.sets_completed, 0)
            const setsTotal = s.exercises.reduce((a, e) => a + e.sets_target, 0)
            const prs = s.exercises.filter((e) => e.new_best).length
            return (
              <li
                key={s.session_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-5 py-3 ring-1 ring-slate-200"
              >
                <span className="font-medium">{dateTimeFmt(s.started_at)}</span>
                <span className="text-slate-600">
                  {sessionMinutes(s)} min · {setsDone}/{setsTotal} sets
                  {prs > 0 && ` · ${prs} new best${prs > 1 ? 's' : ''}`}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${s.completed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}
                >
                  {s.completed ? 'Completed' : 'Ended early'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
