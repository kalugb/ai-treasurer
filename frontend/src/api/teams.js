import { request } from './client'

export const teamsAPI = {
    getTeams: () => request('/api/teams'),
    createTeam: (team) => request('/api/teams', { method: 'POST', data: team }),
    updateTeam: (id, team) => request(`/api/teams/${id}`, { method: 'PUT', data: team }),
    deleteTeam: (id) => request(`/api/teams/${id}`, { method: 'DELETE' }),
}