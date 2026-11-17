import api from './client.js'

const mockEnabled = import.meta.env.VITE_USE_MOCK_API === 'true'

const wait = (value) => new Promise((resolve) => window.setTimeout(() => resolve(value), 650))

export async function createEmergency(payload, accessToken) {
  const { data } = await api.post('/api/v1/emergencies', payload, { headers: { Authorization: `Bearer ${accessToken}` } })
  return data
}

export async function getMyEmergencies(accessToken) {
  const { data } = await api.get('/api/v1/emergencies/mine', { headers: { Authorization: `Bearer ${accessToken}` } })
  return data
}

export async function getEmergency(emergencyId) {
  if (mockEnabled) return wait({ emergency_id: emergencyId, status: 'PENDING_ASSIGNMENT', team: null, mock: true })
  const { data } = await api.get(`/api/v1/emergencies/${encodeURIComponent(emergencyId)}`)
  return data
}
