import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CONSENT_VERSION,
  getCarePlan,
  getConsent,
  saveSession,
  type CarePlan,
  type ExerciseResult,
  type PlanExercise,
  type Session,
} from '../api'
import { useAuth } from '../auth'
import AngleGauge from '../components/AngleGauge'
import DemoFigure from '../components/DemoFigure'
import PainScale from '../components/PainScale'
import { EXERCISES, type ExerciseMotion } from '../exercises/library'
import { getPoseLandmarker } from '../pose/landmarker'
import { RepCounter, Smoother, measure, wholeBodyVisible, type RepEvent } from '../pose/tracking'

const REST_SECONDS = 30
const COUNTDOWN_FROM = 3

type Phase =
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'intro'; index: number }
  | { kind: 'countdown'; index: number; n: number }
  | { kind: 'active'; index: number }
  | { kind: 'rest'; index: number; secondsLeft: number }
  | { kind: 'pain'; index: number }
  | { kind: 'saving' }
  | { kind: 'summary'; session: Session }
  | { kind: 'error'; message: string }

interface Live {
  poseFound: boolean
  bodyVisible: boolean
  value: number | null // current measurement, smoothed
}

const emptyResult = (position: number): ExerciseResult => ({
  position,
  sets_completed: 0,
  reps_completed: 0,
  reps_at_target: 0,
  peak_rom: null,
  pain: null,
})

// This session's result row for a plan exercise, created on first use
function resultFor(results: Record<number, ExerciseResult>, position: number): ExerciseResult {
  return (results[position] ??= emptyResult(position))
}

function libraryExercise(ex: PlanExercise | undefined): ExerciseMotion | undefined {
  return ex?.target_rom != null ? EXERCISES.find((m) => m.id === ex.exercise_id) : undefined
}

const panelButton =
  'w-full rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300 disabled:opacity-40'
const primary = `${panelButton} bg-sky-500 text-slate-950 hover:bg-sky-400`
const secondary = `${panelButton} border-2 border-slate-600 text-white hover:border-slate-400`

