import { createContext, useContext } from 'react'

export const SnapshotModeContext = createContext(null)

// { status: 'live' | 'loading' | 'active', snapshot, readOnly, enter(id), exit() }
export function useSnapshotMode() {
	const ctx = useContext(SnapshotModeContext)
	if (!ctx) throw new Error('useSnapshotMode must be used within a SnapshotModeProvider')
	return ctx
}
