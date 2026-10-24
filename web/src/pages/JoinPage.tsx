import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { claimCarePlan } from '../api'
import { useAuth } from '../auth'

const linkButton =
  'block rounded-xl px-6 py-4 text-center text-xl font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300'

// Where the QR handout leads. A logged-in patient whose details match gets the plan added to their account.
export default function JoinPage() {
  const token = useSearchParams()[0].get('token')
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const patientId = user?.role === 'patient' ? user.id : null
  const here = `/join?token=${encodeURIComponent(token ?? '')}`

  useEffect(() => {
    if (!token || !patientId) return
    claimCarePlan(token, patientId)
      .then((plan) => navigate(`/patient/plans/${plan.plan_id}`, { replace: true }))
      .catch((err: Error) => setError(err.message))
  }, [token, patientId, navigate])

  let body
  if (!token) {
    body = <p className="text-lg">This link is missing its code. Please scan the QR code on your handout again.</p>
  } else if (user?.role === 'provider') {
    body = (
      <>
        <p className="text-lg">You're logged in as a provider. Log out to open this plan as the patient.</p>
        <button type="button" onClick={signOut} className={`${linkButton} border-2 border-slate-300 bg-white`}>
          Log out
        </button>
      </>
    )
  } else if (!patientId) {
    const next = `?next=${encodeURIComponent(here)}`
    body = (
      <>
        <p className="text-lg">
          Log in or create your patient account to open it. Use the same name, date of birth and email your clinic
          has for you.
        </p>
        <Link to={`/patient/register${next}`} className={`${linkButton} bg-blue-700 text-white hover:bg-blue-800`}>
          Create my account
        </Link>
        <Link to={`/patient/login${next}`} className={`${linkButton} border-2 border-slate-300 bg-white`}>
          I already have an account
        </Link>
      </>
    )
  } else if (error) {
    body = (
      <>
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-lg font-medium text-red-800">
          {error}
        </p>
        <Link to="/patient/home" className={`${linkButton} border-2 border-slate-300 bg-white`}>
          Go to my account
        </Link>
        <button type="button" onClick={signOut} className={`${linkButton} border-2 border-slate-300 bg-white`}>
          Log out and use a different account
        </button>
      </>
    )
  } else {
    body = <p className="text-lg text-slate-600">Checking your details…</p>
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-12">
      <h1 className="text-3xl font-bold">Your care plan is ready</h1>
      {body}
    </main>
  )
}
