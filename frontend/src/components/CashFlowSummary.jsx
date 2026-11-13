import { useEffect, useState } from 'react'
import Icon from './Icon'
import { button } from './button'
import { cashInAPI } from '../api/cashin'
import { useToast } from '../context/toast'

const card = 'min-h-37.5 rounded-[14px] border p-5.5 max-[820px]:min-h-auto max-[560px]:p-4'
const th = 'pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted'
const td = 'border-t border-line py-3.25 pr-3 pl-0 text-muted'
const money = (n) => `${n < 0 ? '-' : ''}RM${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const FIRST_PAGE = 5 // the summary shows only the latest few entries
const MORE_PAGE = 20
const EMPTY = { balance: 0, totalCashIn: 0, totalReimbursement: 0, cashInCount: 0, reimbursementCount: 0, history: [], total: 0, hasMore: false }

export default function CashFlowSummary({ orgId, ownerId }) {
	const { push } = useToast()
	const [data, setData] = useState(EMPTY)
	const [loadingMore, setLoadingMore] = useState(false)
	const [typeFilter, setTypeFilter] = useState('all')
	const [search, setSearch] = useState('')
	const [dateOrder, setDateOrder] = useState('desc')

	useEffect(() => {
		cashInAPI.cashflow(orgId, ownerId, FIRST_PAGE, 0)
			.then(setData)
			.catch(() => { setData(EMPTY); push('Could not load the cash flow summary.', 'error') })
	}, [orgId, ownerId, push])

	const loadMore = async () => {
		setLoadingMore(true)
		try {
			const next = await cashInAPI.cashflow(orgId, ownerId, MORE_PAGE, data.history.length)
			// totals come from the newest read; the history is appended
			setData((prev) => ({ ...next, history: [...prev.history, ...next.history] }))
		} catch {
			push('Could not load more history.', 'error')
		} finally {
			setLoadingMore(false)
		}
	}

	const negative = data.balance < 0
	// the server sends the loaded pages newest-first, so reversing the loaded entries gives a correct oldest-first view
	const q = search.trim().toLowerCase()
	const visible = data.history
		.filter((h) => typeFilter === 'all' || h.kind === typeFilter)
		.filter((h) => !q || h.name.toLowerCase().includes(q) || (h.detail ?? '').toLowerCase().includes(q))
		.sort((a, b) => dateOrder === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))
	const filtered = typeFilter !== 'all' || q || dateOrder !== 'desc'

	return (
		<>
			<section className="mb-3.5 grid grid-cols-[1.4fr_1fr_1fr] gap-3.5 max-[820px]:grid-cols-1" aria-label="Cash flow summary">
				<article className={`${card} ${negative ? 'border-red-300 bg-red-50 text-red-900' : 'border-blue bg-blue text-white'}`} role={negative ? 'alert' : undefined}>
					<span className={`mb-2.5 text-[11px] font-bold tracking-widest uppercase ${negative ? 'text-red-700' : 'text-white/72'}`}>Final cash flow</span>
					<strong className={`mb-4 block font-display text-[34px] tracking-tighter ${negative ? 'text-red-600' : ''}`}>{money(data.balance)}</strong>
					<span className={`flex items-center gap-1.25 text-xs ${negative ? 'font-bold text-red-700' : 'text-white/72'}`}>
						<Icon name={negative ? 'insight' : 'check'} size={15} />
						{negative ? `Negative: reimbursements exceed cash in by ${money(-data.balance)}` : 'Total cash in minus total reimbursement'}
					</span>
				</article>
				<article className={`${card} border-line bg-white`}>
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Total cash in</span>
					<strong className="mb-4 block font-display text-[26px] tracking-tighter text-green">{money(data.totalCashIn)}</strong>
					<span className="flex items-center gap-1.25 text-xs text-muted"><Icon name="plus" size={15} /> {data.cashInCount} record{data.cashInCount === 1 ? '' : 's'}</span>
				</article>
				<article className={`${card} border-line bg-white`}>
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Total reimbursement</span>
					<strong className="mb-4 block font-display text-[26px] tracking-tighter text-red-600">{money(data.totalReimbursement)}</strong>
					<span className="flex items-center gap-1.25 text-xs text-muted"><Icon name="receipt" size={15} /> {data.reimbursementCount} record{data.reimbursementCount === 1 ? '' : 's'}</span>
				</article>
			</section>

			<article className="rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
				<div className="mb-5">
					<h2 className="font-display text-[17px] tracking-[-0.03em]">Cash flow history</h2>
					<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Cash in and reimbursements together, newest first</p>
				</div>
				<div className="mb-4 flex flex-wrap items-end gap-3">
					<fieldset className="w-fit max-w-full"><legend className="text-xs font-bold text-ink">Type</legend>
						<div className="mt-1.5 inline-flex gap-1 rounded-lg border border-line bg-white p-1">
							{[['all', 'All'], ['Cash in', 'Cash in'], ['Reimbursement', 'Reimbursement']].map(([value, label]) => (
								<button key={value} type="button" aria-pressed={typeFilter === value} className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${typeFilter === value ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} onClick={() => setTypeFilter(value)}>{label}</button>
							))}
						</div>
					</fieldset>
					<label className="grid gap-1.5 text-xs font-bold text-ink">Search
						<input className="h-9 w-56 rounded-lg border border-line bg-white px-3 text-[12px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" type="search" placeholder="Search by name or team" value={search} onChange={(event) => setSearch(event.target.value)} />
					</label>
					<label className="grid gap-1.5 text-xs font-bold text-ink">Sort by time
						<select className="h-9 rounded-lg border border-line bg-white px-2 text-[12px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={dateOrder} onChange={(event) => setDateOrder(event.target.value)}>
							<option value="desc">Newest first</option>
							<option value="asc">Oldest first</option>
						</select>
					</label>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-xs whitespace-nowrap">
						<thead>
							<tr><th className={th}>Date</th><th className={th}>Type</th><th className={th}>Name</th><th className={th}>Source / Team</th><th className={th}>Amount</th></tr>
						</thead>
						<tbody>
							{visible.length ? visible.map((h) => {
								const cashIn = h.kind === 'Cash in'
								return (
									<tr key={`${h.kind}-${h.id}`}>
										<td className={td}>{h.date}</td>
										<td className={td}>
											<span className={`inline-flex rounded-[20px] px-2 py-1.25 text-[10px] font-bold ${cashIn ? 'bg-green-soft text-green' : 'bg-brown-soft text-brown'}`}>{h.kind}</span>
										</td>
										<td className={`${td} font-semibold text-ink`}>{h.name}</td>
										<td className={td}>{h.detail}</td>
										<td className={`${td} font-semibold ${cashIn ? 'text-green' : 'text-red-600'}`}>{cashIn ? '+' : '-'}{money(h.amount)}</td>
									</tr>
								)
							}) : (
								<tr>
									<td className="border-t border-line p-0" colSpan="5">
										<div className="grid min-h-40 place-items-center p-8 text-center">
											<div>
												<span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="sync" size={20} /></span>
												<h3 className="mt-4 font-display text-[16px]">{data.history.length ? 'No matching entries' : 'No cash flow yet'}</h3>
												<p className="mt-1 text-xs text-muted">{data.history.length ? 'Try another filter or search.' : 'Add cash in or a reimbursement record to see it here.'}</p>
											</div>
										</div>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				{data.hasMore && (
					<div className="mt-4 flex items-center justify-between gap-3">
						<span className="text-xs text-muted">Showing {filtered ? visible.length : data.history.length} of {data.total}</span>
						<button className={button.secondary} type="button" disabled={loadingMore} onClick={loadMore}>
							{loadingMore ? 'Loading…' : 'Load more'}
						</button>
					</div>
				)}
			</article>
		</>
	)
}
