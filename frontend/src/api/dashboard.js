import { request } from './client'

export const dashboardAPI = {
    getDashboard: () => request('/api/dashboard/'),
}