// The guided exercise session: webcam + MediaPipe pose tracking, rep/set counting, rests and pain ratings
export default function SessionPage() {
  const { planId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const patientId = user?.id

  const [plan, setPlan] = useState<CarePlan | null>(null)
  const [phase, setPhaseState] = useState<Phase>({ kind: 'loading' })
  const [live, setLive] = useState<Live>({ poseFound: false, bodyVisible: false, value: null })
  const [feedback, setFeedback] = useState<string | null>(null)
  const [voiceOn, setVoiceOn] = useState(true)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [aspect, setAspect] = useState(16 / 9)
  const [, rerender] = useReducer((x: number) => x + 1, 0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const visionRef = useRef<typeof import('@mediapipe/tasks-vision') | null>(null)
  const phaseRef = useRef<Phase>(phase)
  const planRef = useRef<CarePlan | null>(null)
  const voiceRef = useRef(voiceOn)
  const counterRef = useRef<RepCounter | null>(null)
  const smootherRef = useRef(new Smoother())
  // Workout progress lives in a ref so the video loop always sees the latest values
  const workout = useRef({
    startedAt: null as string | null,
    setNumber: 1,
    repsInSet: 0,
    results: {} as Record<number, ExerciseResult>,
  })

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])

  const speak = useCallback((text: string) => {
    if (!voiceRef.current || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }, [])

  useEffect(() => {
    voiceRef.current = voiceOn
  }, [voiceOn])

  // --- Finishing ---

  const finish = useCallback(async () => {
    const currentPlan = planRef.current
    if (!currentPlan || !patientId) return
    setConfirmEnd(false)
    setPhase({ kind: 'saving' })
    const w = workout.current
    try {
      const session = await saveSession(currentPlan.plan_id, {
        patient_id: patientId,
        started_at: w.startedAt ?? new Date().toISOString(),
        ended_at: new Date().toISOString(),
        exercises: Object.values(w.results),
      })
      setPhase({ kind: 'summary', session })
      speak('Great work today. Your results have been shared with your clinic.')
    } catch (err) {
      setPhase({ kind: 'error', message: (err as Error).message })
    }
  }, [patientId, setPhase, speak])

  const goToExercise = useCallback(
    (index: number) => {
      const exercises = planRef.current?.exercises ?? []
      if (index >= exercises.length) {
        void finish()
        return
      }
      workout.current.setNumber = 1
      workout.current.repsInSet = 0
      setFeedback(null)
      setPhase({ kind: 'intro', index })
    },
    [finish, setPhase],
  )

  // --- Counting ---

  const completeSet = useCallback(
    (index: number) => {
      const ex = planRef.current!.exercises[index]
      const w = workout.current
      resultFor(w.results, ex.position).sets_completed += 1
      if (w.setNumber < ex.sets) {
        speak(`Set ${w.setNumber} done. Rest.`)
        setPhase({ kind: 'rest', index, secondsLeft: REST_SECONDS })
      } else {
        speak(`${ex.name} complete.`)
        setPhase({ kind: 'pain', index })
      }
      rerender()
    },
    [setPhase, speak],
  )

  const onRep = useCallback(
    (index: number, rep: RepEvent) => {
      const ex = planRef.current!.exercises[index]
      const w = workout.current
      const r = resultFor(w.results, ex.position)
      r.reps_completed += 1
      if (rep.hitTarget) r.reps_at_target += 1
      r.peak_rom = Math.max(r.peak_rom ?? 0, Math.round(rep.peak))
      w.repsInSet += 1
      setFeedback(rep.hitTarget ? 'Great, you reached the target!' : 'Good rep. Try to go a little further.')
      speak(String(w.repsInSet))
      if (w.repsInSet >= ex.reps) completeSet(index)
      else rerender()
    },
    [completeSet, speak],
  )

  // Untracked ("Other") exercises: the patient taps when a set is done
  function finishManualSet(index: number) {
    const ex = plan!.exercises[index]
    resultFor(workout.current.results, ex.position).reps_completed += ex.reps
    workout.current.repsInSet = ex.reps
    completeSet(index)
  }

  // --- Video loop: pose detection, overlay, measurement ---

  const onFrame = useCallback(
    (res: PoseLandmarkerResult) => {
      const image = res.landmarks[0]
      const world = res.worldLandmarks[0]
      const p = phaseRef.current
      const index = 'index' in p ? p.index : -1
      const ex = planRef.current?.exercises[index]
      const def = libraryExercise(ex)

      // overlay
      const canvas = canvasRef.current
      const vision = visionRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx && vision) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (image) {
          const draw = new vision.DrawingUtils(ctx)
          draw.drawConnectors(image, vision.PoseLandmarker.POSE_CONNECTIONS, {
            color: 'rgba(255,255,255,0.75)',
            lineWidth: 4,
          })
          draw.drawLandmarks(image, { color: '#38bdf8', radius: 3 })
          if (def && ex) {
            const sides = ex.side === 'both' ? (['left', 'right'] as const) : [ex.side]
            const points = sides.flatMap((s) => def.anglePoints[s].indices.map((i) => image[i]))
            draw.drawLandmarks(points, { color: '#fbbf24', radius: 8 })
          }
        }
      }

      let value: number | null = null
      if (image && world && def && ex) {
        const m = measure(def, ex.side, world, image)
        if (m) value = smootherRef.current.update(m.value)
      }
      setLive({ poseFound: !!image, bodyVisible: wholeBodyVisible(image), value })

      if (p.kind === 'active' && value !== null && counterRef.current) {
        const rep = counterRef.current.update(value)
        if (rep) onRep(p.index, rep)
      }
    },
    [onRep],
  )

  // Load plan, check consent, start camera + MediaPipe, run the detection loop
  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    let stream: MediaStream | null = null
    let raf = 0

    async function start() {
      try {
        const [p, c] = await Promise.all([
          getCarePlan(planId, { patient_id: patientId! }),
          getConsent(planId, patientId!),
        ])
        if (cancelled) return
        if (c.consent?.version !== CONSENT_VERSION) {
          navigate(`/patient/plans/${planId}/start`, { replace: true })
          return
        }
        planRef.current = p
        setPlan(p)

        const [media, landmarker, vision] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          }),
          getPoseLandmarker(),
          import('@mediapipe/tasks-vision'),
        ])
        stream = media
        if (cancelled) return
        landmarkerRef.current = landmarker
        visionRef.current = vision
        const video = videoRef.current!
        video.srcObject = media
        await video.play()
        setAspect(video.videoWidth / video.videoHeight || 16 / 9)
        setPhase({ kind: 'setup' })

        let lastTime = -1
        const loop = () => {
          if (cancelled) return
          if (video.readyState >= 2 && video.currentTime !== lastTime) {
            lastTime = video.currentTime
            const canvas = canvasRef.current
            if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
            }
            onFrame(landmarker.detectForVideo(video, performance.now()))
          }
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
      } catch (err) {
        if (cancelled) return
        const e = err as Error
        const message =
          e.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.'
            : e.name === 'NotFoundError'
              ? "We couldn't find a camera on this device."
              : e.message || 'Something went wrong starting the session.'
        setPhase({ kind: 'error', message })
      }
    }
    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      window.speechSynthesis?.cancel()
    }
  }, [planId, patientId, navigate, onFrame, setPhase])

  // Stop the camera once the session is over
  useEffect(() => {
    if (phase.kind === 'summary' || phase.kind === 'error') {
      const stream = videoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [phase.kind])

  // Countdown and rest timers
  useEffect(() => {
    if (phase.kind === 'countdown') {
      speak(String(phase.n))
      const t = setTimeout(() => {
        if (phase.n > 1) {
          setPhase({ ...phase, n: phase.n - 1 })
          return
        }
        const ex = planRef.current!.exercises[phase.index]
        const def = libraryExercise(ex)
        counterRef.current = def ? new RepCounter(ex.target_rom!) : null
        smootherRef.current.reset()
        workout.current.repsInSet = 0
        setFeedback(def ? 'Start from your starting position.' : null)
        speak('Go!')
        setPhase({ kind: 'active', index: phase.index })
      }, 1000)
      return () => clearTimeout(t)
    }
    if (phase.kind === 'rest') {
      const t = setTimeout(() => {
        if (phase.secondsLeft > 1) {
          setPhase({ ...phase, secondsLeft: phase.secondsLeft - 1 })
        } else {
          workout.current.setNumber += 1
          setPhase({ kind: 'countdown', index: phase.index, n: COUNTDOWN_FROM })
        }
      }, 1000)
      return () => clearTimeout(t)
    }
  }, [phase, setPhase, speak])

  // --- Rendering ---

  const exercises = plan?.exercises ?? []
  const index = 'index' in phase ? phase.index : -1
  const current = exercises[index]
  const def = libraryExercise(current)
  const w = workout.current

  if (phase.kind === 'summary')
    return <Summary session={phase.session} providerName={plan?.provider_name ?? 'your clinic'} />

  if (phase.kind === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold">We couldn't start your session</h1>
          <p className="mt-3 text-lg text-slate-300">{phase.message}</p>
          <Link to={`/patient/plans/${planId}`} className={`${secondary} mt-6 block`}>
            Back to my plan
          </Link>
        </div>
      </main>
    )
  }

  let videoMessage: string | null = null
  if (phase.kind !== 'loading' && phase.kind !== 'saving') {
    if (!live.poseFound) videoMessage = 'Step into the camera view'
    else if (def && live.value === null && (phase.kind === 'active' || phase.kind === 'countdown'))
      videoMessage = 'Turn side-on so we can see the highlighted joints'
    else if (
      phase.kind === 'active' &&
      def &&
      counterRef.current &&
      !counterRef.current.atStart &&
      !counterRef.current.moving
    )
      videoMessage = 'Get into your starting position'
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <p className="text-sm text-slate-400">
            {current ? `Exercise ${index + 1} of ${exercises.length}` : 'Exercise session'}
          </p>
          <p className="text-xl font-semibold">{current?.name ?? 'Getting ready'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            aria-pressed={voiceOn}
            className="rounded-xl border-2 border-slate-600 px-4 py-2 font-semibold hover:border-slate-400"
          >
            Voice {voiceOn ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            disabled={phase.kind === 'loading' || phase.kind === 'saving'}
            className="rounded-xl bg-white px-4 py-2 font-bold text-slate-950 hover:bg-slate-200 disabled:opacity-40"
          >
            Done for the day
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section
          className="relative self-start overflow-hidden rounded-3xl bg-black shadow-2xl"
          style={{ aspectRatio: String(aspect) }}
        >
          {/* mirrored, like looking in a mirror */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
          />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100" />
          {phase.kind === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center text-xl text-slate-300">
              Starting your camera…
            </div>
          )}
          {videoMessage && (
            <p className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-5 py-2 text-lg font-bold whitespace-nowrap text-slate-950">
              {videoMessage}
            </p>
          )}
          {phase.kind === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-9xl font-black tabular-nums drop-shadow-lg">{phase.n}</span>
            </div>
          )}
          {phase.kind === 'active' && current && (
            <div className="absolute bottom-4 left-4 rounded-2xl bg-black/60 px-5 py-3 backdrop-blur">
              <span className="text-5xl font-black tabular-nums">{w.repsInSet}</span>
              <span className="text-2xl text-slate-300"> / {current.reps}</span>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-5 rounded-3xl bg-slate-900 p-6">
          {phase.kind === 'loading' && (
            <p className="text-lg text-slate-300">Loading body tracking. This can take a few seconds the first time.</p>
          )}

          {phase.kind === 'setup' && (
            <>
              <h2 className="text-2xl font-bold">Let's check your setup</h2>
              <ul className="flex flex-col gap-3 text-lg">
                {[
                  ['Camera is on', true],
                  ['We can see you', live.poseFound],
                  ['Your whole body is in view', live.bodyVisible],
                ].map(([label, ok]) => (
                  <li key={String(label)} className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full font-bold ${ok ? 'bg-green-500 text-slate-950' : 'bg-slate-700 text-slate-400'}`}
                      aria-hidden="true"
                    >
                      {ok ? '✓' : '…'}
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
              {!live.bodyVisible && (
                <p className="text-slate-300">Step back until your head and feet are both in the picture.</p>
              )}
              <button
                type="button"
                className={primary}
                disabled={!live.bodyVisible}
                onClick={() => {
                  workout.current.startedAt = new Date().toISOString()
                  goToExercise(0)
                }}
              >
                Start exercises
              </button>
              {!live.bodyVisible && (
                <button
                  type="button"
                  className="text-slate-300 underline underline-offset-4"
                  onClick={() => {
                    workout.current.startedAt = new Date().toISOString()
                    goToExercise(0)
                  }}
                >
                  Start anyway
                </button>
              )}
            </>
          )}

          {phase.kind === 'intro' && current && (
            <>
              <h2 className="text-3xl font-bold">{current.name}</h2>
              {def && current.target_rom != null && (
                <div className="rounded-2xl bg-white p-2">
                  <DemoFigure exercise={def} target={current.target_rom} />
                </div>
              )}
              <p className="text-xl">
                {current.sets} sets × {current.reps} reps
                {current.side !== 'both' && <span className="text-slate-300"> · {current.side} side</span>}
              </p>
              {def && current.target_rom != null ? (
                <p className="text-lg text-slate-300">
                  {def.hint}: aim for the dashed line ({current.target_rom}° {def.metric.toLowerCase()}). Stand side-on
                  to the camera. We'll count your reps.
                </p>
              ) : (
                <p className="text-lg text-slate-300">Do each set, then tap the button to record it.</p>
              )}
              <button
                type="button"
                className={primary}
                onClick={() => setPhase({ kind: 'countdown', index, n: COUNTDOWN_FROM })}
              >
                I'm ready
              </button>
              <button type="button" className={secondary} onClick={() => goToExercise(index + 1)}>
                Skip this exercise
              </button>
            </>
          )}

          {(phase.kind === 'countdown' || phase.kind === 'active') && current && (
            <>
              <p className="text-lg text-slate-300">
                Set {w.setNumber} of {current.sets}
              </p>
              {def && current.target_rom != null ? (
                <>
                  <AngleGauge value={live.value} target={current.target_rom} max={def.fullRom} label={def.metric} />
                  <p className="min-h-14 text-center text-xl font-semibold text-sky-300" aria-live="polite">
                    {feedback}
                  </p>
                  <div className="rounded-2xl bg-white p-2">
                    <DemoFigure exercise={def} target={current.target_rom} />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold">
                    Do {current.reps} reps of {current.name}
                  </p>
                  <button
                    type="button"
                    className={primary}
                    disabled={phase.kind !== 'active'}
                    onClick={() => finishManualSet(index)}
                  >
                    I finished set {w.setNumber}
                  </button>
                </>
              )}
              <button type="button" className={secondary} onClick={() => goToExercise(index + 1)}>
                Skip the rest of this exercise
              </button>
            </>
          )}

          {phase.kind === 'rest' && current && (
            <>
              <h2 className="text-3xl font-bold">Nice work! Take a rest.</h2>
              <p className="text-center text-8xl font-black tabular-nums">{phase.secondsLeft}</p>
              <p className="text-center text-lg text-slate-300">
                Next: set {w.setNumber + 1} of {current.sets}
              </p>
              <button
                type="button"
                className={primary}
                onClick={() => {
                  workout.current.setNumber += 1
                  setPhase({ kind: 'countdown', index, n: COUNTDOWN_FROM })
                }}
              >
                I'm ready now
              </button>
            </>
          )}

          {phase.kind === 'pain' && current && (
            <>
              <h2 className="text-2xl font-bold">How much pain did you feel during {current.name}?</h2>
              <PainScale
                onSelect={(pain) => {
                  resultFor(workout.current.results, current.position).pain = pain
                  goToExercise(index + 1)
                }}
              />
            </>
          )}

          {phase.kind === 'saving' && <p className="text-xl text-slate-300">Saving your results…</p>}
        </aside>
      </main>

      {confirmEnd && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">Done for the day?</h2>
            <p className="mt-2 text-lg text-slate-300">
              We'll save what you've done so far and share it with your clinic. You can do the rest another time.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button type="button" className={primary} onClick={() => void finish()}>
                Yes, I'm done for today
              </button>
              <button type="button" className={secondary} onClick={() => setConfirmEnd(false)}>
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Summary({ session, providerName }: { session: Session; providerName: string }) {
  const done = session.exercises.filter((e) => e.sets_completed > 0)
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-lg text-sky-300">{session.completed ? 'Session complete' : 'Saved for today'}</p>
        <h1 className="mt-1 text-4xl font-bold">{session.completed ? 'You did it! 🎉' : 'Great effort today'}</h1>
        <p className="mt-2 text-lg text-slate-300">
          {done.length} of {session.exercises.length} exercises done. Your results have been shared with {providerName}.
        </p>

        <ul className="mt-8 flex flex-col gap-4">
          {session.exercises.map((e) => (
            <li key={e.position} className="rounded-2xl bg-slate-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">{e.name}</h2>
                {e.new_best && (
                  <span className="rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-slate-950">
                    New personal best!
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Sets" value={`${e.sets_completed} / ${e.sets_target}`} />
                <Stat label="Reps" value={`${e.reps_completed} / ${e.sets_target * e.reps_target}`} />
                {e.target_rom != null && (
                  <Stat
                    label="Best range"
                    value={e.peak_rom != null ? `${e.peak_rom}°` : '–'}
                    sub={`target ${e.target_rom}°`}
                  />
                )}
                <Stat label="Pain" value={e.pain != null ? `${e.pain} / 10` : '–'} />
              </dl>
            </li>
          ))}
        </ul>

        <Link
          to="/patient/home"
          className="mt-8 block rounded-2xl bg-sky-500 px-6 py-4 text-center text-xl font-bold text-slate-950 hover:bg-sky-400"
        >
          Back to my schedule
        </Link>
      </div>
    </main>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
      {sub && <dd className="text-sm text-slate-400">{sub}</dd>}
    </div>
  )
}
