import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { login, register, type Role } from '../api'
import { useAuth } from '../auth'
import SexGenderFields, { type Sex } from '../components/SexGenderFields'

interface Props {
  role: Role
  mode: 'login' | 'register'
}

// Where to go after logging in, e.g. back to a QR join link. Only same-site paths are allowed.
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

const inputClass =
  'mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-lg focus:border-blue-600 focus:outline-none'

export default function AuthPage({ role, mode }: Props) {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : ''
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [age, setAge] = useState('')
  const [dob, setDob] = useState('')
  const [sex, setSex] = useState<Sex | null>(null)
  const [gender, setGender] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user?.role === role) return <Navigate to={next ?? `/${role}/home`} replace />

  const isRegister = mode === 'register'
  const roleLabel = role === 'patient' ? 'Patient' : 'Provider'
  const showPatientDetails = isRegister && role === 'patient'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const details = showPatientDetails
        ? {
            age: age === '' ? null : Number(age),
            sex_assigned_at_birth: sex,
            gender_identity: gender || null,
            dob: dob || null,
          }
        : undefined
      const u = isRegister ? await register(role, name, email, details) : await login(role, email)
      signIn(u)
      navigate(next ?? `/${role}/home`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link to="/" className="mb-6 text-blue-700 underline-offset-4 hover:underline">
        ← Back
      </Link>
      <h1 className="text-3xl font-bold">
        {roleLabel} {isRegister ? 'sign up' : 'log in'}
      </h1>

      <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-200 p-1" role="tablist">
        {(['login', 'register'] as const).map((m) => (
          <Link
            key={m}
            to={`/${role}/${m}${nextQuery}`}
            role="tab"
            aria-selected={mode === m}
            className={`rounded-lg py-2 text-center font-semibold ${
              mode === m ? 'bg-white shadow' : 'text-slate-600'
            }`}
          >
            {m === 'login' ? 'Log in' : 'New account'}
          </Link>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5" noValidate>
        {isRegister && (
          <label className="block font-medium">
            Full name
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
        )}
        <label className="block font-medium">
          Email
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        {showPatientDetails && (
          <>
            <label className="block font-medium">
              Date of birth
              <input
                className={`${inputClass} max-w-56`}
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                autoComplete="bday"
              />
              <span className="mt-1 block text-sm font-normal text-slate-500">
                Your clinic uses this to confirm a care plan is yours.
              </span>
            </label>
            <label className="block font-medium">
              Age <span className="font-normal text-slate-500">(optional)</span>
              <input
                className={`${inputClass} max-w-40`}
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </label>
            <SexGenderFields sex={sex} onSexChange={setSex} gender={gender} onGenderChange={setGender} />
          </>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 font-medium text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:opacity-60"
        >
          {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
        </button>
      </form>
    </main>
  )
}
