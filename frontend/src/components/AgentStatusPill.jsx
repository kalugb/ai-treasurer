import { useEffect, useRef } from 'react'
import Icon from './Icon'
import { useAgentRun } from '../context/agentRun'

// Fixed bottom-right status for AI-agent runs, visible on any page.
// While runs are in progress: a spinner pill showing how many are running (req #4).
// When a run finishes: an auto-dismissing toast ("generated a response" / error), then it clears (req #3).
const DISMISS_MS = 5000

export default function AgentStatusPill() {
	const { runs, inProgressCount, clearRun } = useAgentRun()

	// Finished runs still in the map get a toast; auto-clear them after a few seconds.
	const finished = Object.entries(runs).filter(([, r]) => r.status !== 'In Progress')
	const timersRef = useRef({})
	useEffect(() => {
		for (const [cid] of finished) {
			if (timersRef.current[cid]) continue
			timersRef.current[cid] = setTimeout(() => {
				clearRun(cid)
				delete timersRef.current[cid]
			}, DISMISS_MS)
		}
	})
	useEffect(() => () => {
		for (const id of Object.keys(timersRef.current)) clearTimeout(timersRef.current[id])
	}, [])

	if (inProgressCount === 0 && finished.length === 0) return null

	return (
		<div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2" role="status" aria-live="polite">
			{inProgressCount > 0 && (
				<div className="flex items-center gap-3 rounded-lg border border-line/50 bg-white px-4 py-3 text-blue shadow-xl animate-slide-in">
					<Icon name="spinner" size={16} className="shrink-0" />
					<span className="text-[13px] font-medium">
						AI agent running… {inProgressCount > 1 ? `(${inProgressCount})` : ''}
					</span>
				</div>
			)}
			{finished.map(([cid, r]) => (
				<div
					key={cid}
					className={`flex items-center gap-3 rounded-lg border border-line/50 bg-white px-4 py-3 shadow-xl animate-slide-in ${r.status === 'Successed' ? 'text-green' : 'text-red'}`}
				>
					<Icon name={r.status === 'Successed' ? 'check' : 'close'} size={16} className="shrink-0" />
					<span className="text-[13px] font-medium">
						{r.status === 'Successed' ? 'AI agent generated a response' : 'AI agent run failed'}
					</span>
					<button onClick={() => clearRun(cid)} className="ml-2 rounded p-1 hover:bg-black/10 transition-colors" aria-label="Dismiss">
						<Icon name="close" size={14} />
					</button>
				</div>
			))}
		</div>
	)
}
