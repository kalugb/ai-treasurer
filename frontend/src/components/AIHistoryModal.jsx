/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import Icon from './Icon'
import ReceiptEditor from './ReceiptEditor'
import { button } from './button'
import { aiHistoryAPI, TRIGGER_LABEL } from '../api/aiHistory'
import { errorDetail } from '../api/snapshots'
import { receiptsAPI, fetchReceipts, toReceipt } from '../api/receipts'
import { useToast } from '../context/toast'
import { useSnapshotMode } from '../context/snapshotMode'

const money = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const CHIP = { Succeeded: 'bg-green-soft text-green', Finished: 'bg-green-soft text-green', Failed: 'bg-red-soft text-red', Stopped: 'bg-red-soft text-red', 'In Progress': 'bg-blue-soft text-blue', Cancelled: 'bg-brown-soft text-brown', Interrupted: 'bg-brown-soft text-brown' }
export const Chip = ({ status }) => <span className={`rounded-[20px] px-2.25 py-1 text-[10px] font-bold ${CHIP[status] ?? 'bg-paper text-muted'}`}>{status}</span>

const suggested = (result) => result ? [result.receiptName, result.receiptAmount != null && money(result.receiptAmount), result.description].filter(Boolean).join(' · ') || 'Nothing found' : null
const appliedText = (applied) => applied ? [applied.receiptAmount != null && `amount ${money(applied.receiptAmount)}`, applied.label && `label "${applied.label}"`, applied.description && 'notes'].filter(Boolean).join(', ') : null

// One AI scan: what the AI answered, then the receipt it was about (read-only until "Edit details").
function ScanView({ scan, ownerId }) {
	const { push } = useToast()
	const { readOnly: snapshotMode } = useSnapshotMode()
	const receiptId = scan.receipt?.receiptId
	const [receipt, setReceipt] = useState(undefined) // undefined = loading, null = none / deleted
	const [editing, setEditing] = useState(false)
	const [resetKey, setResetKey] = useState(0)

	useEffect(() => {
		if (!receiptId || !scan.teamId) { setReceipt(null); return }
		let cancelled = false
		fetchReceipts(scan.teamId)
			.then((list) => { if (!cancelled) setReceipt(list.find((r) => r.googleDriveFileId === receiptId) ?? null) })
			.catch(() => { if (!cancelled) setReceipt(null) })
		return () => { cancelled = true }
	}, [receiptId, scan.teamId])

	const save = async (patch) => {
		setReceipt(toReceipt(await receiptsAPI.updateReceipt(scan.teamId, receiptId, patch)))
		setEditing(false)
		setResetKey((k) => k + 1)
		push('Receipt details saved.', 'success')
	}
	const stopEditing = () => { setEditing(false); setResetKey((k) => k + 1) } // discard what was typed

	const ai = suggested(scan.result)
	const saved = appliedText(scan.applied)
	return (
		<>
			<div className="border-b border-line bg-paper px-5 py-3 text-[12px] leading-5">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<Chip status={scan.status} />
					<span className="font-bold text-ink">{TRIGGER_LABEL[scan.trigger] ?? 'Scan'}</span>
					<span className="text-muted">{when(scan.startedAt)}{scan.durationMs != null ? ` · ${(scan.durationMs / 1000).toFixed(1)}s` : ''}{scan.provider ? ` · ${scan.provider}` : ''}{scan.input ? ` · read as ${scan.input}` : ''}</span>
					{receipt && !snapshotMode && (
						<span className="ml-auto">{editing
							? <button className={button.secondary} type="button" onClick={stopEditing}>Cancel editing</button>
							: <button className={button.secondary} type="button" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Edit details</button>}</span>
					)}
				</div>
				{scan.status === 'Failed' && <p className="mt-1 font-bold text-red">The AI scan failed{scan.error ? `: ${scan.error}` : ''}</p>}
				{ai && <p className="mt-1"><span className="font-bold text-ink">AI answered:</span> {ai}</p>}
				{scan.trigger === 'bulk' && scan.status === 'Succeeded' && <p className="mt-0.5"><span className="font-bold text-ink">Saved by the run:</span> {saved ?? 'nothing (the run did not save this result)'}</p>}
				<p className="mt-0.5 text-[11px] text-muted">The AI can be wrong: check the receipt below. File: {scan.file?.filename} ({scan.file?.mimeType || 'unknown type'}).</p>
			</div>
			{receipt === undefined ? (
				<div className="grid min-h-60 place-items-center"><Icon name="spinner" size={28} /></div>
			) : receipt ? (
				<ReceiptEditor key={`${receipt.id}-${resetKey}`} receipt={receipt} readOnly={!editing} readOnlyLabel="Current details (read-only)" onSave={save} onScan={() => receiptsAPI.scan(scan.teamId, receiptId, { ownerId })} submitLabel="Save changes" actions={<button className={button.secondary} type="button" onClick={stopEditing}>Cancel</button>} />
			) : (
				<div className="grid min-h-48 place-items-center p-8 text-center text-[13px] text-muted">
					{receiptId ? 'This receipt no longer exists, so only the AI result above is kept.' : 'This scan came from the upload form, before the receipt existed. The file itself is not kept.'}
				</div>
			)}
		</>
	)
}

