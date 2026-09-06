import { request } from './client'

export const teamsAPI = {
	getTeams: (orgId, ownerId) => request('/api/teams', { method: 'GET', params: { orgId, ...(ownerId ? { ownerId } : {}) } }),
	createTeam: (team) => request('/api/teams', { method: 'POST', data: team, params: team.ownerId ? { ownerId: team.ownerId } : {} }),
	updateTeam: (id, team, orgId, ownerId) => request(`/api/teams/${id}`, { method: 'PUT', data: team, params: { ...(orgId ? { orgId } : {}), ...(ownerId ? { ownerId } : {}) } }),
	deleteTeam: (id, orgId, ownerId) => request(`/api/teams/${id}`, { method: 'DELETE', params: { ...(orgId ? { orgId } : {}), ...(ownerId ? { ownerId } : {}) } }),
}
