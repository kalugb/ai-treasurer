import { request } from "./client";

async function checkGoogleIntegration() {
    return request(
        "api/google-drive-service-exists",
        { method: "GET" }
    )
}

export const googleAPI = {
    checkGoogleIntegration,
}