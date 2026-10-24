import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Role } from '../api'
import { useAuth } from '../auth'

// Sends anyone who isn't logged in as `role` to that role's login page
export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || user.role !== role) return <Navigate to={`/${role}/login`} replace />
  return children
}
