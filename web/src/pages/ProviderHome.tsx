import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import PlusIcon from '../components/PlusIcon'

export default function ProviderHome() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
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
          <p className="mt-3 rounded-2xl bg-slate-100 px-6 py-8 text-center text-slate-600">
            No care plans yet.
          </p>
        </section>
      </main>
    </div>
  )
}
