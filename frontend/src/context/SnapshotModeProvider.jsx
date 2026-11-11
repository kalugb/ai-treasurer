import { useCallback, useEffect, useMemo, useState } from 'react'
import { snapshotsAPI } from '../api/snapshots'
import { setActiveSnapshot } from '../api/snapshotMode'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'
import { SnapshotModeContext } from './snapshotMode'

const STORAGE_KEY = 'snapshotId'
const readStored = () => { try { return sessionStorage.getItem(STORAGE_KEY) } catch { return null } }

// Owns which snapshot (if any) the whole app is showing. The data itself lives in api/snapshotMode.js,
// where the API client reads it; this provider only flips it on/off and tells React to re-render.
export function SnapshotModeProvider({ children }) {
	const organization = useSelectedOrganization()
	// a refresh while viewing a snapshot resumes it (loading until it is fetched again)
	const [state, setState] = useState(() => (readStored() ? { status: 'loading', id: readStored(), resume: true } : { status: 'live' }))

	const exit = useCallback(() => {
		setActiveSnapshot(null)
		try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
		setState({ status: 'live' })
	}, [])

	const activate = useCallback((id, org, snapshot) => {
		setActiveSnapshot({ snapshot, orgId: org.id, ownerId: org.ownerId })
		try { sessionStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ }
		setState({ status: 'active', id, snapshot })
	}, [])

	// throws so the caller can show why it failed; the app stays live
	const enter = useCallback(async (id) => {
		if (!organization?.id) throw new Error('Select an organization first.')
		setState({ status: 'loading', id })
		try {
			activate(id, organization, await snapshotsAPI.get(id, organization.id, organization.ownerId)) // a normal GET: snapshot mode isn't on yet
		} catch (error) {
			exit()
			throw error
		}
	}, [organization, activate, exit])

	// resume after a page refresh
	const resumeId = state.status === 'loading' && state.resume ? state.id : null
	useEffect(() => {
		if (!resumeId || !organization?.id) return
		snapshotsAPI.get(resumeId, organization.id, organization.ownerId)
			.then((snapshot) => activate(resumeId, organization, snapshot))
			.catch(exit)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [resumeId, organization?.id])

	// a snapshot belongs to one org: switching organization leaves the snapshot
	useEffect(() => {
		const onOrgChange = (event) => {
			if (state.status !== 'live' && event.detail?.id !== organization?.id) exit()
		}
		window.addEventListener('ai-treasurer:org-changed', onOrgChange)
		return () => window.removeEventListener('ai-treasurer:org-changed', onOrgChange)
	}, [state.status, organization?.id, exit])

	// no organization selected (e.g. cleared) -> nothing to resume
	const status = state.status === 'loading' && !organization ? 'live' : state.status
	const value = useMemo(() => ({
		status,
		snapshot: status === 'active' ? state.snapshot : null,
		readOnly: status !== 'live',
		enter,
		exit,
	}), [status, state.snapshot, enter, exit])

	return <SnapshotModeContext.Provider value={value}>{children}</SnapshotModeContext.Provider>
}
