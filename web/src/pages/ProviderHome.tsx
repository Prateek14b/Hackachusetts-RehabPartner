import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { listCarePlans, type CarePlanSummary } from '../api'
import { useAuth } from '../auth'
import PlusIcon from '../components/PlusIcon'

export default function ProviderHome() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const savedFor = (useLocation().state as { savedFor?: string } | null)?.savedFor
  const [plans, setPlans] = useState<CarePlanSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const providerId = user?.id

  useEffect(() => {
    if (!providerId) return
    listCarePlans(providerId)
      .then(setPlans)
      .catch((err: Error) => setError(err.message))
  }, [providerId])

  if (!user) return null

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <span className="text-xl font-bold">Rehab.io</span>
          <div className="flex items-center gap-4">
            <span className="hidden text-slate-600 sm:inline">{user.name}</span>
            <button
              onClick={() => {
                signOut()
                navigate('/', { replace: true })
              }}
              className="rounded-lg border-2 border-slate-300 px-4 py-2 font-semibold hover:border-slate-500"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-bold">Welcome, {user.name}</h1>
        <p className="mt-1 text-slate-600">Create a care plan for a patient you've just seen.</p>

        {savedFor && (
          <p role="status" className="mt-6 rounded-xl bg-green-50 px-4 py-3 font-medium text-green-800">
            Care plan saved for {savedFor}.
          </p>
        )}

        <Link
          to="/provider/plans/new"
          className="mt-8 flex items-center gap-4 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-8 transition hover:border-blue-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white">
            <PlusIcon className="h-7 w-7" />
          </span>
          <span>
            <span className="block text-xl font-semibold">New care plan</span>
            <span className="block text-slate-600">Add patient details and assign exercises</span>
          </span>
        </Link>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Care plans</h2>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 font-medium text-red-800">
              {error}
            </p>
          )}
          {!error && plans === null && <p className="mt-3 text-slate-600">Loading…</p>}
          {plans?.length === 0 && (
            <p className="mt-3 rounded-2xl bg-slate-100 px-6 py-8 text-center text-slate-600">No care plans yet.</p>
          )}
          {plans && plans.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {plans.map((p) => (
                <li
                  key={p.plan_id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border-2 border-slate-200 bg-white px-6 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{p.assigned_name}</p>
                    <p className="truncate text-slate-600">{p.assigned_email}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {p.patient_id ? (
                        <span className="text-green-800">Linked to patient's account</span>
                      ) : (
                        <span className="text-amber-800">Waiting for patient to scan QR</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right text-slate-600">
                    <p>
                      {p.therapy_type && <span className="capitalize">{p.therapy_type} · </span>}
                      {p.exercise_count} exercise{p.exercise_count === 1 ? '' : 's'} ·{' '}
                      {new Date(p.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex justify-end gap-4">
                      <Link
                        to={`/provider/plans/${p.plan_id}/progress`}
                        className="font-semibold text-blue-700 underline-offset-4 hover:underline"
                      >
                        Progress
                      </Link>
                      <Link
                        to={`/provider/plans/${p.plan_id}/handout`}
                        className="font-semibold text-blue-700 underline-offset-4 hover:underline"
                      >
                        Handout & QR code
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
