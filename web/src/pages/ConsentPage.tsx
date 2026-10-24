import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CONSENT_VERSION, getCarePlan, getConsent, giveConsent, type CarePlan, type Consent } from '../api'
import { useAuth } from '../auth'

function InfoCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-4 rounded-2xl border-2 border-slate-200 bg-white p-5">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
        {icon}
      </span>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="mt-1 text-lg text-slate-700">{children}</div>
      </div>
    </section>
  )
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-6 w-6',
  'aria-hidden': true,
}

const SETUP_TIPS = [
  'Clear a space about 2 metres (6–8 feet) in front of the camera.',
  'Stand side-on to the camera so it can see your arms and legs bend.',
  'Make sure the room is well lit, with no bright window behind you.',
  'Keep a sturdy chair nearby for support or seated exercises.',
]

// Shown before every session: what the camera does, what stays private, what the clinic sees
export default function ConsentPage() {
  const { planId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<CarePlan | null>(null)
  const [previous, setPrevious] = useState<Consent | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const patientId = user?.id

  useEffect(() => {
    if (!patientId) return
    Promise.all([getCarePlan(planId, { patient_id: patientId }), getConsent(planId, patientId)])
      .then(([p, c]) => {
        setPlan(p)
        setPrevious(c.consent)
        setAgreed(c.consent?.version === CONSENT_VERSION)
      })
      .catch((err: Error) => setError(err.message))
  }, [planId, patientId])

  async function start() {
    if (!patientId) return
    setSaving(true)
    setError(null)
    try {
      if (previous?.version !== CONSENT_VERSION) await giveConsent(planId, patientId)
      navigate(`/patient/plans/${planId}/session`)
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  const clinic = plan?.provider_name ?? 'your clinic'

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to={`/patient/plans/${planId}`} className="text-lg text-blue-700 underline-offset-4 hover:underline">
        ← Back to my plan
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Before we turn on your camera</h1>
      <p className="mt-2 text-lg text-slate-600">
        Your camera lets us count your reps and see how far you move, so {clinic} can follow your progress.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <InfoCard
          title="What the camera does"
          icon={
            <svg {...iconProps}>
              <circle cx="12" cy="5" r="2" />
              <path d="M12 7v6m0 0-3 7m3-7 3 7M7 10h10" />
            </svg>
          }
        >
          It finds points on your body, like your hips, knees and shoulders, to count reps and measure how far you
          bend or reach.
        </InfoCard>
        <InfoCard
          title="Your video stays on this device"
          icon={
            <svg {...iconProps}>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          }
        >
          The video is processed right here in your browser. It is never recorded, saved or sent anywhere.
        </InfoCard>
        <InfoCard
          title={`What ${clinic} sees`}
          icon={
            <svg {...iconProps}>
              <path d="M4 19V9m6 10V5m6 14v-7m4 7H2" />
            </svg>
          }
        >
          Only numbers: sets and reps completed, how far you moved, and the pain ratings you give. This helps your
          clinic monitor your exercises. It is not a diagnosis.
        </InfoCard>
      </div>

      <section className="mt-6 rounded-2xl bg-slate-100 p-5">
        <h2 className="text-xl font-semibold">Getting set up</h2>
        <ul className="mt-2 flex flex-col gap-2 text-lg">
          {SETUP_TIPS.map((tip) => (
            <li key={tip} className="flex gap-3">
              <span aria-hidden="true" className="font-bold text-blue-700">
                ✓
              </span>
              {tip}
            </li>
          ))}
        </ul>
      </section>

      {previous && (
        <p className="mt-6 text-slate-600">
          You agreed to camera use on {new Date(previous.agreed_at).toLocaleDateString()}. You can stop the camera at
          any time by leaving the session.
        </p>
      )}

      <label className="mt-6 flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-slate-300 bg-white p-5 text-lg">
        <input
          type="checkbox"
          className="mt-1 h-6 w-6 shrink-0 accent-blue-700"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          I agree to use my camera for this exercise session, and to share my exercise numbers with {clinic}.
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-lg font-medium text-red-800">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={start}
          disabled={!agreed || saving || !plan}
          className="flex-1 rounded-xl bg-blue-700 px-6 py-4 text-xl font-bold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:opacity-50"
        >
          {saving ? 'Please wait…' : 'Turn on camera'}
        </button>
        <Link
          to={`/patient/plans/${planId}`}
          className="rounded-xl border-2 border-slate-300 bg-white px-6 py-4 text-center text-xl font-semibold hover:border-slate-500"
        >
          Not now
        </Link>
      </div>
    </main>
  )
}
