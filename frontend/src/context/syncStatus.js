import { createContext, useContext } from 'react'

export const SyncStatusContext = createContext(null)

export function useSyncStatus() {
	const ctx = useContext(SyncStatusContext)
	if (!ctx) throw new Error('useSyncStatus must be used within a SyncStatusProvider')
	return ctx
}
