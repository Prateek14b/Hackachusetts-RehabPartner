import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listPatientCarePlans, type CarePlanSummary } from '../api'
import { useAuth } from '../auth'
import type { Sex } from '../components/SexGenderFields'
import StatusBadge from '../components/StatusBadge'

const SEX_LABELS: Record<Sex, string> = {
  female: 'Female',
  male: 'Male',
  intersex: 'Intersex',
  prefer_not_to_say: 'Prefer not to say',
}

export default function PatientHome() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<CarePlanSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const patientId = user?.id

  useEffect(() => {
    if (!patientId) return
    listPatientCarePlans(patientId)
      .then(setPlans)
      .catch((err: Error) => setError(err.message))
  }, [patientId])

  if (!user) return null

  const details: [string, string | number | null | undefined][] = [
    ['Date of birth', user.dob],
    ['Age', user.age],
    ['Sex assigned at birth', user.sex_assigned_at_birth && SEX_LABELS[user.sex_assigned_at_birth]],
    ['Gender identity', user.gender_identity],
  ]

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <p className="text-lg text-slate-600">Patient account</p>
      <h1 className="text-4xl font-bold">Welcome, {user.name}</h1>

      <section>
        <h2 className="text-2xl font-semibold">My PT schedule</h2>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 font-medium text-red-800">
            {error}
          </p>
        )}
        {!error && plans === null && <p className="mt-3 text-slate-600">Loading…</p>}
        {plans?.length === 0 && (
          <p className="mt-3 rounded-2xl bg-slate-100 px-6 py-6 text-lg text-slate-600">
            No plans yet. Scan the QR code on the handout from your clinic to add yours.
          </p>
        )}
        <ul className="mt-3 flex flex-col gap-3">
          {plans?.map((p) => (
            <li key={p.plan_id}>
              <Link
                to={`/patient/plans/${p.plan_id}`}
                className="block rounded-2xl border-2 border-slate-200 bg-white px-6 py-5 transition hover:border-blue-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xl font-semibold">Exercise plan</span>
                  <StatusBadge status={p.status} />
                </div>
                <p className="mt-1 text-lg text-slate-600">
                  From {p.provider_name} · {p.exercise_count} exercise{p.exercise_count === 1 ? '' : 's'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <dl className="rounded-2xl border-2 border-slate-200 bg-white px-6 py-4">
        <dt className="text-sm text-slate-500">Email</dt>
        <dd className="text-lg">{user.email}</dd>
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="mt-3 text-sm text-slate-500">{label}</dt>
            <dd className="text-lg">{value ?? 'Not provided'}</dd>
          </div>
        ))}
      </dl>
      <button
        onClick={() => {
          signOut()
          navigate('/', { replace: true })
        }}
        className="rounded-xl border-2 border-slate-300 bg-white px-6 py-4 text-xl font-semibold hover:border-slate-500"
      >
        Log out
      </button>
    </main>
  )
}
