import { request } from './client'

const testPostReq = (payload) => {
    return request('/api/test-post', {
        method: 'POST',
        data: payload,
    })
}

export const dashboardAPI = {
    getDashboard: () => request('/api/dashboard'),
    testAxios: () => request('/api/test-axios'),
    
    testPost: (payload) => testPostReq(payload),
}

