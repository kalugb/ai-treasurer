import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import BlurText from '../components/BlurText'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { button } from '../components/button'
import { agentAPI } from '../api/agent'
import { useAgentRun } from '../context/agentRun'

// Tailwind-styled element overrides so agent Markdown renders clean (no raw **/##/* chars).
const mdComponents = {
	h1: ({ ...p }) => <h1 className="mb-2 mt-4 font-display text-[18px] font-semibold tracking-[-0.02em] text-ink" {...p} />,
	h2: ({ ...p }) => <h2 className="mb-2 mt-4 font-display text-[16px] font-semibold tracking-[-0.02em] text-ink" {...p} />,
	h3: ({ ...p }) => <h3 className="mb-1.5 mt-3 text-[14px] font-bold text-ink" {...p} />,
	p: ({ ...p }) => <p className="mb-3 last:mb-0" {...p} />,
	ul: ({ ...p }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...p} />,
	ol: ({ ...p }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...p} />,
	li: ({ ...p }) => <li className="leading-6" {...p} />,
	strong: ({ ...p }) => <strong className="font-semibold text-ink" {...p} />,
	em: ({ ...p }) => <em className="italic" {...p} />,
	a: ({ ...p }) => <a className="text-blue underline underline-offset-2 hover:text-blue-dark" target="_blank" rel="noreferrer" {...p} />,
	blockquote: ({ ...p }) => <blockquote className="my-3 border-l-2 border-line pl-3 text-muted" {...p} />,
	hr: ({ ...p }) => <hr className="my-4 border-line" {...p} />,
	code: ({ inline, className, children, ...p }) =>
		inline
			? <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[12.5px] text-ink" {...p}>{children}</code>
			: <code className={`font-mono text-[12.5px] ${className || ''}`} {...p}>{children}</code>,
	pre: ({ ...p }) => <pre className="my-3 overflow-x-auto rounded-lg bg-ink/95 p-3 text-[12.5px] text-white" {...p} />,
	table: ({ ...p }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-[13px]" {...p} /></div>,
	th: ({ ...p }) => <th className="border border-line bg-paper px-3 py-1.5 text-left font-semibold" {...p} />,
	td: ({ ...p }) => <td className="border border-line px-3 py-1.5" {...p} />,
}

function AssistantMessage({ text, pending }) {
	return (
		<div className="flex gap-3 px-1 py-5">
			<span className="grid size-8 shrink-0 place-items-center rounded-full bg-brown text-white" aria-label="AI Treasurer">
				<Icon name="assistant" size={17} />
			</span>
			<div className="min-w-0 flex-1 pt-1 text-[14px] leading-7 text-ink">
				{pending
					? (
						<span className="inline-flex items-center gap-1.5 text-muted">
							<span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
							<span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
							<span className="size-1.5 animate-bounce rounded-full bg-muted" />
							<span className="ml-1.5 text-[13px]">Generating response…</span>
						</span>
					)
					: <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{text}</ReactMarkdown>}
			</div>
		</div>
	)
}

function UserMessage({ text }) {
	return (
		<div className="flex justify-end gap-3 px-1 py-5">
			<div className="max-w-[min(78%,620px)] rounded-[20px] rounded-br-md bg-blue px-4 py-3 text-[14px] leading-6 text-white whitespace-pre-wrap">{text}</div>
			<span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white" aria-label="You">
				<Icon name="user" size={17} />
			</span>
		</div>
	)
}

// One session row in the conversation list.
function ConversationRow({ conv, active, status, onSelect, onDelete }) {
	const dot = status === 'In Progress'
		? <Icon name="spinner" size={13} className="text-blue shrink-0" />
		: status === 'Failed'
			? <span className="size-2 shrink-0 rounded-full bg-red" />
			: <span className="size-2 shrink-0 rounded-full bg-green" />
	return (
		<div
			className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${active ? 'bg-white text-ink shadow-sm' : 'text-muted hover:bg-white hover:text-ink'}`}
		>
			<button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
				{dot}
				<span className="min-w-0 flex-1 truncate">{conv.preview || 'New conversation'}</span>
			</button>
			<button
				type="button"
				onClick={onDelete}
				className="shrink-0 rounded p-1 text-muted opacity-0 transition hover:bg-red-soft hover:text-red focus-visible:opacity-100 group-hover:opacity-100"
				aria-label="Delete conversation"
			>
				<Icon name="trash" size={14} />
			</button>
		</div>
	)
}

export default function Agent() {
	const { runs, completedAt, notifyStarted } = useAgentRun()
	const [conversations, setConversations] = useState([])
	const [conversationId, setConversationId] = useState(null) // null = unsent new chat
	const [messages, setMessages] = useState([]) // [{role, text}]
	const [lastMemoryId, setLastMemoryId] = useState(null) // the in-flight/last turn for this conversation
	const [input, setInput] = useState('')
	const [sending, setSending] = useState(false) // optimistic local pending, set the instant the user sends
	const [deleteTarget, setDeleteTarget] = useState(null) // conversation pending delete confirmation
	const viewportRef = useRef(null)

	const run = conversationId ? runs[conversationId] : null
	const pending = sending || run?.status === 'In Progress'
	const failed = !sending && run?.status === 'Failed'

	const hydrate = (turns) => {
		const flat = []
		for (const t of turns || []) {
			flat.push({ role: 'user', text: t.input })
			if (t.output != null) flat.push({ role: 'assistant', text: t.output })
		}
		setMessages(flat)
		setLastMemoryId((turns || []).at(-1)?.id ?? null)
	}

	useEffect(() => {
		agentAPI.listConversations().then((res) => setConversations(res || [])).catch(() => {})
	}, [])

	// When a run for THIS conversation finishes, clear the local pending flag and refetch (live, no refresh).
	// Reacting to an external signal (the SSE run completing, surfaced via completedAt) is a valid effect;
	// the setState happens inside the async refetch callback to keep it out of the synchronous effect body.
	useEffect(() => {
		if (!conversationId || !run || run.status === 'In Progress') return
		agentAPI.getMessages(conversationId).then((turns) => { hydrate(turns); setSending(false) }).catch(() => setSending(false))
		agentAPI.listConversations().then((res) => setConversations(res || [])).catch(() => {})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [completedAt])

	useEffect(() => {
		const el = viewportRef.current
		if (el) el.scrollTop = el.scrollHeight
	}, [messages, pending])

	const newChat = () => {
		setConversationId(null)
		setMessages([])
		setLastMemoryId(null)
		setInput('')
		setSending(false)
	}

	const selectConversation = (cid) => {
		setConversationId(cid)
		setSending(false)
		agentAPI.getMessages(cid).then(hydrate).catch(() => {})
	}

	const deleteConversation = (cid) => {
		setConversations((prev) => prev.filter((c) => c.conversationId !== cid))
		if (cid === conversationId) {
			setConversationId(null)
			setMessages([])
			setLastMemoryId(null)
			setSending(false)
		}
		agentAPI.deleteConversation(cid).catch(() => {
			// re-sync the list if the server delete failed
			agentAPI.listConversations().then((res) => setConversations(res || [])).catch(() => {})
		})
	}

	const send = async () => {
		const text = input.trim()
		if (!text || pending) return
		setInput('')
		setSending(true) // show the loader immediately, before the POST resolves
		setMessages((prev) => [...prev, { role: 'user', text }])
		try {
			const res = await agentAPI.sendMessage(text, conversationId)
			if (!conversationId) {
				setConversationId(res.conversationId)
				agentAPI.listConversations().then((r) => setConversations(r || [])).catch(() => {})
			}
			setLastMemoryId(res.memoryId)
			notifyStarted(res.conversationId, res.memoryId) // optimistic In Progress before the stream confirms
		} catch {
			setSending(false)
			setMessages((prev) => [...prev, { role: 'assistant', text: 'Could not reach the AI agent. Please try again.' }])
		}
	}

	const regenerate = async () => {
		if (!lastMemoryId) return
		setSending(true)
		try {
			const res = await agentAPI.regenerate(lastMemoryId)
			notifyStarted(res.conversationId, res.memoryId)
		} catch { setSending(false) }
	}

	const onKeyDown = (e) => {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
	}

	return (
		<section className="flex h-[calc(100vh-104px)] min-h-155 w-full gap-6">
			{/* conversation list (sessions) — 15% */}
			<aside className="flex w-[15%] min-w-44 shrink-0 flex-col border-r border-line pr-4">
				<p className="px-3 pb-3 text-[11px] font-bold tracking-widest text-muted uppercase">Conversations</p>
				<div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
					{conversations.length === 0 && (
						<p className="px-3 py-2 text-[13px] text-muted">No conversations yet.</p>
					)}
					{conversations.map((c) => (
						<ConversationRow
							key={c.conversationId}
							conv={c}
							active={c.conversationId === conversationId}
							status={runs[c.conversationId]?.status ?? c.status}
							onSelect={() => selectConversation(c.conversationId)}
							onDelete={() => setDeleteTarget(c)}
						/>
					))}
				</div>
				{/* New chat pinned to the bottom */}
				<button
					type="button"
					onClick={newChat}
					className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-blue px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-blue-dark"
				>
					<Icon name="plus" size={16} /> New chat
				</button>
			</aside>

			{/* chat — 85% */}
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex items-center justify-between border-b border-line pb-5">
					<div className="flex items-center gap-3">
						<span className="grid size-10 place-items-center rounded-xl bg-brown text-white">
							<Icon name="assistant" size={20} />
						</span>
						<div>
							<h1 className="font-display text-[18px] tracking-[-0.03em] text-ink">AI Treasurer</h1>
							<p className="mt-0.5 text-[12px] text-green">
								{pending ? 'Working on your request…' : 'Online · Your financial co-pilot'}
							</p>
						</div>
					</div>
				</header>

				<div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto">
					<div className="mx-auto w-full max-w-205 py-8">
						{messages.length === 0 && !pending && (
							<div className="mb-5 px-1 text-center">
								<p className="text-[12px] font-bold tracking-widest text-muted uppercase">Financial assistant</p>
								<BlurText className="mt-2 block font-display text-[clamp(26px,4vw,38px)] tracking-tighter text-ink" text="How can I help today?" />
							</div>
						)}
						{messages.map((m, i) => (
							m.role === 'user'
								? <UserMessage key={i} text={m.text} />
								: <AssistantMessage key={i} text={m.text} />
						))}
						{pending && <AssistantMessage pending />}
						{failed && (
							<div className="flex items-center gap-3 px-1 py-4 text-[13px] text-red">
								<span>The agent failed to generate a response.</span>
								<button type="button" onClick={regenerate} className="rounded-lg bg-brown px-3 py-1.5 font-semibold text-white transition hover:opacity-90">
									Generate again
								</button>
							</div>
						)}
					</div>
				</div>

				<div className="border-t border-line bg-paper pt-4">
					<div className="mx-auto max-w-205">
						<div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 shadow-[0_8px_30px_oklch(30%_0.03_260/0.06)] focus-within:border-blue">
							<textarea
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={onKeyDown}
								rows={1}
								className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 pl-2 text-[14px] leading-6 text-ink outline-none placeholder:text-muted"
								placeholder="Message AI Treasurer…"
							/>
							<button
								type="button"
								onClick={send}
								disabled={!input.trim() || pending}
								className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue text-white transition hover:bg-blue-dark disabled:cursor-not-allowed disabled:opacity-40"
								aria-label="Send message"
							>
								<Icon name="arrow" size={18} />
							</button>
						</div>
						<p className="py-3 text-center text-[11px] text-muted">AI Treasurer can make mistakes. Review important financial decisions.</p>
					</div>
				</div>
			</div>

			<Modal
				isOpen={deleteTarget != null}
				onClose={() => setDeleteTarget(null)}
				title="Delete conversation"
				footer={<>
					<button type="button" className={button.secondary} onClick={() => setDeleteTarget(null)}>Cancel</button>
					<button
						type="button"
						className={button.danger}
						onClick={() => { deleteConversation(deleteTarget.conversationId); setDeleteTarget(null) }}
					>
						Delete
					</button>
				</>}
			>
				<p className="text-[14px] leading-6 text-muted">
					Delete “{deleteTarget?.preview || 'New conversation'}”? This permanently removes the conversation and its history and cannot be undone.
				</p>
			</Modal>
		</section>
	)
}
