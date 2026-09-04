import { request } from './client'

async function getOrganization(ownerId) {
    return request(
        '/api/organizations', 
        { method: 'GET', params: { ownerId } }
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