import { Link } from 'react-router-dom'

const roles = [
  { to: '/patient/login', title: "I'm a Patient", subtitle: 'Do my exercises at home' },
  { to: '/provider/login', title: "I'm a Provider", subtitle: 'Review my patients’ progress' },
]

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-4 py-12">
      <header className="text-center">
        <h1 className="text-4xl font-bold">Rehab.io</h1>
        <p className="mt-2 text-lg text-slate-600">Who are you?</p>
      </header>
      <div className="flex flex-col gap-4">
        {roles.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            className="rounded-2xl border-2 border-slate-300 bg-white px-6 py-6 text-center shadow-sm transition hover:border-blue-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            <span className="block text-2xl font-semibold">{r.title}</span>
            <span className="mt-1 block text-slate-600">{r.subtitle}</span>
          </Link>
        ))}
      </div>
    </main>
  )
}
