import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PlusIcon from '../components/PlusIcon'
import SexGenderFields, { type Sex } from '../components/SexGenderFields'

// Template only — nothing is saved yet. Exercise options will come from the exercise library later.

const THERAPY_TYPES = ['Orthopedic', 'Pediatric', 'Cardiovascular', 'Sports'] as const
type TherapyType = (typeof THERAPY_TYPES)[number]

interface ExerciseRow {
  key: number
  name: string
  sets: string
  reps: string
}

const inputClass =
  'mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-lg focus:border-blue-600 focus:outline-none'

// dob is "YYYY-MM-DD" from <input type="date">; parse the parts directly because
// new Date("YYYY-MM-DD") is UTC midnight, which is the previous day in US timezones
function ageFromDob(dob: string): string {
  const [y, m, d] = dob.split('-').map(Number)
  if (!y || !m || !d) return ''
  const today = new Date()
  let age = today.getFullYear() - y
  const hadBirthday = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d)
  if (!hadBirthday) age -= 1
  return age >= 0 ? String(age) : ''
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function PlanCreation() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex | null>(null)
  const [gender, setGender] = useState('')
  const [therapyType, setTherapyType] = useState<TherapyType | null>(null)
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [notice, setNotice] = useState(false)
  const nextKey = useRef(0)

  const today = new Date().toISOString().slice(0, 10)

  function addExercise() {
    setExercises((rows) => [...rows, { key: nextKey.current++, name: '', sets: '3', reps: '10' }])
  }

  function updateExercise(key: number, field: 'name' | 'sets' | 'reps', value: string) {
    setExercises((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  function removeExercise(key: number) {
    setExercises((rows) => rows.filter((r) => r.key !== key))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setNotice(true)
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/provider/home" className="text-blue-700 underline-offset-4 hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-bold">New care plan</h1>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6" noValidate>
        <Card title="Patient">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block font-medium sm:col-span-2">
              Full name
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block font-medium sm:col-span-2">
              Email
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block font-medium">
              Date of birth
              <input
                className={inputClass}
                type="date"
                max={today}
                value={dob}
                onChange={(e) => {
                  setDob(e.target.value)
                  setAge(ageFromDob(e.target.value))
                }}
              />
            </label>
            <label className="block font-medium">
              Age
              <input
                className={inputClass}
                type="number"
                min={0}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
              <span className="mt-1 block text-sm font-normal text-slate-500">Filled in from date of birth</span>
            </label>
            <div className="sm:col-span-2">
              <SexGenderFields sex={sex} onSexChange={setSex} gender={gender} onGenderChange={setGender} />
            </div>
          </div>
        </Card>

        <Card title="Type of physical therapy">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup">
            {THERAPY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={therapyType === t}
                onClick={() => setTherapyType(t)}
                className={`rounded-xl border-2 px-4 py-3 font-semibold transition ${
                  therapyType === t
                    ? 'border-blue-700 bg-blue-50 text-blue-800'
                    : 'border-slate-300 bg-white hover:border-slate-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Exercises">
          {exercises.length === 0 && (
            <p className="rounded-xl bg-slate-100 px-4 py-6 text-center text-slate-600">
              No exercises yet. Tap + to add one.
            </p>
          )}

          <ol className="flex flex-col gap-4">
            {exercises.map((ex, i) => (
              <li key={ex.key} className="flex items-start gap-3 rounded-xl border-2 border-slate-200 p-4">
                <span className="mt-9 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold">
                  {i + 1}
                </span>
                <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_6rem_6rem]">
                  <label className="block font-medium">
                    Exercise
                    <input
                      className={inputClass}
                      placeholder="e.g. Squat"
                      value={ex.name}
                      onChange={(e) => updateExercise(ex.key, 'name', e.target.value)}
                    />
                  </label>
                  <label className="block font-medium">
                    Sets
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={ex.sets}
                      onChange={(e) => updateExercise(ex.key, 'sets', e.target.value)}
                    />
                  </label>
                  <label className="block font-medium">
                    Reps
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={ex.reps}
                      onChange={(e) => updateExercise(ex.key, 'reps', e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeExercise(ex.key)}
                  aria-label={`Remove exercise ${i + 1}`}
                  className="mt-8 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-red-50 hover:text-red-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={addExercise}
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 py-4 font-semibold text-blue-700 hover:border-blue-600 hover:bg-blue-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-white">
              <PlusIcon className="h-5 w-5" />
            </span>
            Add exercise
          </button>
        </Card>

        {notice && (
          <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 font-medium text-amber-900">
            This is a template for now — saving care plans comes next.
          </p>
        )}

        <button
          type="submit"
          className="rounded-xl bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        >
          Save care plan
        </button>
      </form>
    </main>
  )
}
