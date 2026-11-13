import { useEffect, useState } from 'react'
import Icon from './Icon'
import ZoomableImage from './ZoomableImage'
import { button } from './button'
import { API_BASE_URL } from '../api/client'

const SOURCE = { google_drive: 'Google Drive', local_upload: 'Local upload' }
const money = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const reimbursementText = (link) => !link ? 'Not in any reimbursement record' : link.status === 'Reimbursed' ? `Reimbursed · “${link.name}”` : `Pending in “${link.name}”`

function Details({ rows }) {
	return (
		<dl className="grid gap-2.5 text-[13px]">
			{rows.map(([term, value]) => (
				<div key={term} className="grid grid-cols-[96px_1fr] gap-2">
					<dt className="text-xs text-muted">{term}</dt>
					<dd className="min-w-0 font-bold break-words text-ink">{value || <span className="font-normal text-muted">—</span>}</dd>
				</div>
			))}
		</dl>
	)
}

// Both receipts next to each other: image (zoom/pan) + every detail, so a treasurer can judge a duplicate at a glance.
function CompareModal({ receipt, teamName, dup, onClose, children }) {
	const { of } = dup
	useEffect(() => {
		const onKey = (event) => { if (event.key === 'Escape') onClose() }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	const originalImage = `${API_BASE_URL}/api/google-drive/teams/${of.teamId}/receipts/${encodeURIComponent(of.receiptId)}/thumbnail`
	const thisRows = [
		['Name', receipt.filename], ['Label', receipt.label],
		['Amount', receipt.source === 'google' && !receipt.amount ? 'Amount not set' : money(receipt.amount)],
		['Date', receipt.date === '—' ? null : receipt.date], ['Source', receipt.category], ['Team', teamName],
		['Notes', receipt.description], ['Reimbursement', reimbursementText(receipt.reimbursement)],
	]
	const originalRows = [
		['Name', of.name], ['Label', of.label],
		['Amount', of.source === 'google_drive' && !of.amount ? 'Amount not set' : money(of.amount)],
		['Date', of.date], ['Source', SOURCE[of.source] ?? of.source], ['Team', of.teamName],
		['Notes', of.description], ['Reimbursement', reimbursementText(of.reimbursement)],
	]
	const columns = [
		{ key: 'copy', title: 'This receipt (newer copy)', image: receipt.thumbnail, rows: thisRows },
		{ key: 'original', title: 'Original (older)', image: originalImage, rows: originalRows },
	]

	return (
		<div className="fixed inset-0 z-30 grid place-items-center bg-[rgb(28_35_36/45%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div className="flex max-h-[94vh] w-[min(100%,1180px)] flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="compare-title">
				<div className="flex items-start justify-between gap-4 border-b border-line p-5">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">Possible duplicate</p><h2 id="compare-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">Compare the two receipts</h2><p className="mt-1.5 text-xs text-muted">Both files are byte-for-byte identical. The older one is treated as the original.</p></div>
					<button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 min-[820px]:grid-cols-2">
					{columns.map((col) => (
						<section key={col.key} className="min-w-0" aria-label={col.title}>
							<h3 className="mb-2.5 text-[11px] font-bold tracking-widest text-muted uppercase">{col.title}</h3>
							<ZoomableImage key={col.image} src={col.image} alt={col.title} className="mb-4 h-72 rounded-lg border border-line bg-paper text-blue" fallback={<Icon name="receipt" size={40} />} />
							<Details rows={col.rows} />
						</section>
					))}
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2 border-t border-line p-4">{children}</div>
			</div>
		</div>
	)
}

// Banner for a receipt that is a later copy of another receipt in the organization (receipt.duplicate).
// onReview(status) must throw on failure; status is 'dismissed' | 'confirmed' | 'clear'.
// Shown above the edit form in the receipt preview. In snapshot mode it is read-only (no compare: live reads are blocked).
export default function DuplicateReview({ receipt, teamName, readOnly, onReview }) {
	const [busy, setBusy] = useState(null)
	const [error, setError] = useState(null)
	const [comparing, setComparing] = useState(false)
	const dup = receipt.duplicate
	if (!dup) return null

	const { of } = dup
	const where = [of.teamName, SOURCE[of.source]].filter(Boolean).join(', ')
	const tone = dup.status === 'pending' ? 'bg-brown-soft text-brown' : dup.status === 'confirmed' ? 'bg-red-50 text-red-700' : 'bg-paper text-muted'
	const text = {
		pending: `Possible duplicate of “${of.name}”${where ? ` (${where})` : ''}. Review it: until you decide, it still counts in totals.`,
		confirmed: `Confirmed duplicate of “${of.name}”${where ? ` (${where})` : ''}. It is left out of totals and can't be reimbursed.`,
		dismissed: `Reviewed: not a duplicate of “${of.name}”.`,
	}[dup.status]

	const decide = async (status) => {
		setBusy(status)
		setError(null)
		try {
			await onReview(status)
		} catch (e) {
			const detail = e?.response?.data?.detail
			setError(typeof detail === 'string' ? detail : 'Could not save your decision. Try again.')
		} finally {
			setBusy(null)
		}
	}

	const decisions = dup.status === 'pending' ? (
		<>
			<button className={`${button.secondary} disabled:opacity-60`} type="button" onClick={() => decide('dismissed')} disabled={busy !== null}>{busy === 'dismissed' ? 'Saving…' : 'Not a duplicate'}</button>
			<button className={`${button.danger} disabled:opacity-60`} type="button" onClick={() => decide('confirmed')} disabled={busy !== null}>{busy === 'confirmed' ? 'Saving…' : 'Confirm duplicate'}</button>
		</>
	) : (
		<button className={`${button.secondary} disabled:opacity-60`} type="button" onClick={() => decide('clear')} disabled={busy !== null}>{busy === 'clear' ? 'Saving…' : 'Undo decision'}</button>
	)

	return (
		<div className={`mt-3 rounded-lg px-3 py-2.5 text-xs ${tone}`} role="status">
			<p className="flex items-start gap-2 font-bold"><span className="mt-0.5 shrink-0"><Icon name="insight" size={14} /></span>{text}</p>
			{!readOnly && (
				<div className="mt-2.5 grid gap-2">
					<div><button className={button.primary} type="button" onClick={() => setComparing(true)}>Compare side by side</button></div>
					<div className="flex flex-wrap items-center gap-2">{decisions}</div>
				</div>
			)}
			{error && <p className="mt-2 font-bold text-red-700">{error}</p>}
			{comparing && !readOnly && <CompareModal receipt={receipt} teamName={teamName} dup={dup} onClose={() => setComparing(false)}>{error && <span className="mr-auto text-xs font-bold text-red-700">{error}</span>}{decisions}</CompareModal>}
		</div>
	)
}
