export type Role = 'patient' | 'provider'

export interface User {
  role: Role
  id: string
  name: string
  email: string
  created_at: string
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("Can't reach the server. Is the API running?")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(errorMessage(res.status, data))
  return data as T
}

// FastAPI returns detail as a string for HTTPException, or a list of field errors for 422s
function errorMessage(status: number, data: { detail?: unknown }): string {
  if (typeof data.detail === 'string') {
    if (status === 404) return 'No account found with that email.'
    if (data.detail.endsWith('already exists')) return 'An account with that email already exists.'
    return data.detail
  }
  if (Array.isArray(data.detail)) {
    const field = data.detail[0]?.loc?.at(-1)
    if (field === 'email') return 'Please enter a valid email address.'
    if (field === 'name') return 'Please enter your name.'
  }
  return 'Something went wrong. Please try again.'
}

type ApiRecord = Record<string, string>

function toUser(role: Role, r: ApiRecord): User {
  return { role, id: r[`${role}_id`], name: r.name, email: r.email, created_at: r.created_at }
}

export async function register(role: Role, name: string, email: string): Promise<User> {
  return toUser(role, await post<ApiRecord>(`/${role}s/register`, { name, email }))
}

export async function login(role: Role, email: string): Promise<User> {
  return toUser(role, await post<ApiRecord>(`/${role}s/login`, { email }))
}
