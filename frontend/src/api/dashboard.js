import { request } from './client'

export const dashboardAPI = {
    getOverview: (orgId) => request('/api/dashboard', { method: 'GET', params: { orgId } }),
}
