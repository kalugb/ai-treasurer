import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { agentStreamUrl } from '../api/agent'
import { AgentRunContext } from './agentRun'

const USER_ID = '1' // pre-auth placeholder, matches backend

// Global AI-agent run status. One SSE connection (mounted once in App) carries status
// for every conversation of the user, so runs survive in-app navigation with no refresh.
// Multiple concurrent runs are tracked as a map keyed by conversationId.
export function AgentRunProvider({ children }) {
	// runs: { [conversationId]: { status, memoryId, output, completedAt } }
	const [runs, setRuns] = useState({})
	const [completedAt, setCompletedAt] = useState(0) // bumps on any run finishing, so pages can refetch
	const sourceRef = useRef(null)

	const applyEvent = useCallback((payload) => {
		const { conversationId, memoryId, status, output } = payload
		if (!conversationId) return
		setRuns((prev) => ({
			...prev,
			[conversationId]: {
				status,
				memoryId: memoryId ?? prev[conversationId]?.memoryId ?? null,
				output: output ?? prev[conversationId]?.output ?? null,
				completedAt: status === 'In Progress' ? (prev[conversationId]?.completedAt ?? 0) : Date.now(),
			},
		}))
		if (status !== 'In Progress') setCompletedAt((n) => n + 1)
	}, [])

	useEffect(() => {
		if (typeof EventSource === 'undefined') return

		const source = new EventSource(agentStreamUrl(USER_ID))
		sourceRef.current = source

		source.addEventListener('snapshot', (event) => {
			try {
				const { inProgress } = JSON.parse(event.data)
				setRuns((prev) => {
					const next = { ...prev }
					for (const r of inProgress || []) {
						next[r.conversationId] = { status: 'In Progress', memoryId: r.memoryId, output: null, completedAt: 0 }
					}
					return next
				})
			} catch { /* ignore malformed snapshot */ }
		})

		const onStatus = (event) => {
			try { applyEvent(JSON.parse(event.data)) } catch { /* ignore */ }
		}
		source.addEventListener('running', onStatus)
		source.addEventListener('done', onStatus)
		source.addEventListener('error', (event) => {
			// Only our server-sent error payloads carry data; transport errors have none (EventSource auto-reconnects).
			if (event?.data) onStatus(event)
		})

		return () => {
			source.close()
			sourceRef.current = null
		}
	}, [applyEvent])

	// Optimistic: mark a conversation In Progress the moment the user sends, before the stream confirms.
	const notifyStarted = useCallback((conversationId, memoryId) => {
		if (!conversationId) return
		setRuns((prev) => ({
			...prev,
			[conversationId]: { status: 'In Progress', memoryId, output: null, completedAt: 0 },
		}))
	}, [])

	// Clear a finished run from the pill once its toast has been shown/dismissed.
	const clearRun = useCallback((conversationId) => {
		setRuns((prev) => {
			if (!prev[conversationId] || prev[conversationId].status === 'In Progress') return prev
			const next = { ...prev }
			delete next[conversationId]
			return next
		})
	}, [])

	const inProgressCount = useMemo(
		() => Object.values(runs).filter((r) => r.status === 'In Progress').length,
		[runs],
	)

	const value = useMemo(
		() => ({ runs, inProgressCount, completedAt, notifyStarted, clearRun }),
		[runs, inProgressCount, completedAt, notifyStarted, clearRun],
	)

	return <AgentRunContext.Provider value={value}>{children}</AgentRunContext.Provider>
}
