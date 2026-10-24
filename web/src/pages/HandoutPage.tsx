import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getCarePlan, joinUrl, newJoinToken, type CarePlan } from '../api'
import { useAuth } from '../auth'

const buttonClass =
  'rounded-xl bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:opacity-60'

// Shown after a care plan is saved: the QR code and the printable PDF handout
export default function HandoutPage() {
  const { planId = '' } = useParams()
  const { user } = useAuth()
  // The QR token is only returned when the plan is saved (the server keeps just a hash)
  const [token, setToken] = useState<string | null>(
    (useLocation().state as { joinToken?: string } | null)?.joinToken ?? null,
  )
  const [plan, setPlan] = useState<CarePlan | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const providerId = user?.id

  useEffect(() => {
    if (!providerId) return
    getCarePlan(planId, { provider_id: providerId })
      .then(setPlan)
      .catch((err: Error) => setError(err.message))
  }, [planId, providerId])

  useEffect(() => {
    if (token) QRCode.toDataURL(joinUrl(token), { margin: 1, width: 400 }).then(setQr)
  }, [token])

  async function makeNewQr() {
    if (!providerId) return
    setBusy(true)
    setError(null)
    try {
      setToken((await newJoinToken(planId, providerId)).join_token)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    if (!plan || !token) return
    setBusy(true)
    setError(null)
    try {
      // jsPDF is large, so it's only loaded when a PDF is actually made
      const { downloadHandoutPdf } = await import('../handout/pdf')
      await downloadHandoutPdf(plan, token)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/provider/home" className="text-blue-700 underline-offset-4 hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Care plan handout</h1>

      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 font-medium text-red-800">
          {error}
        </p>
      )}
      {!plan && !error && <p className="mt-6 text-slate-600">Loading…</p>}

      {plan && (
        <section className="mt-6 flex flex-col gap-6 rounded-2xl border-2 border-slate-200 bg-white p-6">
          <div>
            <p className="text-xl font-semibold">{plan.assigned_name}</p>
            <p className="text-slate-600">
              {plan.assigned_email} · {plan.exercises.length} exercise{plan.exercises.length === 1 ? '' : 's'}
            </p>
            <p className="mt-2">
              {plan.patient_id ? (
                <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-800">
                  Linked to the patient's account
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">
                  Waiting for the patient to scan the QR code
                </span>
              )}
            </p>
          </div>

          {token ? (
            <>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {qr && <img src={qr} alt="QR code for the patient to open this plan" className="h-44 w-44" />}
                <div className="min-w-0 text-slate-600">
                  <p>
                    The patient scans this code, then logs in or signs up with the same name, date of birth and
                    email. Only a matching account can open the plan.
                  </p>
                  <p className="mt-2 break-all text-sm">{joinUrl(token)}</p>
                </div>
              </div>
              <button type="button" onClick={download} disabled={busy} className={buttonClass}>
                {busy ? 'Preparing PDF…' : 'Download PDF handout'}
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-slate-600">
                For security, the QR code is only shown right after the plan is saved. To print the handout again,
                make a new QR code. Any QR code printed earlier will stop working.
              </p>
              <button type="button" onClick={makeNewQr} disabled={busy} className={buttonClass}>
                {busy ? 'Please wait…' : 'Make a new QR code'}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
