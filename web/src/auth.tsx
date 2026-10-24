import { createContext, useContext, useState, type ReactNode } from 'react'
import type { User } from './api'

const STORAGE_KEY = 'rehab.user'

interface AuthContextValue {
  user: User | null
  signIn: (user: User) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadUser)

  const signIn = (u: User) => {
    setUser(u)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    } catch {
      // storage unavailable (private mode) — session still works until refresh
    }
  }

  const signOut = () => {
    setUser(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
