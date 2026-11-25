import { useState, useEffect, useCallback } from 'react'
import { usersAPI } from '../api/users'

// The current user's Google Drive connection (zero or one per user).
export function useGoogleIntegration() {
    const [status, setStatus] = useState({ connected: false, accountEmail: null })
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        try {
            const next = await usersAPI.driveStatus()
            setStatus(next)
        } catch (error) {
            console.error('Error checking Google integration:', error)
            setStatus({ connected: false, accountEmail: null })
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        usersAPI.driveStatus()
            .then((next) => { if (!cancelled) setStatus(next) })
            .catch((error) => console.error('Error checking Google integration:', error))
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [])

    return { connected: status.connected, accountEmail: status.accountEmail, loading, setLoading, refresh }
}
