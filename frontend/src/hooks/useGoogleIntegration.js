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
                if (!cancelled) {
                    setConnected(isIntegrated);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        checkIntegration();

        return () => {
            cancelled = true;
        };
    }, []);

    return { connected, loading };
}