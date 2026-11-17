import { useState } from 'react'
import FormInput from './FormInput.jsx'
import FormCheckbox from './FormCheckbox.jsx'
import ActionButton from './ActionButton.jsx'
import './authpage.css'

const initialValues = { fullName: '', email: '', password: '', confirmPassword: '' }
const demoAccounts = [
  { type: 'admin', label: 'Admin Login', name: 'Administrator', email: 'admin@rescuegrid.local', password: 'AdminDemo!2026' },
  { type: 'user', label: 'User Login', name: 'Community user', email: 'user@rescuegrid.local', password: 'UserDemo!2026' },
  { type: 'rescue_team', label: 'Rescue Team Login', name: 'Rescue responder', email: 'responder@rescuegrid.local', password: 'RescueDemo!2026' },
]

function AuthPage({ mode, onModeChange, onSubmit, onForgotPassword, submitting = false, forgotSubmitting = false }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [remember, setRemember] = useState(true)
  const isRegister = mode === 'register'

  const updateField = (event) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
  }

  const validate = () => {
    const nextErrors = {}
    if (isRegister && !values.fullName.trim()) nextErrors.fullName = 'Enter your full name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) nextErrors.email = 'Enter a valid email address.'
    if (values.password.length < 8) nextErrors.password = 'Use at least 8 characters.'
    if (isRegister && values.confirmPassword !== values.password) nextErrors.confirmPassword = 'Passwords do not match.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = (event) => {
    event.preventDefault()
    if (!submitting && validate()) onSubmit({ ...values, remember })
  }

  const switchMode = (nextMode) => {
    setErrors({})
    setValues(initialValues)
    onModeChange(nextMode)
  }

  return (
    <div className="auth-layout container-fluid p-0">
      <section className="auth-story" aria-label="RescueGrid emergency coordination">
        <div className="story-content">
          <a className="brand-lockup" href="#home" aria-label="RescueGrid home">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span>Rescue<span className="brand-light">Grid</span></span>
          </a>
          <div className="story-copy">
            <div className="live-label"><span /> RESPONSE NETWORK ONLINE</div>
            <h1>When every<br />second counts.</h1>
            <p>One connected network for communities, responders, and the people who need help most.</p>
            <div className="network-visual" aria-hidden="true">
              <div className="network-grid" />
              <div className="route route-one" /><div className="route route-two" />
              <span className="map-point point-one" /><span className="map-point point-two" /><span className="map-point point-three" />
              <div className="map-card map-card--top"><span className="map-card__pulse" /><span><b>Regional coordination</b><small>All teams connected</small></span><i>●</i></div>
              <div className="map-card map-card--bottom"><span className="map-card__icon">⌖</span><span><b>Response time</b><small>Resources ready to deploy</small></span><strong>LIVE</strong></div>
            </div>
          </div>
          <div className="story-footer"><span>BUILT FOR RESILIENCE</span><span>01 <i /> 03</span></div>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-mobile-brand brand-lockup" aria-hidden="true"><span className="brand-mark"><span /></span><span>Rescue<span className="brand-light">Grid</span></span></div>
        <div className="auth-form-wrap">
          <div className="auth-eyebrow">{isRegister ? 'GET STARTED' : 'SECURE ACCESS'}</div>
          <h2 id="auth-title">{isRegister ? 'Create your account' : 'Welcome back'}</h2>
          <p className="auth-intro">{isRegister ? 'Join the network helping communities stay prepared.' : 'Sign in to your emergency coordination workspace.'}</p>

          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button>
            <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? 'active' : ''} onClick={() => switchMode('register')}>Create account</button>
          </div>

          {!isRegister && import.meta.env.DEV && (
            <div className="demo-access">
              <div className="demo-access__heading"><span>LOCAL TESTING</span><span>DEMO ACCESS</span></div>
              <div className="demo-access__buttons">
                {demoAccounts.map((account) => (
                  <button
                    className="demo-access__button"
                    key={account.type}
                    type="button"
                    disabled={submitting}
                    onClick={() => onSubmit({ email: account.email, password: account.password, accountType: account.type, remember: true })}
                  >
                    <strong>{account.label}</strong><small>{account.name}</small>
                  </button>
                ))}
              </div>
              <p>One click signs in with the matching local demo account.</p>
            </div>
          )}

          <form onSubmit={submit} noValidate>
            {isRegister && <FormInput id="fullName" label="Full name" value={values.fullName} onChange={updateField} error={errors.fullName} placeholder="e.g. Jordan Lee" autoComplete="name" icon="♙" />}
            <FormInput id="email" label="Work email" type="email" value={values.email} onChange={updateField} error={errors.email} placeholder="you@organization.org" autoComplete="email" icon="✉" />
            <FormInput id="password" label="Password" type="password" value={values.password} onChange={updateField} error={errors.password} placeholder="Enter your password" autoComplete={isRegister ? 'new-password' : 'current-password'} icon="▣" hint={isRegister ? 'At least 8 characters' : undefined} />
            {isRegister ? (
              <FormInput id="confirmPassword" label="Confirm password" type="password" value={values.confirmPassword} onChange={updateField} error={errors.confirmPassword} placeholder="Re-enter your password" autoComplete="new-password" icon="▣" />
            ) : (
              <div className="form-options">
                <FormCheckbox label="Keep me signed in" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <button
                  className="text-action"
                  type="button"
                  disabled={forgotSubmitting}
                  onClick={() => {
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
                      setErrors((current) => ({ ...current, email: 'Enter a valid email address to reset your password.' }))
                    } else {
                      onForgotPassword(values.email)
                    }
                  }}
                >{forgotSubmitting ? 'Sending…' : 'Forgot password?'}</button>
              </div>
            )}
            {isRegister && <p className="terms-copy">By creating an account, you agree to our <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</p>}
            <ActionButton type="submit" variant="primary" loading={submitting} className="action-button--full auth-submit">{isRegister ? 'Create account' : 'Sign in to workspace'}<span aria-hidden="true">→</span></ActionButton>
          </form>
          <div className="auth-divider"><span>SECURE &amp; ENCRYPTED</span></div>
          <div className="security-note"><span className="security-icon" aria-hidden="true">✓</span><span>Your information is protected with industry-standard encryption.</span></div>
        </div>
        <footer className="auth-panel-footer"><span>© 2026 RescueGrid</span><a href="#help">Need help?</a></footer>
      </section>
    </div>
  )
}

export default AuthPage
