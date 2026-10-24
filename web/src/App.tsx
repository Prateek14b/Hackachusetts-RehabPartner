import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Role } from './api'
import { AuthProvider } from './auth'
import AuthPage from './pages/AuthPage'
import Home from './pages/Home'
import Landing from './pages/Landing'

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
            <Route key={`${role}-home`} path={`/${role}/home`} element={<Home role={role} />} />,
          ])}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
