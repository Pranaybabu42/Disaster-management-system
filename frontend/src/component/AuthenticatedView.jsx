import { lazy, Suspense } from 'react'
import EmergencyDashboard from './EmergencyDashboard.jsx'

const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'))

function AuthenticatedView({ user, accessToken, onLogout }) {
  if (user?.roles?.includes('admin')) return <Suspense fallback={<div className="session-loading">Loading admin workspace…</div>}><AdminDashboard user={user} accessToken={accessToken} onLogout={onLogout} /></Suspense>
  return <EmergencyDashboard user={user} accessToken={accessToken} onLogout={onLogout} />
}

export default AuthenticatedView
