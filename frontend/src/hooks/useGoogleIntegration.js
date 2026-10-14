import { useState, useEffect } from 'react'
import { googleAPI } from '../api/google'

export function useGoogleIntegration() {
    const [connected, setConnected] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false;

        const checkIntegration = async () => {
            try {
                const isIntegrated = await googleAPI.checkGoogleIntegration();
                if (!cancelled) setConnected(isIntegrated.google_drive_service_exists);
            } catch (error) {
                console.error('Error checking Google integration:', error);
                if (!cancelled) setConnected(false);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        checkIntegration();

        return () => {
            cancelled = true;
        };
    }, []);

    return { connected, setConnected, loading, setLoading };
}