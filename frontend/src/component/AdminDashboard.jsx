import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, ArrowLeft, Bell, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, LayoutDashboard, LogOut, MapPin, MapPinned, Menu, Plus, Search, Shield, SlidersHorizontal, Star, Users, X } from 'lucide-react'
import { adminApi } from '../api/admin.js'
import { searchPlaces } from '../api/locations.js'
import './admin-dashboard.css'

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'teams', label: 'Rescue teams', icon: Shield },
  { id: 'ongoing', label: 'Ongoing work', icon: Activity },
]
const titleCase = (value = '') => String(value).toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
const formatDate = (value) => value ? new Date(value).toLocaleString() : '—'
const coordinates = (location) => location?.coordinates ? `${location.coordinates[1].toFixed(4)}, ${location.coordinates[0].toFixed(4)}` : '—'

function AdminDashboard({ user, accessToken, onLogout }) {
  const [section, setSection] = useState('overview')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [payload, setPayload] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const loaders = { overview: adminApi.summary, users: adminApi.users, alerts: adminApi.alerts, teams: adminApi.teams, ongoing: adminApi.ongoing }
    loaders[section](accessToken)
      .then((result) => { if (active) setPayload(result) })
      .catch((reason) => { if (active) setError(reason.response?.data?.message || 'Could not load this view. Check the API connection and your admin access.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [section, accessToken, refreshKey])

  const selectSection = (id) => {
    setPayload(null)
    setLoading(true)
    setSection(id)
    setMobileOpen(false)
  }
  const initials = (user?.full_name || 'Admin').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

  return <div className={`admin-shell ${collapsed ? 'admin-shell--collapsed' : ''}`}>
    <aside className={`admin-sidebar ${mobileOpen ? 'admin-sidebar--mobile-open' : ''}`}>
      <a className="admin-brand" href="#admin" aria-label="RescueGrid admin home"><span className="admin-brand__mark"><Shield size={19} /></span><span className="admin-brand__name">Rescue<span>Grid</span></span></a>
      <div className="admin-nav-label">WORKSPACE</div>
      <nav className="admin-nav" aria-label="Admin sections">
        {NAV.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={section === id ? 'is-active' : ''} onClick={() => selectSection(id)} title={collapsed ? label : undefined} aria-current={section === id ? 'page' : undefined}><Icon size={18} /><span>{label}</span></button>)}
      </nav>
      <div className="admin-sidebar-bottom"><span className="admin-online"><i /> Response network online</span><button className="admin-collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}<span>Collapse sidebar</span></button></div>
    </aside>
    {mobileOpen && <button className="admin-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <div className="admin-main">
      <header className="admin-topbar"><button className="admin-mobile-menu" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label="Open navigation"><Menu size={20} /></button><div className="admin-breadcrumb">Workspace <span>/</span> <strong>{NAV.find((item) => item.id === section)?.label}</strong></div><div className="admin-account"><button type="button" className="admin-bell" aria-label="Notifications"><Bell size={17} /></button><span className="admin-avatar">{initials}</span><span className="admin-account-name"><strong>{user?.full_name || 'Administrator'}</strong><small>System administrator</small></span><button type="button" className="admin-logout" onClick={onLogout}><LogOut size={15} /><span>Sign out</span></button></div></header>
      <main className="admin-content">
        <div className="admin-page-heading"><div><div className="admin-eyebrow">DISASTER RESPONSE CONTROL</div><h1>{NAV.find((item) => item.id === section)?.label}</h1><p>{section === 'overview' ? 'A live view of people, incidents, and response activity.' : `Manage and review ${NAV.find((item) => item.id === section)?.label.toLowerCase()} across the response network.`}</p></div></div>
        {loading ? <div className="admin-state"><span className="admin-spinner" /> Loading {NAV.find((item) => item.id === section)?.label.toLowerCase()}…</div> : error ? <div className="admin-error" role="alert">{error}</div> : <SectionContent section={section} payload={payload} onNavigate={selectSection} accessToken={accessToken} onRefresh={() => setRefreshKey((key) => key + 1)} />}
      </main>
      <footer className="admin-footer"><span>RescueGrid · Disaster Management System</span><span><i /> All systems operational</span></footer>
    </div>
  </div>
}

function SectionContent({ section, payload, onNavigate, accessToken, onRefresh }) {
  if (section === 'overview') {
    const cards = [
      ['Registered users', payload?.users ?? 0, Users, 'users', 'Accounts in the system'],
      ['Total alerts', payload?.alerts ?? 0, AlertTriangle, 'alerts', `${payload?.open_alerts ?? 0} currently open`],
      ['Rescue teams', payload?.rescue_teams ?? 0, Shield, 'teams', 'Response units registered'],
      ['Ongoing responses', payload?.ongoing_assignments ?? 0, Activity, 'ongoing', 'Teams currently deployed'],
    ]
    return <>
      <section className="admin-overview-hero"><div className="admin-overview-copy"><span>RESPONSE NETWORK · LIVE</span><h2>One view of every response.</h2><p>Review community reports, coordinate teams, and keep an eye on active work from one place.</p></div><div className="admin-hero-status"><i /><span><strong>Network online</strong><small>Admin workspace ready</small></span></div></section>
      <div className="admin-stat-grid">{cards.map(([label, value, Icon, link, caption], index) => <button className={`admin-stat-card admin-stat-card--tone-${index + 1}`} type="button" key={label} onClick={() => onNavigate(link)}><span className="admin-stat-top"><span className="admin-stat-icon"><Icon size={19} /></span><ChevronRight size={15} /></span><span className="admin-stat-label">{label}</span><strong>{value}</strong><small>{caption}</small></button>)}</div>
      <section className="admin-panel admin-overview-panel"><div className="admin-panel-heading"><div><h2>Workspace shortcuts</h2><p>Go straight to the information you need.</p></div><span className="admin-live-pill"><i /> LIVE</span></div><div className="admin-quick-links">{NAV.slice(1).map(({ id, label, icon: Icon }, index) => <button className={`admin-quick-link admin-quick-link--${index + 1}`} key={id} onClick={() => onNavigate(id)}><span className="admin-quick-icon"><Icon size={18} /></span><span className="admin-quick-copy"><strong>{label}</strong><small>{['Review accounts and access', 'Track reported incidents', 'Check team capacity and base', 'See active team assignments'][index]}</small></span><ChevronRight size={16} /></button>)}</div></section>
    </>
  }
  if (section === 'users') return <DataTable title="Registered users" subtitle="Account profiles and access roles. Password hashes are never exposed." rows={payload || []} empty="No user accounts found." columns={[
    ['full_name', 'Name'], ['email', 'Email'], ['roles', 'Role', (row) => (row.roles || []).map(titleCase).join(', ')], ['is_active', 'Status', (row) => <span className={`admin-status ${row.is_active ? 'status-active' : 'status-inactive'}`}>{row.is_active ? 'Active' : 'Inactive'}</span>], ['created_at', 'Joined', (row) => formatDate(row.created_at)],
  ]} searchPlaceholder="Search by name or email…" searchFields={['full_name', 'email']} filters={[
    { key: 'role', label: 'All roles', options: [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }, { value: 'responder', label: 'Rescue team' }], matches: (row, value) => (row.roles || []).includes(value) },
    { key: 'is_active', label: 'All account statuses', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }], matches: (row, value) => String(row.is_active !== false) === value },
  ]} />
  if (section === 'alerts') return <DataTable title="Emergency alerts" subtitle="Alerts submitted by users, with priority, status, and reported location." rows={payload || []} empty="No alerts have been submitted yet." columns={[
    ['emergency_id', 'Alert ID', (row) => row.emergency_id?.slice(0, 10)], ['reporter_email', 'Reported by', (row) => <span title={row.reporter_name}>{row.reporter_email || row.reporter_name}</span>], ['emergency_type', 'Type', (row) => titleCase(row.emergency_type)], ['priority', 'Priority', (row) => <span className={`priority-pill priority-${String(row.priority || 'medium').toLowerCase()}`}>{titleCase(row.priority || 'medium')}</span>], ['people_affected', 'People needing help'], ['status', 'Status', (row) => titleCase(row.status)], ['location', 'Coordinates', (row) => coordinates(row.location)], ['created_at', 'Reported', (row) => formatDate(row.created_at)],
  ]} searchPlaceholder="Search alert ID, reporter, or type…" searchFields={['emergency_id', 'reporter_email', 'reporter_name', 'emergency_type']} filters={[
    { key: 'priority', label: 'All priorities', options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => String(row.priority || 'MEDIUM').toUpperCase() === value },
    { key: 'status', label: 'All statuses', options: ['PENDING_ASSIGNMENT', 'TEAM_ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => String(row.status || '').toUpperCase() === value },
  ]} />
  if (section === 'teams') return <TeamManagement rows={payload || []} accessToken={accessToken} onRefresh={onRefresh} />
  return <DataTable title="Ongoing response work" subtitle="Active team assignments and field progress." rows={payload || []} empty="There are no ongoing team assignments." columns={[
    ['alert_id', 'Alert'], ['team_id', 'Team'], ['status', 'Status', (row) => titleCase(row.status)], ['people_deployed', 'People deployed', (row) => row.people_deployed ?? '—'], ['started_at', 'Started', (row) => formatDate(row.started_at)], ['updated_at', 'Last update', (row) => formatDate(row.updated_at)],
  ]} searchPlaceholder="Search alert, team, or status…" searchFields={['alert_id', 'team_id', 'status']} filters={[
    { key: 'status', label: 'All statuses', options: (data) => [...new Set(data.map((row) => row.status).filter(Boolean))].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => String(row.status || '').toLowerCase() === value.toLowerCase() },
    { key: 'team_id', label: 'All teams', options: (data) => [...new Set(data.map((row) => row.team_id).filter(Boolean))].map((value) => ({ value, label: value })), matches: (row, value) => row.team_id === value },
  ]} />
}

const EMPTY_TEAM_FORM = {
  name: '', team_type: '', base_address: '', latitude: '', longitude: '',
  authorized_strength: '10', current_member_count: '0', available_member_count: '0',
}

function TeamManagement({ rows, accessToken, onRefresh }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState('manual')
  const [form, setForm] = useState(EMPTY_TEAM_FORM)
  const [locationResults, setLocationResults] = useState([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [teamDetail, setTeamDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const openTeam = async (team) => {
    setSelectedTeam(team)
    setTeamDetail(null)
    setDetailLoading(true)
    setDetailError('')
    try { setTeamDetail(await adminApi.teamDetail(accessToken, team.id)) }
    catch (reason) { setDetailError(reason.response?.data?.detail || 'Could not load this team profile.') }
    finally { setDetailLoading(false) }
  }
  const reloadTeam = async () => { if (selectedTeam) await openTeam(selectedTeam) }
  const findLocation = async () => {
    if (!form.base_address.trim() || locationLoading) return
    setLocationLoading(true)
    setError('')
    try {
      const places = await searchPlaces(form.base_address.trim())
      setLocationResults(places)
      if (!places.length) setError('No matching location found. Add a nearby city or enter coordinates manually.')
    } catch {
      setError('Location search is unavailable. Enter the latitude and longitude manually.')
    } finally { setLocationLoading(false) }
  }

  const chooseLocation = (place) => {
    setForm((current) => ({ ...current, base_address: place.label, latitude: String(place.latitude), longitude: String(place.longitude) }))
    setLocationResults([])
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const authorized = Number(form.authorized_strength)
    const current = Number(form.current_member_count)
    const available = Number(form.available_member_count)
    if (current > authorized) { setError('Current headcount cannot exceed authorized team capacity.'); return }
    if (available > current) { setError('Available headcount cannot exceed current team headcount.'); return }
    setSaving(true)
    setError('')
    try {
      await adminApi.createTeam(accessToken, {
        name: form.name.trim(),
        team_type: form.team_type,
        base_address: form.base_address.trim(),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        authorized_strength: authorized,
        current_member_count: current,
        available_member_count: available,
      })
      setDialogOpen(false)
      setForm(EMPTY_TEAM_FORM)
      setLocationResults([])
      setSuccess('Rescue team added to the system. No alert has been assigned to it.')
      onRefresh()
    } catch (reason) {
      setError(reason.response?.data?.message || reason.response?.data?.detail || 'Could not add the rescue team. Please try again.')
    } finally { setSaving(false) }
  }

  return <>
    {selectedTeam ? <RescueTeamDetail team={teamDetail?.team || selectedTeam} units={teamDetail?.units || []} members={teamDetail?.members || []} loading={detailLoading} error={detailError} accessToken={accessToken} onBack={() => { setSelectedTeam(null); setTeamDetail(null); setDetailError(''); onRefresh() }} onReload={reloadTeam} /> : <>
    <div className="team-management-heading"><div><h2>Rescue team registry</h2><p>Add and maintain team locations and personnel capacity.</p></div><button className="admin-add-team" type="button" onClick={() => { setError(''); setSuccess(''); setDialogMode('manual'); setDialogOpen(true) }}><Plus size={17} /> Add rescue team</button></div>
    {success && <div className="team-success" role="status"><CheckCircle2 size={17} />{success}<button type="button" onClick={() => setSuccess('')} aria-label="Dismiss message"><X size={15} /></button></div>}
    <DataTable title="Rescue teams" subtitle="Team type, base location, and registered personnel strength." rows={rows} empty="No rescue teams have been registered." columns={[
      ['name', 'Team', (row) => <span className="team-name-cell"><strong>{row.name}</strong><small>{row.code}</small></span>], ['team_type', 'Team type', (row) => titleCase(row.team_type)], ['unit_count', 'Internal teams', (row) => row.unit_count ?? 0], ['base_address', 'Base location'], ['base_location', 'Coordinates', (row) => coordinates(row.base_location)], ['authorized_strength', 'Capacity'], ['current_member_count', 'Current people', (row) => `${row.current_member_count ?? 0} / ${row.authorized_strength ?? '—'}`], ['available_member_count', 'Available now'], ['rating_average', 'Rating', (row) => row.rating_count ? `${Number(row.rating_average).toFixed(1)} ★ (${row.rating_count})` : 'Not rated yet'], ['status', 'Status', (row) => titleCase(row.status)], ['id', 'Profile', (row) => <button className="team-open-button" type="button" onClick={() => openTeam(row)}>Open team</button>],
    ]} searchPlaceholder="Search team name, type, or base…" searchFields={['name', 'code', 'team_type', 'base_address']} filters={[
      { key: 'team_type', label: 'All team types', options: (data) => [...new Set(data.map((row) => row.team_type).filter(Boolean))].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => row.team_type === value },
      { key: 'status', label: 'All statuses', options: ['available', 'deployed', 'offline'].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => String(row.status || '').toLowerCase() === value },
    ]} />
    </>}
    {dialogOpen && <div className="team-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialogOpen(false) }}><section className="team-dialog" role="dialog" aria-modal="true" aria-labelledby="team-dialog-title"><div className="team-dialog-heading"><div><span>TEAM REGISTRY</span><h2 id="team-dialog-title">Add rescue teams</h2><p>Add a team manually or import team and internal-team data from Excel. Nothing is saved until you confirm.</p></div><button type="button" onClick={() => setDialogOpen(false)} aria-label="Close dialog" disabled={saving}><X size={19} /></button></div>
      <div className="team-input-tabs" role="tablist" aria-label="Team entry method"><button type="button" role="tab" aria-selected={dialogMode === 'manual'} className={dialogMode === 'manual' ? 'is-active' : ''} onClick={() => setDialogMode('manual')}>Manual entry</button><button type="button" role="tab" aria-selected={dialogMode === 'excel'} className={dialogMode === 'excel' ? 'is-active' : ''} onClick={() => setDialogMode('excel')}>Import Excel</button></div>
      {dialogMode === 'manual' ? <form className="team-form" onSubmit={submit}>
        <label>Team name<input required minLength="2" maxLength="120" value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. North District Rescue" /></label>
        <label>Team type<select required value={form.team_type} onChange={(event) => setField('team_type', event.target.value)}><option value="">Select a team type</option><option value="medical">Medical</option><option value="search_and_rescue">Search and rescue</option><option value="fire">Fire response</option><option value="water_rescue">Water rescue</option><option value="logistics">Logistics</option><option value="other">Other</option></select></label>
        <label className="team-form-span">Base address<input required minLength="3" maxLength="250" value={form.base_address} onChange={(event) => { setField('base_address', event.target.value); setLocationResults([]) }} placeholder="Street, area, city, or landmark" /></label>
        <div className="team-location-lookup team-form-span"><button type="button" onClick={findLocation} disabled={locationLoading || !form.base_address.trim()}><Search size={15} />{locationLoading ? 'Searching…' : 'Find coordinates from address'}</button><span><MapPin size={14} /> Choose a search result or enter coordinates below.</span></div>
        {locationResults.length > 0 && <div className="team-location-results team-form-span">{locationResults.map((place) => <button type="button" key={place.id} onClick={() => chooseLocation(place)}><MapPin size={15} /><span>{place.label}<small>{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</small></span></button>)}</div>}
        <label>Latitude<input required type="number" min="-90" max="90" step="any" value={form.latitude} onChange={(event) => setField('latitude', event.target.value)} placeholder="17.3850" /></label>
        <label>Longitude<input required type="number" min="-180" max="180" step="any" value={form.longitude} onChange={(event) => setField('longitude', event.target.value)} placeholder="78.4867" /></label>
        <label>Authorized capacity<input required type="number" min="1" max="10000" step="1" value={form.authorized_strength} onChange={(event) => setField('authorized_strength', event.target.value)} /><small>Maximum number of people for this team.</small></label>
        <label>People currently in team<input required type="number" min="0" max="10000" step="1" value={form.current_member_count} onChange={(event) => setField('current_member_count', event.target.value)} /><small>Current headcount; cannot exceed capacity.</small></label>
        <label className="team-form-span">Available people now<input required type="number" min="0" max="10000" step="1" value={form.available_member_count} onChange={(event) => setField('available_member_count', event.target.value)} /><small>How many of the current team members are available.</small></label>
        {error && <div className="team-form-error team-form-span" role="alert">{error}</div>}
        <div className="team-form-actions team-form-span"><button className="team-cancel" type="button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button><button className="team-submit" type="submit" disabled={saving}>{saving ? 'Saving team…' : <><Plus size={16} /> Add team to system</>}</button></div>
      </form> : <ExcelTeamImport accessToken={accessToken} onCancel={() => setDialogOpen(false)} onDone={(result) => { setDialogOpen(false); setSuccess(`Imported ${result.teams_created} rescue team${result.teams_created === 1 ? '' : 's'} and ${result.internal_teams_created} internal team${result.internal_teams_created === 1 ? '' : 's'}.`); onRefresh() }} />}
    </section></div>}
  </>
}

const TEAM_TYPES = [
  ['medical', 'Medical'], ['search_and_rescue', 'Search and rescue'], ['fire', 'Fire response'],
  ['water_rescue', 'Water rescue'], ['logistics', 'Logistics'], ['other', 'Other'],
]
const UNIT_TYPES = [...TEAM_TYPES.slice(0, 5), ['communications', 'Communications'], ['evacuation', 'Evacuation'], TEAM_TYPES[5]]
const STATUS_OPTIONS = [['available', 'Available'], ['deployed', 'Deployed'], ['offline', 'Offline']]

function ExcelTeamImport({ accessToken, onCancel, onDone }) {
  const [teams, setTeams] = useState([])
  const [sourceRows, setSourceRows] = useState(0)
  const [warnings, setWarnings] = useState([])
  const [fileName, setFileName] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const readWorkbook = async (file) => {
    if (!file) return
    setError('')
    setTeams([])
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setError('Choose an .xlsx workbook. Save older .xls files as .xlsx first.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('The Excel file must be 10 MB or smaller.'); return }
    setFileName(file.name)
    setPreviewing(true)
    try {
      const result = await adminApi.previewTeamWorkbook(accessToken, file)
      setTeams(result.teams.map((team) => ({
        ...team,
        rating_count: team.rating_count ?? 0,
        units: (team.units || []).map((unit) => ({ ...unit, rating_count: unit.rating_count ?? 0 })),
      })))
      setSourceRows(result.source_rows || 0)
      setWarnings(result.warnings || [])
    } catch (reason) {
      setError(reason.response?.data?.detail || reason.response?.data?.message || 'The Excel workbook could not be read. Check the file and required column headers.')
      setFileName('')
    } finally { setPreviewing(false) }
  }

  const updateTeam = (teamIndex, field, value) => setTeams((current) => current.map((team, index) => index === teamIndex ? { ...team, [field]: value } : team))
  const updateUnit = (teamIndex, unitIndex, field, value) => setTeams((current) => current.map((team, index) => index === teamIndex ? { ...team, units: team.units.map((unit, childIndex) => childIndex === unitIndex ? { ...unit, [field]: value } : unit) } : team))
  const addTeam = () => setTeams((current) => [...current, { name: '', team_type: '', base_address: '', latitude: '', longitude: '', authorized_strength: '', current_member_count: '', available_member_count: '', status: 'offline', rating_average: '', rating_count: 0, units: [] }])
  const addUnit = (teamIndex) => setTeams((current) => current.map((team, index) => index === teamIndex ? { ...team, units: [...team.units, { name: '', unit_type: '', status: 'available', capabilities: [], authorized_strength: '', current_member_count: '', available_member_count: '', rating_average: '', rating_count: 0 }] } : team))

  const normalizedImport = () => teams.map((team) => ({
    ...team,
    latitude: Number(team.latitude),
    longitude: Number(team.longitude),
    authorized_strength: Number(team.authorized_strength),
    current_member_count: Number(team.current_member_count),
    available_member_count: Number(team.available_member_count),
    rating_average: team.rating_average === '' || team.rating_average == null ? null : Number(team.rating_average),
    rating_count: Number(team.rating_count || 0),
    units: team.units.map((unit) => ({
      ...unit,
      capabilities: Array.isArray(unit.capabilities) ? unit.capabilities : String(unit.capabilities || '').split(',').map((value) => value.trim()).filter(Boolean),
      authorized_strength: Number(unit.authorized_strength),
      current_member_count: Number(unit.current_member_count),
      available_member_count: Number(unit.available_member_count),
      rating_average: unit.rating_average === '' || unit.rating_average == null ? null : Number(unit.rating_average),
      rating_count: Number(unit.rating_count || 0),
    })),
  }))

  const validatePreview = () => {
    const values = normalizedImport()
    if (!values.length) return 'Add at least one rescue team before saving.'
    const teamNames = values.map((team) => team.name.trim().toLowerCase())
    if (teamNames.some((name) => !name) || new Set(teamNames).size !== teamNames.length) return 'Every rescue team needs a unique name.'
    for (const [teamIndex, team] of values.entries()) {
      const teamLabel = `Rescue team ${teamIndex + 1}`
      if (!TEAM_TYPES.some(([value]) => value === team.team_type)) return `${teamLabel}: choose a valid team type.`
      if (!team.base_address.trim()) return `${teamLabel}: enter a base address.`
      if (!Number.isFinite(team.latitude) || team.latitude < -90 || team.latitude > 90 || !Number.isFinite(team.longitude) || team.longitude < -180 || team.longitude > 180) return `${teamLabel}: enter valid latitude and longitude coordinates.`
      if (!Number.isInteger(team.authorized_strength) || team.authorized_strength < 1) return `${teamLabel}: capacity must be a whole number greater than zero.`
      if (!Number.isInteger(team.current_member_count) || team.current_member_count < 0 || team.current_member_count > team.authorized_strength) return `${teamLabel}: current headcount must be between zero and capacity.`
      if (!Number.isInteger(team.available_member_count) || team.available_member_count < 0 || team.available_member_count > team.current_member_count) return `${teamLabel}: available headcount cannot exceed current headcount.`
      const unitNames = team.units.map((unit) => unit.name.trim().toLowerCase())
      if (unitNames.some((name) => !name) || new Set(unitNames).size !== unitNames.length) return `${teamLabel}: every internal team needs a unique name.`
      for (const [unitIndex, unit] of team.units.entries()) {
        const unitLabel = `${teamLabel}, internal team ${unitIndex + 1}`
        if (!UNIT_TYPES.some(([value]) => value === unit.unit_type)) return `${unitLabel}: choose a valid team type.`
        if (!STATUS_OPTIONS.some(([value]) => value === unit.status)) return `${unitLabel}: choose a valid status.`
        if (!Number.isInteger(unit.authorized_strength) || unit.authorized_strength < 1) return `${unitLabel}: capacity must be a whole number greater than zero.`
        if (!Number.isInteger(unit.current_member_count) || unit.current_member_count < 0 || unit.current_member_count > unit.authorized_strength) return `${unitLabel}: current headcount must be between zero and capacity.`
        if (!Number.isInteger(unit.available_member_count) || unit.available_member_count < 0 || unit.available_member_count > unit.current_member_count) return `${unitLabel}: available headcount cannot exceed current headcount.`
      }
    }
    return ''
  }

  const confirmSave = async () => {
    const validationError = validatePreview()
    if (validationError) { setError(validationError); return }
    setSaving(true)
    setError('')
    try {
      const result = await adminApi.importTeams(accessToken, normalizedImport())
      onDone(result)
    } catch (reason) {
      const detail = reason.response?.data?.detail
      setError(Array.isArray(detail) ? detail.map((item) => item.msg).join(' · ') : detail || reason.response?.data?.message || 'The teams could not be saved. Review the data and try again.')
    } finally { setSaving(false) }
  }

  return <div className="excel-import-flow">
    {!teams.length ? <div className="excel-upload-panel"><div className="excel-upload-icon"><MapPinned size={24} /></div><h3>Import rescue teams from Excel</h3><p>Upload an .xlsx workbook. We’ll read the first worksheet in memory and show a preview before anything is added.</p><label className="excel-file-picker">{previewing ? 'Reading workbook…' : 'Choose Excel file'}<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={previewing} onChange={(event) => { readWorkbook(event.target.files?.[0]); event.target.value = '' }} /></label><small>No workbook is retained or saved. Only the confirmed team data is written to the database.</small>{fileName && <span className="excel-file-name">{fileName}</span>}<div className="excel-template-fields"><strong>Expected columns</strong><span>Team Name · Team Type · Base Address · Latitude · Longitude · Authorized Strength · Current Member Count · Available Member Count</span><span>For internal teams add: Internal Team Name · Internal Team Type · Internal Team Status · Capabilities · Unit Capacity · Unit Current Member Count · Unit Available Member Count</span><small>Use one row per internal team and repeat the parent team details on each row. Teams are grouped by Team Name.</small><small>The People Roster sheet is a data-entry template; link and save member profiles with Add member in the team view.</small></div></div> : <>
      <div className="excel-preview-heading"><div><strong>Preview and edit extracted data</strong><span>{fileName} · {teams.length} rescue teams · {teams.reduce((count, team) => count + team.units.length, 0)} internal teams · {sourceRows} spreadsheet rows</span></div><label className="excel-replace-file">Replace file<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { readWorkbook(event.target.files?.[0]); event.target.value = '' }} /></label></div>
      {warnings.length > 0 && <div className="excel-import-warnings"><strong>Needs review</strong>{warnings.map((warning, index) => <span key={`${warning}-${index}`}>{warning}</span>)}</div>}
      <div className="excel-preview-list">{teams.map((team, teamIndex) => <article className="excel-team-card" key={`team-${teamIndex}`}><div className="excel-team-card-heading"><div><span>RESCUE TEAM {teamIndex + 1}</span><strong>{team.name || 'Unnamed team'}</strong></div><button type="button" onClick={() => setTeams((current) => current.filter((_, index) => index !== teamIndex))} aria-label={`Remove team ${teamIndex + 1}`}><X size={15} /></button></div>
        <div className="excel-edit-grid"><label>Team name<input value={team.name ?? ''} onChange={(event) => updateTeam(teamIndex, 'name', event.target.value)} /></label><label>Team type<select value={team.team_type ?? ''} onChange={(event) => updateTeam(teamIndex, 'team_type', event.target.value)}><option value="">Choose type</option>{TEAM_TYPES.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label className="excel-span-2">Base address<input value={team.base_address ?? ''} onChange={(event) => updateTeam(teamIndex, 'base_address', event.target.value)} /></label><label>Latitude<input type="number" step="any" value={team.latitude ?? ''} onChange={(event) => updateTeam(teamIndex, 'latitude', event.target.value)} /></label><label>Longitude<input type="number" step="any" value={team.longitude ?? ''} onChange={(event) => updateTeam(teamIndex, 'longitude', event.target.value)} /></label><label>Authorized capacity<input type="number" min="1" step="1" value={team.authorized_strength ?? ''} onChange={(event) => updateTeam(teamIndex, 'authorized_strength', event.target.value)} /></label><label>Current people<input type="number" min="0" step="1" value={team.current_member_count ?? ''} onChange={(event) => updateTeam(teamIndex, 'current_member_count', event.target.value)} /></label><label>Available people<input type="number" min="0" step="1" value={team.available_member_count ?? ''} onChange={(event) => updateTeam(teamIndex, 'available_member_count', event.target.value)} /></label><label>Status<select value={team.status || 'offline'} onChange={(event) => updateTeam(teamIndex, 'status', event.target.value)}>{STATUS_OPTIONS.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label>Rating (optional)<input type="number" min="0" max="5" step="0.1" value={team.rating_average ?? ''} onChange={(event) => updateTeam(teamIndex, 'rating_average', event.target.value)} /></label><label>Rating count<input type="number" min="0" step="1" value={team.rating_count ?? 0} onChange={(event) => updateTeam(teamIndex, 'rating_count', event.target.value)} /></label></div>
        <div className="excel-units-heading"><div><strong>Internal teams</strong><small>Type, status, capabilities, staffing, and optional rating</small></div><button type="button" onClick={() => addUnit(teamIndex)}><Plus size={14} /> Add internal team</button></div>
        {team.units.map((unit, unitIndex) => <div className="excel-unit-card" key={`unit-${teamIndex}-${unitIndex}`}><div className="excel-unit-heading"><strong>Internal team {unitIndex + 1}</strong><button type="button" onClick={() => setTeams((current) => current.map((item, index) => index === teamIndex ? { ...item, units: item.units.filter((_, childIndex) => childIndex !== unitIndex) } : item))} aria-label={`Remove internal team ${unitIndex + 1}`}><X size={14} /></button></div><div className="excel-edit-grid"><label>Name<input value={unit.name ?? ''} onChange={(event) => updateUnit(teamIndex, unitIndex, 'name', event.target.value)} /></label><label>Type<select value={unit.unit_type ?? ''} onChange={(event) => updateUnit(teamIndex, unitIndex, 'unit_type', event.target.value)}><option value="">Choose type</option>{UNIT_TYPES.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label>Status<select value={unit.status || 'available'} onChange={(event) => updateUnit(teamIndex, unitIndex, 'status', event.target.value)}>{STATUS_OPTIONS.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label>Capabilities<input value={Array.isArray(unit.capabilities) ? unit.capabilities.join(', ') : unit.capabilities || ''} onChange={(event) => updateUnit(teamIndex, unitIndex, 'capabilities', event.target.value)} placeholder="Separate with commas" /></label><label>Capacity<input type="number" min="1" step="1" value={unit.authorized_strength ?? ''} onChange={(event) => updateUnit(teamIndex, unitIndex, 'authorized_strength', event.target.value)} /></label><label>Current people<input type="number" min="0" step="1" value={unit.current_member_count ?? ''} onChange={(event) => updateUnit(teamIndex, unitIndex, 'current_member_count', event.target.value)} /></label><label>Available people<input type="number" min="0" step="1" value={unit.available_member_count ?? ''} onChange={(event) => updateUnit(teamIndex, unitIndex, 'available_member_count', event.target.value)} /></label><label>Rating (optional)<input type="number" min="0" max="5" step="0.1" value={unit.rating_average ?? ''} onChange={(event) => updateUnit(teamIndex, unitIndex, 'rating_average', event.target.value)} /></label><label>Rating count<input type="number" min="0" step="1" value={unit.rating_count ?? 0} onChange={(event) => updateUnit(teamIndex, unitIndex, 'rating_count', event.target.value)} /></label></div></div>)}
      </article>)}</div>
      <div className="excel-preview-actions"><button type="button" className="team-cancel" onClick={addTeam}><Plus size={14} /> Add another rescue team</button></div>
      <div className="excel-import-disclaimer">The Excel file itself is not saved. Confirming writes the edited team and internal-team records to MongoDB; no alert assignments are created.</div>
    </>}
    {error && <div className="team-form-error excel-import-error" role="alert">{error}</div>}
    <div className="excel-import-footer"><button className="team-cancel" type="button" onClick={onCancel} disabled={saving}>Cancel</button>{teams.length > 0 && <button className="team-submit" type="button" onClick={confirmSave} disabled={saving || previewing}>{saving ? 'Saving confirmed data…' : `Confirm and save ${teams.length} team${teams.length === 1 ? '' : 's'}`}</button>}</div>
  </div>
}

const EMPTY_UNIT_FORM = {
  name: '', unit_type: '', status: 'available', capabilities: '',
  authorized_strength: '5', current_member_count: '0', available_member_count: '0',
}

function RescueTeamDetail({ team, units, members, loading, error, accessToken, onBack, onReload }) {
  const [unitDialogOpen, setUnitDialogOpen] = useState(false)
  const [unitForm, setUnitForm] = useState(EMPTY_UNIT_FORM)
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [memberForm, setMemberForm] = useState({ email: '', unit_id: '', member_role: 'responder', years_experience: '0', rescues_completed: '0', capabilities: '', rating_average: '', rating_count: '0', member_status: 'active', availability: 'off-duty' })
  const [saving, setSaving] = useState(false)
  const [unitError, setUnitError] = useState('')
  const [memberError, setMemberError] = useState('')
  const [success, setSuccess] = useState('')
  const updateUnit = (key, value) => setUnitForm((current) => ({ ...current, [key]: value }))
  const rating = team.rating_count && team.rating_average != null ? `${Number(team.rating_average).toFixed(1)} / 5 (${team.rating_count})` : 'Not rated yet'

  const submitUnit = async (event) => {
    event.preventDefault()
    if (saving) return
    const capacity = Number(unitForm.authorized_strength)
    const current = Number(unitForm.current_member_count)
    const available = Number(unitForm.available_member_count)
    if (current > capacity) { setUnitError('Current headcount cannot exceed unit capacity.'); return }
    if (available > current) { setUnitError('Available headcount cannot exceed current headcount.'); return }
    setSaving(true)
    setUnitError('')
    try {
      await adminApi.createTeamUnit(accessToken, team.id, {
        name: unitForm.name.trim(),
        unit_type: unitForm.unit_type,
        status: unitForm.status,
        capabilities: unitForm.capabilities.split(',').map((value) => value.trim()).filter(Boolean),
        authorized_strength: capacity,
        current_member_count: current,
        available_member_count: available,
      })
      setUnitDialogOpen(false)
      setUnitForm(EMPTY_UNIT_FORM)
      setSuccess('Internal team added. It has not been assigned to an alert.')
      await onReload()
    } catch (reason) {
      setUnitError(reason.response?.data?.detail || 'Could not add this internal team.')
    } finally { setSaving(false) }
  }

  const submitMember = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setMemberError('')
    try {
      await adminApi.createTeamMember(accessToken, team.id, {
        ...memberForm,
        email: memberForm.email.trim(),
        years_experience: Number(memberForm.years_experience),
        rescues_completed: Number(memberForm.rescues_completed),
        capabilities: memberForm.capabilities.split(',').map((value) => value.trim()).filter(Boolean),
        rating_average: memberForm.rating_average === '' ? null : Number(memberForm.rating_average),
        rating_count: Number(memberForm.rating_count || 0),
      })
      setMemberDialogOpen(false)
      setMemberForm({ email: '', unit_id: '', member_role: 'responder', years_experience: '0', rescues_completed: '0', capabilities: '', rating_average: '', rating_count: '0', member_status: 'active', availability: 'off-duty' })
      setSuccess('Member profile saved to the internal team.')
      await onReload()
    } catch (reason) {
      setMemberError(reason.response?.data?.detail || 'Could not save this member profile.')
    } finally { setSaving(false) }
  }

  return <>
    <div className="team-detail-toolbar"><button className="team-back-button" type="button" onClick={onBack}><ArrowLeft size={16} /> All rescue teams</button><div className="team-detail-actions"><button className="team-secondary-action" type="button" onClick={() => { setMemberError(''); setSuccess(''); setMemberDialogOpen(true) }}><Plus size={16} /> Add member</button><button className="admin-add-team" type="button" onClick={() => { setUnitError(''); setSuccess(''); setUnitDialogOpen(true) }}><Plus size={17} /> Add internal team</button></div></div>
    {loading ? <div className="admin-state"><span className="admin-spinner" /> Loading team details…</div> : error ? <div className="admin-error" role="alert">{error}</div> : <>
      <section className="team-detail-hero"><div className="team-detail-title"><span>{team.code || 'RESCUE TEAM'}</span><h2>{team.name}</h2><p>{titleCase(team.team_type)} · {team.base_address || 'Base location not set'}</p><small>{coordinates(team.base_location)}</small></div><span className={`team-detail-status team-status-${String(team.status || '').toLowerCase()}`}>{titleCase(team.status || 'offline')}</span></section>
      {success && <div className="team-success" role="status"><CheckCircle2 size={17} />{success}<button type="button" onClick={() => setSuccess('')} aria-label="Dismiss message"><X size={15} /></button></div>}
      <div className="team-detail-stats"><div><span>Authorized capacity</span><strong>{team.authorized_strength ?? 0}</strong><small>People</small></div><div><span>Current headcount</span><strong>{team.current_member_count ?? 0}</strong><small>Reported team strength</small></div><div><span>Available now</span><strong>{team.available_member_count ?? 0}</strong><small>For response work</small></div><div><span>Internal teams</span><strong>{units.length}</strong><small>Operational units</small></div><div className="team-rating-stat"><span>Overall rating</span><strong><Star size={17} fill={team.rating_count ? 'currentColor' : 'none'} />{rating}</strong><small>Based on completed response feedback</small></div></div>
      <DataTable title="Internal teams and capabilities" subtitle="Each internal unit has its own type, status, capabilities, capacity, and rating." rows={units} empty="No internal teams have been added yet." columns={[
        ['name', 'Internal team'], ['unit_type', 'Type', (row) => titleCase(row.unit_type)], ['status', 'Status', (row) => <span className={`admin-status team-status-pill-${String(row.status).toLowerCase()}`}>{titleCase(row.status)}</span>], ['capabilities', 'Capabilities', (row) => row.capabilities?.length ? row.capabilities.join(', ') : 'Not listed'], ['authorized_strength', 'Capacity'], ['current_member_count', 'Current people', (row) => `${row.current_member_count ?? 0} / ${row.authorized_strength ?? '—'}`], ['available_member_count', 'Available'], ['rating_average', 'Rating', (row) => row.rating_count ? `${Number(row.rating_average).toFixed(1)} ★ (${row.rating_count})` : 'Not rated yet'],
      ]} searchPlaceholder="Search internal teams or capabilities…" searchFields={['name', 'unit_type', 'status', 'capabilities']} filters={[
        { key: 'unit_type', label: 'All types', options: (data) => [...new Set(data.map((row) => row.unit_type).filter(Boolean))].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => row.unit_type === value },
        { key: 'status', label: 'All statuses', options: ['available', 'deployed', 'offline'].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => row.status === value },
      ]} />
      <DataTable title="Team members" subtitle="Individual profiles include experience, rescue history, capabilities, and rating." rows={members} empty="No individual accounts are linked to this team yet." columns={[
        ['full_name', 'Name'], ['email', 'Email'], ['unit_name', 'Internal team'], ['member_role', 'Team role', (row) => titleCase(row.member_role)], ['years_experience', 'Experience', (row) => row.years_experience == null ? 'Not recorded' : `${row.years_experience} yrs`], ['rescues_completed', 'Rescues', (row) => row.rescues_completed ?? 'Not recorded'], ['capabilities', 'Capabilities', (row) => row.capabilities?.length ? row.capabilities.join(', ') : 'Not recorded'], ['rating_average', 'Rating', (row) => row.rating_average == null ? 'Not rated' : `${Number(row.rating_average).toFixed(1)} / 5 (${row.rating_count ?? 0})`], ['member_status', 'Membership', (row) => titleCase(row.member_status)], ['availability', 'Availability', (row) => titleCase(row.availability)],
      ]} searchPlaceholder="Search member name, email, capabilities, or role…" searchFields={['full_name', 'email', 'member_role', 'unit_name', 'capabilities']} filters={[
        { key: 'member_status', label: 'All membership statuses', options: (data) => [...new Set(data.map((row) => row.member_status).filter(Boolean))].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => row.member_status === value },
        { key: 'availability', label: 'All availability', options: (data) => [...new Set(data.map((row) => row.availability).filter(Boolean))].map((value) => ({ value, label: titleCase(value) })), matches: (row, value) => row.availability === value },
      ]} />
    </>}
    {unitDialogOpen && <div className="team-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setUnitDialogOpen(false) }}><section className="team-dialog team-unit-dialog" role="dialog" aria-modal="true" aria-labelledby="unit-dialog-title"><div className="team-dialog-heading"><div><span>{team.code || 'RESCUE TEAM'}</span><h2 id="unit-dialog-title">Add an internal team</h2><p>Create a unit under {team.name}. No alert will be assigned.</p></div><button type="button" onClick={() => setUnitDialogOpen(false)} aria-label="Close dialog" disabled={saving}><X size={19} /></button></div>
      <form className="team-form" onSubmit={submitUnit}>
        <label>Internal team name<input required minLength="2" maxLength="120" value={unitForm.name} onChange={(event) => updateUnit('name', event.target.value)} placeholder="e.g. Medical response unit" /></label>
        <label>Unit type<select required value={unitForm.unit_type} onChange={(event) => updateUnit('unit_type', event.target.value)}><option value="">Select a type</option><option value="medical">Medical</option><option value="search_and_rescue">Search and rescue</option><option value="fire">Fire response</option><option value="water_rescue">Water rescue</option><option value="logistics">Logistics</option><option value="communications">Communications</option><option value="evacuation">Evacuation</option><option value="other">Other</option></select></label>
        <label>Status<select required value={unitForm.status} onChange={(event) => updateUnit('status', event.target.value)}><option value="available">Available</option><option value="deployed">Deployed</option><option value="offline">Offline</option></select></label>
        <label>Capabilities<input maxLength="500" value={unitForm.capabilities} onChange={(event) => updateUnit('capabilities', event.target.value)} placeholder="First aid, boats, rescue equipment" /><small>Separate capabilities with commas.</small></label>
        <label>Authorized capacity<input required type="number" min="1" max="10000" value={unitForm.authorized_strength} onChange={(event) => updateUnit('authorized_strength', event.target.value)} /></label>
        <label>People currently in unit<input required type="number" min="0" max="10000" value={unitForm.current_member_count} onChange={(event) => updateUnit('current_member_count', event.target.value)} /></label>
        <label>Available people now<input required type="number" min="0" max="10000" value={unitForm.available_member_count} onChange={(event) => updateUnit('available_member_count', event.target.value)} /></label>
        {unitError && <div className="team-form-error team-form-span" role="alert">{unitError}</div>}
        <div className="team-form-actions team-form-span"><button className="team-cancel" type="button" onClick={() => setUnitDialogOpen(false)} disabled={saving}>Cancel</button><button className="team-submit" type="submit" disabled={saving}>{saving ? 'Saving unit…' : <><Plus size={16} /> Add internal team</>}</button></div>
      </form>
    </section></div>}
    {memberDialogOpen && <div className="team-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setMemberDialogOpen(false) }}><section className="team-dialog" role="dialog" aria-modal="true" aria-labelledby="member-dialog-title"><div className="team-dialog-heading"><div><span>{team.code || 'RESCUE TEAM'}</span><h2 id="member-dialog-title">Add internal team member</h2><p>Link an existing account to {team.name} and record their profile.</p></div><button type="button" onClick={() => setMemberDialogOpen(false)} aria-label="Close dialog" disabled={saving}><X size={19} /></button></div>
      <form className="team-form" onSubmit={submitMember}>
        <label className="team-form-span">Rescue-team account email<input required type="email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} placeholder="member@example.com" /><small>The account must already exist. Saving this profile grants responder access.</small></label>
        <label className="team-form-span">Internal team<select required value={memberForm.unit_id} onChange={(event) => setMemberForm((current) => ({ ...current, unit_id: event.target.value }))}><option value="">Select an internal team</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label>Role<input required maxLength="40" value={memberForm.member_role} onChange={(event) => setMemberForm((current) => ({ ...current, member_role: event.target.value }))} placeholder="responder" /></label>
        <label>Years of experience<input required type="number" min="0" max="80" step="0.5" value={memberForm.years_experience} onChange={(event) => setMemberForm((current) => ({ ...current, years_experience: event.target.value }))} /></label>
        <label>Rescues completed<input required type="number" min="0" max="100000" step="1" value={memberForm.rescues_completed} onChange={(event) => setMemberForm((current) => ({ ...current, rescues_completed: event.target.value }))} /></label>
        <label>Member rating<input type="number" min="0" max="5" step="0.1" value={memberForm.rating_average} onChange={(event) => setMemberForm((current) => ({ ...current, rating_average: event.target.value }))} placeholder="Not rated" /></label>
        <label>Rating count<input required type="number" min="0" step="1" value={memberForm.rating_count} onChange={(event) => setMemberForm((current) => ({ ...current, rating_count: event.target.value }))} /></label>
        <label className="team-form-span">Member capabilities<input maxLength="500" value={memberForm.capabilities} onChange={(event) => setMemberForm((current) => ({ ...current, capabilities: event.target.value }))} placeholder="First aid, rope rescue, radio operation" /><small>Separate capabilities with commas.</small></label>
        <label>Membership<select value={memberForm.member_status} onChange={(event) => setMemberForm((current) => ({ ...current, member_status: event.target.value }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label>Availability<select value={memberForm.availability} onChange={(event) => setMemberForm((current) => ({ ...current, availability: event.target.value }))}><option value="available">Available</option><option value="deployed">Deployed</option><option value="off-duty">Off duty</option></select></label>
        {memberError && <div className="team-form-error team-form-span" role="alert">{memberError}</div>}
        <div className="team-form-actions team-form-span"><button className="team-cancel" type="button" onClick={() => setMemberDialogOpen(false)} disabled={saving}>Cancel</button><button className="team-submit" type="submit" disabled={saving || !units.length}>{saving ? 'Saving member…' : 'Save member profile'}</button></div>
      </form>
    </section></div>}
  </>
}

function DataTable({ title, subtitle, rows, columns, empty, filters = [], searchFields = [], searchPlaceholder = 'Search this table…' }) {
  const [query, setQuery] = useState('')
  const [selectedFilters, setSelectedFilters] = useState({})
  const wrapperKeys = ['items', 'results', 'rows', 'data', 'users', 'alerts', 'teams', 'assignments']
  const rowsAreValid = Array.isArray(rows) || Boolean(rows && typeof rows === 'object' && wrapperKeys.some((key) => Array.isArray(rows[key])))
  const tableRows = Array.isArray(rows) ? rows : wrapperKeys.map((key) => rows?.[key]).find(Array.isArray) || []
  const filteredRows = tableRows.filter((row) => {
    const normalizedQuery = query.trim().toLowerCase()
    const matchesQuery = !normalizedQuery || (searchFields.length ? searchFields : columns.map(([key]) => key).filter((key) => typeof row[key] === 'string' || typeof row[key] === 'number')).some((key) => String(row[key] ?? '').toLowerCase().includes(normalizedQuery))
    return matchesQuery && filters.every((filter) => !selectedFilters[filter.key] || filter.matches(row, selectedFilters[filter.key]))
  })
  const activeFilterCount = Object.values(selectedFilters).filter(Boolean).length
  const clearFilters = () => { setQuery(''); setSelectedFilters({}) }

  return <section className="admin-panel"><div className="admin-panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="admin-record-count">{filteredRows.length} of {tableRows.length} records</span></div>
    <div className="admin-table-toolbar"><label className="admin-table-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} aria-label={`Search ${title.toLowerCase()}`} /></label><span className="admin-filter-label"><SlidersHorizontal size={15} /> Filters</span>{filters.map((filter) => {
      const options = typeof filter.options === 'function' ? filter.options(tableRows) : filter.options
      return <select className="admin-filter-select" key={filter.key} value={selectedFilters[filter.key] || ''} onChange={(event) => setSelectedFilters((current) => ({ ...current, [filter.key]: event.target.value }))} aria-label={filter.label}><option value="">{filter.label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    })}{(query || activeFilterCount > 0) && <button className="admin-clear-filters" type="button" onClick={clearFilters}><X size={14} /> Clear</button>}</div>
    {!rowsAreValid ? <div className="admin-error" role="alert">The API response for this table was not a list. Refresh the page or check the admin API response format.</div> : tableRows.length === 0 ? <div className="admin-empty"><span><MapPinned size={19} /></span><strong>{empty}</strong><small>Records will appear here as the system is used.</small></div> : filteredRows.length === 0 ? <div className="admin-empty admin-empty--filtered"><span><Search size={19} /></span><strong>No matching records</strong><small>Try a different search or clear the selected filters.</small><button type="button" onClick={clearFilters}>Clear filters</button></div> : <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{filteredRows.map((row, index) => <tr key={row.id || row.emergency_id || `${row.email || row.name || 'row'}-${index}`}>{columns.map(([key, , render]) => <td key={key}>{render ? render(row) : row[key] ?? '—'}</td>)}</tr>)}</tbody></table></div>}
  </section>
}

export default AdminDashboard
