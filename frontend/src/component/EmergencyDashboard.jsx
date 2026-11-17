import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Crosshair, Flame, HeartPulse, LocateFixed, MapPin, Menu, Search, ShieldCheck, Waves, X } from 'lucide-react'
import { createEmergency } from '../api/emergencies.js'
import { searchPlaces } from '../api/locations.js'
import EmergencyMap from './EmergencyMap.jsx'
import MyAlerts from './MyAlerts.jsx'
import './emergency-dashboard.css'

const TYPES = [
  { value: 'FLOOD', label: 'Flood', icon: Waves }, { value: 'FIRE', label: 'Fire', icon: Flame },
  { value: 'EARTHQUAKE', label: 'Earthquake', icon: AlertTriangle }, { value: 'MEDICAL_EMERGENCY', label: 'Medical emergency', icon: HeartPulse },
  { value: 'LANDSLIDE', label: 'Landslide', icon: MapPin }, { value: 'OTHER', label: 'Other', icon: Crosshair },
]
const pretty = (value = '') => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function EmergencyDashboard({ user, accessToken, onLogout }) {
  const [location, setLocation] = useState(null)
  const [gpsState, setGpsState] = useState('idle')
  const [gpsError, setGpsError] = useState('')
  const [type, setType] = useState('')
  const [priority, setPriority] = useState('')
  const [peopleAffected, setPeopleAffected] = useState('1')
  const [locationNote, setLocationNote] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeSection, setActiveSection] = useState('raise')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const initials = (user?.full_name || 'Guest').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

  const detectLocation = () => {
    setGpsError('')
    if (!navigator.geolocation) { setGpsState('error'); setGpsError('Location is not supported by this browser. Select a point on the map.'); return }
    setGpsState('loading')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocation({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }); setGpsState('ready') },
      (error) => {
        setGpsState('error')
        const messages = { 1: 'Location permission was denied. You can select a point on the map instead.', 2: 'Your location is unavailable. Please select a point on the map.', 3: 'Location request timed out. Please try again or select a point on the map.' }
        setGpsError(messages[error.code] || 'Could not detect your location. Select a point on the map.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const requestConfirmation = () => {
    if (!location) { setFeedback({ kind: 'error', text: 'Choose your emergency location on the map or use your current location.' }); return }
    if (!type) { setFeedback({ kind: 'error', text: 'Select an emergency type to continue.' }); return }
    if (!priority) { setFeedback({ kind: 'error', text: 'Select an alert priority to continue.' }); return }
    if (!Number.isInteger(Number(peopleAffected)) || Number(peopleAffected) < 1) { setFeedback({ kind: 'error', text: 'Enter the number of people who need help.' }); return }
    if (description.trim().length < 5) { setFeedback({ kind: 'error', text: 'Describe what is happening in at least 5 characters.' }); return }
    setFeedback(null)
    setConfirming(true)
  }

  const submit = async () => {
    if (submitting || !location || !type || !priority || Number(peopleAffected) < 1 || description.trim().length < 5) return
    setSubmitting(true); setConfirming(false); setFeedback(null)
    try {
      await createEmergency({
        latitude: location.latitude,
        longitude: location.longitude,
        emergency_type: type,
        priority,
        people_affected: Number(peopleAffected),
        location_note: locationNote.trim(),
        description: description.trim(),
      }, accessToken)
      setLocation(null)
      setGpsState('idle')
      setGpsError('')
      setType('')
      setPriority('')
      setPeopleAffected('1')
      setLocationNote('')
      setDescription('')
      setSearchQuery('')
      setSearchResults([])
      setSearchError('')
      setActiveSection('alerts')
    } catch (error) {
      setFeedback({ kind: 'error', text: error.response?.data?.message || error.message || 'Request could not be submitted. Please try again.' })
    } finally { setSubmitting(false) }
  }

  const handlePlaceSearch = async (event) => {
    event.preventDefault()
    const query = searchQuery.trim()
    if (!query || searching) return
    setSearching(true); setSearchError(''); setSearchResults([])
    try {
      const places = await searchPlaces(query)
      setSearchResults(places)
      if (!places.length) setSearchError('No matching places found. Try adding a city or region.')
    } catch {
      setSearchError('Location search is temporarily unavailable. You can still choose a point on the map.')
    } finally { setSearching(false) }
  }

  const choosePlace = (place) => {
    setLocation({ latitude: place.latitude, longitude: place.longitude, accuracy: null })
    setGpsState('manual'); setGpsError(''); setSearchQuery(place.label); setLocationNote(place.label); setSearchResults([]); setSearchError('')
  }

  return <div className={`emergency-app ${sidebarCollapsed ? 'user-sidebar-collapsed' : ''}`}>
    <aside className="user-sidebar">
      <a className="user-sidebar-brand" href="#dashboard"><span className="em-brand-mark"><ShieldCheck size={18} /></span><span>Rescue<span>Grid</span></span></a>
      <div className="user-sidebar-label">MY WORKSPACE</div>
      <nav aria-label="User sections">
        <button type="button" className={activeSection === 'raise' ? 'is-active' : ''} title={sidebarCollapsed ? 'Raise an alert' : undefined} onClick={() => setActiveSection('raise')}><AlertTriangle size={18} /><span>Raise an alert</span></button>
        <button type="button" className={activeSection === 'alerts' ? 'is-active' : ''} title={sidebarCollapsed ? 'My alerts' : undefined} onClick={() => setActiveSection('alerts')}><Clock3 size={18} /><span>My alerts</span></button>
      </nav>
      <button className="user-sidebar-collapse" type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}<span>Collapse sidebar</span></button>
    </aside>
    <div className="emergency-page">
    <header className="em-header">
      <a className="em-brand" href="#home" aria-label="Disaster Rescue System home"><span className="em-brand-mark"><ShieldCheck size={19} /></span><span>Disaster<span className="em-brand-light">Rescue</span></span><span className="brand-tag">RESPONSE NETWORK</span></a>
      <button className="nav-toggle" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={20} /></button>
      <nav className={mobileNav ? 'em-nav em-nav-open' : 'em-nav'}><a className="nav-active" href="#dashboard">Dashboard</a><a href="#map">Live map</a><a href="#help">Help center</a></nav>
      <div className="em-profile"><span className="profile-status"><i /> Response ready</span><span className="profile-avatar">{initials}</span><span className="profile-name">{user?.full_name || 'Guest User'}</span>{onLogout ? <button className="signout-btn" onClick={onLogout}>Sign out</button> : <a className="signout-btn" href="?login=1">Sign in</a>}<ChevronDown size={15} /></div>
    </header>
    <main className="em-main" id="dashboard">
      {activeSection === 'alerts' ? <MyAlerts accessToken={accessToken} /> : <>
      <div className="em-heading"><div><div className="eyebrow"><span className="pulse-dot" /> EMERGENCY RESPONSE CENTER</div><h1>How can we help you?</h1><p>Share your location and tell us what’s happening. Help is one step away.</p></div><div className="secure-note"><ShieldCheck size={16} /> Your information is handled securely</div></div>
      <div className="dashboard-grid">
        <section className="map-section" id="map"><div className="map-topline"><div><strong>Incident location</strong><span>Select or adjust the point where help is needed</span></div><div className="map-legend"><span><i className="legend-user" /> Your location</span></div></div>
          <form className="location-search" onSubmit={handlePlaceSearch} role="search"><div className="location-search__field"><Search size={16} /><input aria-label="Search for an address or place" placeholder="Search address, city, or landmark" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchError(''); setSearchResults([]) }} /><button type="submit" disabled={searching || !searchQuery.trim()}>{searching ? <span className="mini-spinner" /> : 'Search'}</button></div>{searchResults.length > 0 && <ul className="location-results" aria-label="Location search results">{searchResults.map((place) => <li key={place.id}><button type="button" onClick={() => choosePlace(place)}><MapPin size={15} /><span>{place.label}<small>{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</small></span></button></li>)}</ul>}{searchError && <p className="location-search__message" role="status">{searchError}</p>}<span className="location-search__credit">Place search by Photon · OpenStreetMap</span></form>
          <EmergencyMap location={location} onLocationChange={(point) => { setLocation(point); setGpsState('manual'); setGpsError('') }} />
          <div className="map-hint"><MapPin size={14} /> Tap anywhere on the map to place your emergency location</div>
        </section>
        <aside className="alert-column"><section className="alert-card"><div className="card-heading"><div className="card-icon"><AlertTriangle size={18} /></div><div><h2>Raise an alert</h2><p>Tell us what kind of help you need</p></div></div>
          <button className="location-button" onClick={detectLocation} disabled={gpsState === 'loading'}>{gpsState === 'loading' ? <span className="mini-spinner" /> : <LocateFixed size={17} />}{gpsState === 'loading' ? 'Detecting location…' : 'Get my location'}<ArrowUpRight size={15} className="button-trailing" /></button>
          <div className="location-state" aria-live="polite">{location ? <><span className="state-check"><Check size={12} /></span><span><strong>{gpsState === 'manual' ? 'Location selected' : 'Location detected'}</strong><small>{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}{location.accuracy != null ? ` · ±${Math.round(location.accuracy)} m` : ''}</small></span></> : <><span className="state-pin"><MapPin size={14} /></span><span><strong>Location not set</strong><small>Use GPS or tap on the map to set a location</small></span></>}</div>
          <label className="field-label location-note-label" htmlFor="location-note">Address, landmark, or access details <span className="optional-label">OPTIONAL</span></label><input className="location-note-input" id="location-note" maxLength={250} placeholder="Building, street, entrance, or nearby landmark" value={locationNote} onChange={(event) => setLocationNote(event.target.value)} />
          {gpsError && <p className="inline-error" role="alert">{gpsError}</p>}
          <div className="form-divider" /><label className="field-label" htmlFor="emergency-type">Emergency type <span>*</span></label><div className="select-wrap"><select id="emergency-type" value={type} onChange={(event) => setType(event.target.value)}><option value="">Choose an emergency</option>{TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} /></div>
          <label className="field-label description-label" htmlFor="priority">Priority <span>*</span></label><div className="select-wrap"><select id="priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Choose a priority</option><option value="LOW">Low — situation is stable</option><option value="MEDIUM">Medium — help is needed</option><option value="HIGH">High — urgent assistance needed</option><option value="CRITICAL">Critical — immediate danger</option></select><ChevronDown size={16} /></div>
          <label className="field-label description-label" htmlFor="people-affected">People needing help <span>*</span></label><input className="location-note-input" id="people-affected" type="number" min="1" max="5000" step="1" inputMode="numeric" value={peopleAffected} onChange={(event) => setPeopleAffected(event.target.value)} />
          <label className="field-label description-label" htmlFor="description">What is happening? <span>*</span></label><textarea id="description" rows="3" minLength="5" maxLength="500" placeholder="Describe the emergency and any immediate risks…" value={description} onChange={(event) => setDescription(event.target.value)} /><div className="char-count">{description.length}/500 · at least 5 characters</div>
          {feedback && <div className={`feedback feedback-${feedback.kind}`} role="status">{feedback.text}</div>}
          <button className="raise-button" onClick={requestConfirmation} disabled={submitting}>{submitting ? <><span className="mini-spinner light" /> Sending alert…</> : <><AlertTriangle size={17} /> Raise emergency alert</>}</button>
          <p className="dispatch-note"><Clock3 size={13} /> Saved for coordination · no rescue team is assigned yet</p>
        </section>
        <div className="emergency-footnote"><ShieldCheck size={15} /><span>In immediate danger? Contact your local emergency services directly.</span></div>
      </aside></div>
      <footer className="em-footer"><span>© 2025 Disaster Rescue System</span><span><i /> All systems operational</span><a href="#help">Need assistance?</a></footer>
      </>}
    </main>
    {confirming && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirming(false) }}><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><button className="modal-close" onClick={() => setConfirming(false)} aria-label="Close"><X size={18} /></button><div className="confirm-icon"><AlertTriangle size={22} /></div><div className="modal-eyebrow">CONFIRM EMERGENCY ALERT</div><h2 id="confirm-title">Send this emergency alert?</h2><p>This report will be saved as pending assignment. A rescue team will not be assigned yet.</p><div className="confirm-details"><div><span>Emergency type</span><strong>{pretty(type)}</strong></div><div><span>Priority</span><strong>{pretty(priority)}</strong></div><div><span>People needing help</span><strong>{peopleAffected}</strong></div><div><span>Selected location</span><strong>{location?.latitude.toFixed(5)}, {location?.longitude.toFixed(5)}</strong></div>{locationNote.trim() && <div><span>Location details</span><strong>{locationNote.trim()}</strong></div>}<div><span>Details</span><strong>{description.trim()}</strong></div></div><div className="modal-actions"><button className="cancel-button" onClick={() => setConfirming(false)}>Go back</button><button className="confirm-button" onClick={submit} disabled={submitting}>Confirm &amp; save alert</button></div></section></div>}
    </div>
  </div>
}
export default EmergencyDashboard
