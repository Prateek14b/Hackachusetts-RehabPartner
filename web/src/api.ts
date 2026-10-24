import type { Sex } from './components/SexGenderFields'

export type Role = 'patient' | 'provider'

export interface PatientDetails {
  age: number | null
  sex_assigned_at_birth: Sex | null
  gender_identity: string | null
  dob: string | null // YYYY-MM-DD
}

export interface User extends Partial<PatientDetails> {
  role: Role
  id: string
  name: string
  email: string
  created_at: string
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, init)
  } catch {
    throw new Error("Can't reach the server. Is the API running?")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errorMessage(data))
  return data as T
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function get<T>(path: string): Promise<T> {
  return request<T>(path)
}

// FastAPI returns detail as a string for HTTPException, or a list of field errors for 422s
function errorMessage(data: { detail?: unknown }): string {
  if (typeof data.detail === 'string') {
    if (data.detail === 'Patient not found' || data.detail === 'Provider not found') {
      return 'No account found with that email.'
    }
    if (data.detail.endsWith('already exists')) return 'An account with that email already exists.'
    return data.detail
  }
  if (Array.isArray(data.detail)) {
    const loc: (string | number)[] = data.detail[0]?.loc ?? []
    // care plan exercise rows: ["body", "exercises", <row>, <field>]
    if (loc[1] === 'exercises') {
      if (typeof loc[2] !== 'number') return 'Add at least one exercise.'
      const field = loc[3] === 'sets' || loc[3] === 'reps' ? `${loc[3]} must be at least 1` : 'please check this row'
      return `Exercise ${loc[2] + 1}: ${field}.`
    }
    if (loc[1] === 'patient_email') return "Please enter the patient's email address."
    const field = loc[loc.length - 1]
    if (field === 'email') return 'Please enter a valid email address.'
    if (field === 'name') return 'Please enter your name.'
    if (field === 'age') return 'Please enter an age between 0 and 120.'
    if (field === 'gender_identity') return 'Gender identity must be 50 characters or fewer.'
    if (field === 'dob' || field === 'patient_dob') return 'Please enter a valid date of birth.'
    if (field === 'patient_name') return "Please enter the patient's full name."
  }
  return 'Something went wrong. Please try again.'
}

type ApiRecord = Record<string, string> & Partial<PatientDetails>

function toUser(role: Role, r: ApiRecord): User {
  const user: User = { role, id: r[`${role}_id`], name: r.name, email: r.email, created_at: r.created_at }
  if (role === 'patient') {
    user.age = r.age ?? null
    user.sex_assigned_at_birth = r.sex_assigned_at_birth ?? null
    user.gender_identity = r.gender_identity ?? null
    user.dob = r.dob ?? null
  }
  return user
}

// `details` is only sent for patients
export async function register(role: Role, name: string, email: string, details?: PatientDetails): Promise<User> {
  return toUser(role, await post<ApiRecord>(`/${role}s/register`, { name, email, ...details }))
}

export async function login(role: Role, email: string): Promise<User> {
  return toUser(role, await post<ApiRecord>(`/${role}s/login`, { email }))
}

// --- Care plans ---

export type TherapyType = 'orthopedic' | 'pediatric' | 'cardiovascular' | 'sports'
export type Side = 'left' | 'right' | 'both'
export type PlanStatus = 'pending' | 'active' | 'completed'

// Either a library exercise (exercise_id + target_rom) or a custom one (custom_name only)
export interface PlanExerciseInput {
  exercise_id?: string
  custom_name?: string
  sets: number
  reps: number
  target_rom?: number
  side: Side
}

export interface CarePlanSummary {
  plan_id: string
  patient_id: string | null // set once the patient scans the QR and their details match
  provider_id: string
  provider_name: string
  therapy_type: TherapyType | null
  status: PlanStatus
  created_at: string
  claimed_at: string | null
  token_expires_at: string
  assigned_name: string
  assigned_email: string
  exercise_count: number
}

