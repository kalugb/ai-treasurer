import axios from 'axios'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const client = axios.create({
  baseURL: baseUrl,
  headers: { 'Content-Type': 'application/json' },
})

async function request(path, options) {
  const response = await client({ url: path, ...options })
  return response.status === 204 ? null : response.data
}

export const api = {
  getDashboard: () => request('/api/dashboard'),
  getTeams: () => request('/api/teams'),
  createTeam: (team) => request('/api/teams', { method: 'POST', data: team }),
  updateTeam: (id, team) => request(`/api/teams/${id}`, { method: 'PUT', data: team }),
  deleteTeam: (id) => request(`/api/teams/${id}`, { method: 'DELETE' }),
}
