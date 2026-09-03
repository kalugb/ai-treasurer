import { request } from './client'

async function getOrganization() {
    return request(
        '/api/organizations', 
        { method: 'GET' }
    )
}

async function createOrganization(payload) {
    return request(
        '/api/organizations', 
        { method: 'POST', data: payload }
    )  
}

async function updateOrganization(orgId, payload) {
    return request(
        `/api/organizations/${orgId}`, 
        { method: 'PUT', data: payload }
    )  
}

async function deleteOrganization(orgId) {
    return request(
        `/api/organizations/${orgId}`, 
        { method: 'DELETE' }
    )  
}

export const organizationAPI = {
    getOrganization,
    createOrganization,
    updateOrganization,
    deleteOrganization,
}