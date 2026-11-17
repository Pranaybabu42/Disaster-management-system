import { useEffect, useState } from 'react'
import { AlertTriangle, Clock3, MapPin, RefreshCw } from 'lucide-react'
import { getMyEmergencies } from '../api/emergencies.js'

const label = (value = '') => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())

function MyAlerts({ accessToken }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getMyEmergencies(accessToken)
      .then((result) => { if (active) setAlerts(result) })
      .catch((reason) => { if (active) setError(reason.response?.data?.message || 'Could not load your alerts. Please try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, reloadKey])

  return <section className="my-alerts-view">
    <div className="my-alerts-heading"><div><div className="eyebrow"><span className="pulse-dot" /> PERSONAL ALERT HISTORY</div><h1>My alerts</h1><p>Review the emergency reports you have submitted and their latest status.</p></div><button type="button" onClick={() => setReloadKey((key) => key + 1)} aria-label="Refresh alerts"><RefreshCw size={15} /> Refresh</button></div>
    {loading ? <div className="my-alerts-state"><span className="mini-spinner" /> Loading your alerts…</div> : error ? <div className="my-alerts-error" role="alert">{error}</div> : alerts.length ? <div className="my-alerts-list">{alerts.map((alert) => <article className="my-alert-card" key={alert.emergency_id}><div className="my-alert-icon"><AlertTriangle size={17} /></div><div className="my-alert-main"><div className="my-alert-title"><h2>{label(alert.emergency_type)}</h2><span className={`pending-pill my-alert-status status-${String(alert.status).toLowerCase()}`}>{label(alert.status)}</span></div><p>{alert.description || 'No additional details provided.'}</p><div className="my-alert-meta"><span><Clock3 size={13} />{new Date(alert.created_at).toLocaleString()}</span><span><MapPin size={13} />{alert.location?.coordinates ? `${alert.location.coordinates[1].toFixed(5)}, ${alert.location.coordinates[0].toFixed(5)}` : 'Location recorded'}</span><strong>{label(alert.priority || 'MEDIUM')} priority</strong><strong>{alert.people_affected || 1} people need help</strong></div>{alert.location_note && <div className="my-alert-location-note">Location details: {alert.location_note}</div>}<div className="my-alert-id">ALERT ID <code>{alert.emergency_id}</code></div></div></article>)}</div> : <div className="my-alerts-empty"><span><AlertTriangle size={21} /></span><h2>No alerts yet</h2><p>When you submit an emergency report, it will appear here with its response status.</p></div>}
  </section>
}

export default MyAlerts
