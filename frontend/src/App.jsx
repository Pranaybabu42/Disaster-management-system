import { useCallback, useEffect, useState } from 'react'
import { authApi } from './api/auth.js'
import AuthPage from './component/AuthPage.jsx'
import AuthenticatedView from './component/AuthenticatedView.jsx'
import PasswordResetPage from './component/PasswordResetPage.jsx'
import ToastMessage from './component/ToastMessage.jsx'
import './App.css'

function App() {
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('token'))
  const [showLogin, setShowLogin] = useState(() => new URLSearchParams(window.location.search).get('login') === '1')
  const [page, setPage] = useState('login')
  const [toast, setToast] = useState(null)
  const [auth, setAuth] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)

  const notify = useCallback((message, variant = 'success') => setToast({ message, variant, id: Date.now() }), [])

  useEffect(() => {
    if (resetToken || !showLogin) return undefined
    let active = true
    authApi.refresh()
      .then((session) => { if (active) setAuth(session) })
      .catch(() => { if (active) setAuth(null) })
    return () => { active = false }
  }, [resetToken, showLogin])

  useEffect(() => {
    if (!auth?.expires_in) return undefined
    const refreshAfter = Math.max(15_000, (auth.expires_in - 60) * 1000)
    const timer = window.setTimeout(() => {
      authApi.refresh()
        .then(setAuth)
        .catch(() => { setAuth(null); notify('Your session expired. Please sign in again.', 'error') })
    }, refreshAfter)
    return () => window.clearTimeout(timer)
  }, [auth, notify])

  const handleSubmit = async (values) => {
    setSubmitting(true)
    try {
      if (page === 'register') {
        await authApi.register(values.fullName, values.email, values.password)
      }
      const session = await authApi.login(values.email, values.password, values.accountType)
      setAuth(session)
      setShowLogin(false)
      notify(page === 'register' ? 'Your account has been created.' : 'You are signed in.', 'success')
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotPassword = async (email) => {
    setForgotSubmitting(true)
    try {
      const result = await authApi.forgotPassword(email)
      notify(result.message, 'info')
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setForgotSubmitting(false)
    }
  }

  const handlePasswordReset = async (token, newPassword) => {
    try {
      const result = await authApi.resetPassword(token, newPassword)
      setResetToken(null)
      window.history.replaceState({}, '', '?login=1')
      setShowLogin(true)
      setPage('login')
      notify(result.message, 'success')
    } catch (error) {
      notify(error.message, 'error')
      return false
    }
  }

  const handleLogout = async () => {
    try {
      const currentSession = await authApi.refresh()
      await authApi.logout(currentSession.access_token)
    } catch {
      // Always clear the local session; the API clears invalid refresh cookies.
    }
    setAuth(null)
    setPage('login')
    notify('You have signed out.', 'success')
  }

  return (
    <main className="app-shell">
      {resetToken ? (
        <PasswordResetPage token={resetToken} onReset={handlePasswordReset} onBack={() => { setResetToken(null); window.history.replaceState({}, '', '?login=1'); setShowLogin(true); setPage('login') }} />
      ) : showLogin && !auth ? (
        <AuthPage mode={page} onModeChange={setPage} onSubmit={handleSubmit} onForgotPassword={handleForgotPassword} submitting={submitting} forgotSubmitting={forgotSubmitting} />
      ) : (
        <AuthenticatedView user={auth?.user || null} accessToken={auth?.access_token} onLogout={auth ? handleLogout : undefined} />
      )}
      {toast && <ToastMessage key={toast.id} {...toast} onClose={() => setToast(null)} />}
    </main>
  )
}

export default App