// A bulk run: summary + the receipts it went through. Clicking one opens its ScanView.
function RunView({ run, onPick }) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="border-b border-line bg-paper px-5 py-3 text-[12px] leading-5">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Chip status={run.status} /><span className="font-bold text-ink">{run.teamName || 'Team'}</span><span className="text-muted">{when(run.startedAt)}{run.endedAt ? ` → ${when(run.endedAt)}` : ''}</span></div>
				<p className="mt-1">Filled <strong>{run.filled}</strong> of {run.total} · scanned {run.scanned}{run.notSaved ? ` · ${run.notSaved} not saved` : ''}{run.failed ? ` · ${run.failed} failed` : ''}</p>
				{run.lastError && <p className="mt-0.5 font-bold text-red">Last error: {run.lastError}</p>}
				{run.status === 'Interrupted' && <p className="mt-0.5 text-muted">The page was closed or reloaded during this run. What was saved before that is listed below.</p>}
				<p className="mt-0.5 text-[11px] text-muted">The AI can be wrong: open a receipt to review it.</p>
			</div>
			{run.scans.length === 0 ? <p className="p-8 text-center text-[13px] text-muted">No receipts were scanned in this run.</p> : (
				<ul>
					{run.scans.map((s) => (
						<li key={s.id}><button className="flex w-full flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-left hover:bg-blue-soft focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={() => onPick(s)}>
							<span className="grid min-w-0 flex-1 gap-0.5"><strong className="truncate text-[13px]">{s.receipt?.name ?? s.file?.filename}</strong><small className="truncate text-[11px] text-muted">{s.status === 'Failed' ? s.error : suggested(s.result)}</small></span>
							{s.applied ? <Chip status="Succeeded" /> : <Chip status={s.status} />}
							<small className="w-24 text-right text-[11px] text-muted">{s.applied ? 'Saved by AI' : s.status === 'Succeeded' ? 'Not saved' : ''}</small>
						</button></li>
					))}
				</ul>
			)}
		</div>
	)
}

// item = a row of the history list. Scans open directly; runs load their detail first.
export default function AIHistoryModal({ item, orgId, ownerId, onClose }) {
	const [run, setRun] = useState(null)
	const [picked, setPicked] = useState(null) // a scan opened from inside a run
	const [error, setError] = useState('')

	useEffect(() => {
		if (item.kind !== 'bulk_run') return
		let cancelled = false
		aiHistoryAPI.get(item.id, orgId, ownerId)
			.then((d) => { if (!cancelled) setRun(d) })
			.catch((e) => { if (!cancelled) setError(errorDetail(e, 'Could not load this run.')) })
		return () => { cancelled = true }
	}, [item, orgId, ownerId])

	const scan = item.kind === 'scan' ? item : picked
	const title = scan ? (scan.receipt?.name ?? scan.file?.filename ?? 'AI scan') : `Bulk AI run · ${item.teamName || 'team'}`
	return (
		<div className="fixed inset-0 z-30 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div className="flex max-h-[92vh] w-[min(100%,1100px)] flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="ai-history-title">
				<div className="flex items-start justify-between gap-4 border-b border-line p-5">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">AI history</p><h2 id="ai-history-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{title}</h2></div>
					<div className="flex items-center gap-3">
						{item.kind === 'bulk_run' && picked && <button className="rounded-lg px-2 py-1 text-xs font-bold text-blue" type="button" onClick={() => setPicked(null)}>← Back to run</button>}
						<button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button>
					</div>
				</div>
				{scan ? <ScanView key={scan.id} scan={scan} ownerId={ownerId} />
					: error ? <p className="p-8 text-center text-[13px] font-bold text-red">{error}</p>
					: run ? <RunView run={run} onPick={setPicked} />
					: <div className="grid min-h-60 place-items-center"><Icon name="spinner" size={28} /></div>}
			</div>
		</div>
	)
}
