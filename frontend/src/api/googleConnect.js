import { request } from './client';

async function checkGoogleIntegration() {
    return request(
        "/api/connect/google-drive-service-exists",
        { method: "GET" }
    )
}

async function connectGoogleIntegration() {
    return request(
        "/api/connect/google-drive-service-connect",
        { method: "POST" }
    )
}

async function disconnectGoogleIntegration() {
    return request(
        "/api/connect/google-drive-service-disconnect",
        { method: "DELETE" }
    )
}

export const googleAPI = {
    checkGoogleIntegration,
    connectGoogleIntegration,
    disconnectGoogleIntegration
}