export interface PlanExercise extends PlanExerciseInput {
  position: number
  name: string
  metric: string | null
}

export interface CarePlan extends Omit<CarePlanSummary, 'exercise_count'> {
  assigned_dob: string
  exercises: PlanExercise[]
}

export function createCarePlan(plan: {
  provider_id: string
  patient_name: string
  patient_dob: string
  patient_email: string
  therapy_type: TherapyType | null
  exercises: PlanExerciseInput[]
}): Promise<CarePlan & { join_token: string }> {
  return post<CarePlan & { join_token: string }>('/care-plans', plan)
}

export function listCarePlans(providerId: string): Promise<CarePlanSummary[]> {
  return get<CarePlanSummary[]>(`/care-plans?provider_id=${encodeURIComponent(providerId)}`)
}

// Only the plan's provider, or the patient it's linked to, can read it
export function getCarePlan(planId: string, viewer: { provider_id: string } | { patient_id: string }) {
  const [key, id] = Object.entries(viewer)[0]
  return get<CarePlan>(`/care-plans/${encodeURIComponent(planId)}?${key}=${encodeURIComponent(id)}`)
}

// New QR code for the handout; the previous one stops working
export function newJoinToken(planId: string, providerId: string): Promise<{ join_token: string }> {
  return post<{ join_token: string }>(`/care-plans/${encodeURIComponent(planId)}/join-token`, {
    provider_id: providerId,
  })
}

// Patient opened the QR link: link the plan to their account if their details match
export function claimCarePlan(token: string, patientId: string): Promise<CarePlan> {
  return post<CarePlan>('/care-plans/claim', { token, patient_id: patientId })
}

export function listPatientCarePlans(patientId: string): Promise<CarePlanSummary[]> {
  return get<CarePlanSummary[]>(`/patients/${encodeURIComponent(patientId)}/care-plans`)
}

export function joinUrl(token: string): string {
  return `${window.location.origin}/join?token=${encodeURIComponent(token)}`
}

// --- Camera consent and sessions ---

export const CONSENT_VERSION = '2026-10-v1' // bump when the consent screen's wording changes

export interface Consent {
  consent_id: string
  version: string
  agreed_at: string
}

export function getConsent(planId: string, patientId: string): Promise<{ consent: Consent | null }> {
  return get(`/care-plans/${encodeURIComponent(planId)}/consent?patient_id=${encodeURIComponent(patientId)}`)
}

export function giveConsent(planId: string, patientId: string): Promise<Consent> {
  return post<Consent>(`/care-plans/${encodeURIComponent(planId)}/consent`, {
    patient_id: patientId,
    version: CONSENT_VERSION,
  })
}

export interface ExerciseResult {
  position: number
  sets_completed: number
  reps_completed: number
  reps_at_target: number
  peak_rom: number | null // camera-tracked exercises only
  pain: number | null
}

export interface SessionExercise extends ExerciseResult {
  exercise_id: string | null
  name: string
  sets_target: number
  reps_target: number
  target_rom: number | null
  new_best: boolean // furthest range of motion of any session so far
}

export interface Session {
  session_id: string
  started_at: string
  ended_at: string
  completed: boolean
  exercises: SessionExercise[]
}

export interface Progress {
  plan: CarePlan
  sessions: Session[] // newest first
  bests: Record<string, { best_rom: number; achieved_at: string }> // by exercise position
}

export function saveSession(
  planId: string,
  session: { patient_id: string; started_at: string; ended_at: string; exercises: ExerciseResult[] },
): Promise<Session> {
  return post<Session>(`/care-plans/${encodeURIComponent(planId)}/sessions`, session)
}

export function getProgress(planId: string, viewer: { provider_id: string } | { patient_id: string }) {
  const [key, id] = Object.entries(viewer)[0]
  return get<Progress>(`/care-plans/${encodeURIComponent(planId)}/progress?${key}=${encodeURIComponent(id)}`)
}
