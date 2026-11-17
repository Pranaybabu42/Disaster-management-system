import { useEffect } from 'react'
import './toastmessage.css'

function ToastMessage({ message, variant = 'success', onClose, duration = 5000 }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className={`toast-message toast-message--${variant}`} role="status" aria-live="polite">
      <span className="toast-message__mark" aria-hidden="true">{variant === 'success' ? '✓' : 'i'}</span>
      <p>{message}</p>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">×</button>
    </div>
  )
}

export default ToastMessage
