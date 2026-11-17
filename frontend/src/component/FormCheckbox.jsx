import './formcheckbox.css'

function FormCheckbox({ label, checked, onChange, id = 'remember-me' }) {
  return (
    <label className="form-checkbox" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  )
}

export default FormCheckbox
