import api from './client.js'

const request = (path, accessToken) => api.get(`/api/v1/admin/${path}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
}).then(({ data }) => data)

export const adminApi = {
  summary: (token) => request('summary', token),
  users: (token) => request('users', token),
  alerts: (token) => request('alerts', token),
  teams: (token) => request('teams', token),
  teamDetail: (token, teamId) => request(`teams/${encodeURIComponent(teamId)}`, token),
  createTeam: (token, payload) => api.post('/api/v1/admin/teams', payload, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(({ data }) => data),
  previewTeamWorkbook: (token, file) => api.post('/api/v1/admin/teams/import-preview', file, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  }).then(({ data }) => data),
  importTeams: (token, teams) => api.post('/api/v1/admin/teams/import', { teams }, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(({ data }) => data),
  createTeamUnit: (token, teamId, payload) => api.post(`/api/v1/admin/teams/${encodeURIComponent(teamId)}/units`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(({ data }) => data),
  createTeamMember: (token, teamId, payload) => api.post(`/api/v1/admin/teams/${encodeURIComponent(teamId)}/members`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(({ data }) => data),
  ongoing: (token) => request('assignments/active', token),
}
