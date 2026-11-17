import { useState } from 'react'
import FormInput from './FormInput.jsx'
import ActionButton from './ActionButton.jsx'
import './passwordresetpage.css'

function PasswordResetPage({ token, onReset, onBack }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (password.length < 8) nextErrors.password = 'Use at least 8 characters.'
    if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length || submitting) return
    setSubmitting(true)
    try {
      await onReset(token, password)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="password-reset-page">
      <div className="password-reset-card">
        <a className="password-reset-brand" href="#home"><span className="brand-mark" aria-hidden="true"><span /></span>Rescue<span>Grid</span></a>
        <div className="auth-eyebrow">ACCOUNT RECOVERY</div>
        <h1>Choose a new password</h1>
        <p>Set a new password for your RescueGrid account.</p>
        <form onSubmit={submit} noValidate>
          <FormInput id="resetPassword" label="New password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} error={errors.password} placeholder="At least 8 characters" autoComplete="new-password" hint="At least 8 characters" />
          <FormInput id="confirmResetPassword" label="Confirm new password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} error={errors.confirmPassword} placeholder="Re-enter your password" autoComplete="new-password" />
          <ActionButton type="submit" variant="primary" loading={submitting} className="action-button--full">Update password</ActionButton>
        </form>
        <button className="password-reset-back" type="button" onClick={onBack}>Back to sign in</button>
      </div>
    </main>
  )
}

export default PasswordResetPage
