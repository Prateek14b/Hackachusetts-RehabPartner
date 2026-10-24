import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCarePlan, getProgress, type CarePlan, type Progress } from '../api'
import { useAuth } from '../auth'
import StatusBadge from '../components/StatusBadge'
import TargetFigure from '../components/TargetFigure'
import { EXERCISES } from '../exercises/library'

const SIDE_LABEL = { left: 'Left side', right: 'Right side', both: 'Both sides' }

// The patient's view of a care plan: what each exercise looks like and how far to go, then "Start PT"
export default function PlanBriefing() {
  const { planId = '' } = useParams()
  const { user } = useAuth()
  const [plan, setPlan] = useState<CarePlan | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const patientId = user?.id

  useEffect(() => {
    if (!patientId) return
    getCarePlan(planId, { patient_id: patientId })
      .then(setPlan)
      .catch((err: Error) => setError(err.message))
    getProgress(planId, { patient_id: patientId })
      .then(setProgress)
      .catch(() => setProgress(null)) // progress is a nice-to-have here
  }, [planId, patientId])

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/patient/home" className="text-lg text-blue-700 underline-offset-4 hover:underline">
        ← My PT schedule
      </Link>

      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-lg font-medium text-red-800">
          {error}
        </p>
      )}
      {!plan && !error && <p className="mt-6 text-lg text-slate-600">Loading…</p>}

      {plan && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">Your exercise plan</h1>
            <StatusBadge status={plan.status} />
          </div>
          <p className="mt-1 text-lg text-slate-600">
            From {plan.provider_name} · {plan.exercises.length} exercise{plan.exercises.length === 1 ? '' : 's'}
          </p>

          <ol className="mt-6 flex flex-col gap-4">
            {plan.exercises.map((ex, i) => {
              const exercise = EXERCISES.find((m) => m.id === ex.exercise_id)
              return (
                <li
                  key={ex.position}
                  className="grid items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4 sm:grid-cols-[12rem_1fr]"
                >
                  {exercise && ex.target_rom != null ? (
                    <div className="mx-auto w-full max-w-48 rounded-xl bg-slate-50">
                      <TargetFigure exercise={exercise} target={ex.target_rom} />
                    </div>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                  <div>
                    <h2 className="text-xl font-semibold">
                      {i + 1}. {ex.name}
                    </h2>
                    <p className="mt-1 text-lg">
                      {ex.sets} sets × {ex.reps} reps · {SIDE_LABEL[ex.side]}
                    </p>
                    {progress?.bests[String(ex.position)] && (
                      <p className="mt-1 font-semibold text-green-800">
                        Your best so far: {progress.bests[String(ex.position)].best_rom}°
                      </p>
                    )}
                    {exercise && ex.target_rom != null && (
                      <p className="mt-1 text-slate-600">
                        {exercise.hint}: go as far as the dashed line ({ex.target_rom}°{' '}
                        {exercise.metric.toLowerCase()}).
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          <Link
            to={`/patient/plans/${plan.plan_id}/start`}
            className="mt-8 block rounded-xl bg-blue-700 px-6 py-5 text-center text-2xl font-bold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            {progress?.sessions.length ? 'Start today’s session' : 'Start PT'}
          </Link>
          {progress && progress.sessions.length > 0 && (
            <p className="mt-3 text-center text-lg text-slate-600">
              {progress.sessions.length} session{progress.sessions.length === 1 ? '' : 's'} done · last on{' '}
              {new Date(progress.sessions[0].started_at).toLocaleDateString()}
            </p>
          )}
        </>
      )}
    </main>
  )
}
