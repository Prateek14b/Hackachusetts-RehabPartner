import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Role } from './api'
import { AuthProvider } from './auth'
import RequireRole from './components/RequireRole'
import AuthPage from './pages/AuthPage'
import Landing from './pages/Landing'
import PatientHome from './pages/PatientHome'
import PlanCreation from './pages/PlanCreation'
import ProviderHome from './pages/ProviderHome'

const roles: Role[] = ['patient', 'provider']

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          {roles.flatMap((role) => [
            <Route key={`${role}-login`} path={`/${role}/login`} element={<AuthPage role={role} mode="login" />} />,
            <Route key={`${role}-register`} path={`/${role}/register`} element={<AuthPage role={role} mode="register" />} />,
          ])}
          <Route path="/patient/home" element={<RequireRole role="patient"><PatientHome /></RequireRole>} />
          <Route path="/provider/home" element={<RequireRole role="provider"><ProviderHome /></RequireRole>} />
          <Route path="/provider/plans/new" element={<RequireRole role="provider"><PlanCreation /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
