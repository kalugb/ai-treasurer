import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import AIHistoryModal, { Chip } from '../components/AIHistoryModal'
import { button } from '../components/button'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { aiHistoryAPI, TRIGGER_LABEL } from '../api/aiHistory'
import { errorDetail } from '../api/snapshots'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'
import { useToast } from '../context/toast'

const money = (n) => `RM${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const FILTERS = [['all', 'All'], ['scan', 'Scans'], ['bulk_run', 'Bulk runs']]
const pill = (active) => `min-h-8 rounded-md px-2.5 text-xs font-bold transition ${active ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`

const rowTitle = (item) => item.kind === 'bulk_run' ? `Bulk AI run · ${item.teamName || 'team'}` : (item.receipt?.name ?? item.file?.filename ?? 'AI scan')
const rowDetail = (item) => item.kind === 'bulk_run'
	? `Filled ${item.filled} of ${item.total}${item.failed ? ` · ${item.failed} failed` : ''}`
	: item.status === 'Failed' ? (item.error || 'Failed') : (item.result?.receiptAmount != null ? `AI read ${money(item.result.receiptAmount)}` : 'Nothing found')

export default function AIHistory({ goTo }) {
	const organization = useSelectedOrganization()
	const { push } = useToast()
	const orgId = organization?.id
	const ownerId = organization?.ownerId
	const [kind, setKind] = useState('all')
	const key = `${orgId}|${kind}`
	const [loaded, setLoaded] = useState({ key: null, items: [], hasMore: false }) // keyed so another org / filter never shows stale rows
	const items = loaded.key === key ? loaded.items : []
	const loading = !!orgId && loaded.key !== key
	const [loadingMore, setLoadingMore] = useState(false)
	const [open, setOpen] = useState(null)

	const load = useCallback(() => {
		if (!orgId) return
		aiHistoryAPI.list(orgId, ownerId, { kind })
			.then((res) => setLoaded({ key, items: res.items, hasMore: res.hasMore }))
			.catch((e) => { setLoaded({ key, items: [], hasMore: false }); push(errorDetail(e, 'Could not load the AI history.'), 'error') })
	}, [orgId, ownerId, kind, key, push])

	useEffect(() => { load() }, [load])

	const more = async () => {
		setLoadingMore(true)
		try {
			const res = await aiHistoryAPI.list(orgId, ownerId, { kind, offset: items.length })
			setLoaded((l) => ({ key, items: [...l.items, ...res.items], hasMore: res.hasMore }))
		} catch (e) {
			push(errorDetail(e, 'Could not load more.'), 'error')
		} finally {
			setLoadingMore(false)
		}
	}

	return (
		<>
			<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div>
					<p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">AI / History</p>
					<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">AI Scan Usage History.</h1>
					<p className="mt-3 text-[13px] leading-[1.55] text-muted">Every receipt scan and "fill all with AI" run. Entries are kept for 14 days. Open one to see the receipt and what the AI answered.</p>
				</div>
				{orgId && <button className={button.secondary} type="button" onClick={load}><Icon name="sync" size={15} /> Refresh</button>}
			</header>

			{!orgId ? <OrganizationRequiredEmptyState onGoToOrganization={() => goTo('organization')} /> : (
				<section className="min-h-90 rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
					<div className="mb-4 inline-flex gap-1 rounded-lg border border-line bg-white p-1" role="group" aria-label="Filter">
						{FILTERS.map(([value, label]) => <button key={value} className={pill(kind === value)} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}
					</div>
					{loading ? <p className="py-10 text-center text-[13px] text-muted">Loading…</p> : items.length === 0 ? (
						<div className="grid justify-items-center px-6 pt-10 pb-8 text-center">
							<span className="mb-4 grid size-12 place-items-center rounded-[14px] bg-blue-soft text-blue"><Icon name="insight" size={22} /></span>
							<h3 className="font-display text-[17px]">No AI scan usage yet</h3>
							<p className="mt-2 max-w-90 text-[13px] leading-normal text-muted">Scans from the upload form, "Scan with AI" on a receipt and AI fill runs will appear here.</p>
						</div>
					) : (
						<div className="grid">
							{items.map((item) => (
								<button key={item.id} className="flex flex-wrap items-center gap-3 border-t border-line py-4 text-left hover:bg-blue-soft/40 focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={() => setOpen(item)}>
									<span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name={item.kind === 'bulk_run' ? 'sync' : 'receipt'} size={16} /></span>
									<span className="grid min-w-0 flex-1 gap-1">
										<strong className="truncate">{rowTitle(item)}</strong>
										<small className="text-xs text-muted">{when(item.startedAt)} · {item.kind === 'bulk_run' ? 'Fill all with AI' : TRIGGER_LABEL[item.trigger]}{item.kind === 'scan' && item.teamName ? ` · ${item.teamName}` : ''}</small>
										<small className="truncate text-[11px] text-muted">{rowDetail(item)}</small>
									</span>
									<Chip status={item.status} />
								</button>
							))}
							{loaded.hasMore && <div className="border-t border-line pt-4 text-center"><button className={button.secondary} type="button" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
						</div>
					)}
				</section>
			)}
			{open && <AIHistoryModal key={open.id} item={open} orgId={orgId} ownerId={ownerId} onClose={() => setOpen(null)} />}
		</>
	)
}
