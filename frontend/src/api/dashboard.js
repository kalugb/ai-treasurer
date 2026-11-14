import { request } from './client'

const testPostReq = (payload) => {
    return request('/api/test-post', {
        method: 'POST',
        data: payload,
    })
}

export const dashboardAPI = {
    getOverview: (orgId, ownerId) => request('/api/dashboard', { method: 'GET', params: { orgId, ownerId } }),
    testAxios: () => request('/api/test-axios'),
    
    testPost: (payload) => testPostReq(payload),
}

