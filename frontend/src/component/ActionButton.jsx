import './actionbutton.css'

function ActionButton({ children, type = 'button', variant = 'primary', loading = false, disabled = false, className = '', ...props }) {
  return (
    <button
      className={`action-button action-button--${variant} ${className}`.trim()}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <span className="spinner-border spinner-border-sm" aria-hidden="true" />}
      <span>{loading ? 'Please wait…' : children}</span>
    </button>
  )
}

export default ActionButton
