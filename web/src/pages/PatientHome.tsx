import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import type { Sex } from '../components/SexGenderFields'

const SEX_LABELS: Record<Sex, string> = {
  female: 'Female',
  male: 'Male',
  intersex: 'Intersex',
  prefer_not_to_say: 'Prefer not to say',
}

// Placeholder — the patient exercise session flow comes in a later phase
export default function PatientHome() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const details: [string, string | number | null | undefined][] = [
    ['Age', user.age],
    ['Sex assigned at birth', user.sex_assigned_at_birth && SEX_LABELS[user.sex_assigned_at_birth]],
    ['Gender identity', user.gender_identity],
  ]

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <p className="text-lg text-slate-600">Patient account</p>
      <h1 className="text-4xl font-bold">Welcome, {user.name}</h1>
      <dl className="rounded-2xl border-2 border-slate-200 bg-white px-6 py-4">
        <dt className="text-sm text-slate-500">Email</dt>
        <dd className="text-lg">{user.email}</dd>
        <dt className="mt-3 text-sm text-slate-500">ID</dt>
        <dd className="font-mono text-lg">{user.id}</dd>
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
