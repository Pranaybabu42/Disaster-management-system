import { useState } from 'react'
import './forminput.css'

function FormInput({ id, label, type = 'text', placeholder, value, onChange, error, autoComplete, required = true, icon, hint }) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && visible ? 'text' : type

  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}{required && <span className="required-mark">*</span>}</label>
      <div className={`field-control ${error ? 'field-control--error' : ''}`}>
        {icon && <span className="field-icon" aria-hidden="true">{icon}</span>}
        <input
          className="form-control"
          id={id}
          name={id}
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          required={required}
        />
        {isPassword && (
          <button className="password-toggle" type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error && <div className="field-feedback" id={`${id}-error`}>{error}</div>}
      {!error && hint && <div className="field-hint" id={`${id}-hint`}>{hint}</div>}
    </div>
  )
}

export default FormInput
