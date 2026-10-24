import { Navigate, useNavigate } from 'react-router-dom'
import type { Role } from '../api'
import { useAuth } from '../auth'

// Placeholder home screens — patient session flow and provider inbox come in later phases
export default function Home({ role }: { role: Role }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  if (!user || user.role !== role) return <Navigate to={`/${role}/login`} replace />

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <p className="text-lg text-slate-600">{role === 'patient' ? 'Patient' : 'Provider'} account</p>
      <h1 className="text-4xl font-bold">Welcome, {user.name}</h1>
      <dl className="rounded-2xl border-2 border-slate-200 bg-white px-6 py-4">
        <dt className="text-sm text-slate-500">Email</dt>
        <dd className="text-lg">{user.email}</dd>
        <dt className="mt-3 text-sm text-slate-500">ID</dt>
        <dd className="font-mono text-lg">{user.id}</dd>
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
