import { createContext, useContext } from 'react'

export const AgentRunContext = createContext(null)

export function useAgentRun() {
	const ctx = useContext(AgentRunContext)
	if (!ctx) throw new Error('useAgentRun must be used within an AgentRunProvider')
	return ctx
}
