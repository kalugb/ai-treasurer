import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { dashboardAPI } from '../api/dashboard'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'
import { useSnapshotMode } from '../context/snapshotMode'
import { useToast } from '../context/toast'

const card = 'min-h-37.5 rounded-[14px] border p-5.5 max-[820px]:min-h-auto max-[560px]:p-4'
const panel = 'rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4'
const eyebrow = 'mb-2.5 block text-[11px] font-bold tracking-widest uppercase'
const th = 'pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted'
const td = 'border-t border-line py-3.25 pr-3 pl-0 text-muted'
const money = (n) => `${n < 0 ? '-' : ''}RM${Math.abs(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const percent = (spent, budget) => (budget ? Math.round((spent / budget) * 100) : 0)
const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
// last overview per org, kept for this tab only (memory, not storage): shown at once on return, then refreshed
const lastOverview = new Map()

function PanelHead({ title, subtitle, action }) {
	return (
		<div className="mb-5 flex items-start justify-between gap-4.5">
			<div><h2 className="font-display text-[17px] tracking-[-0.03em]">{title}</h2><p className="mt-1.5 text-[13px] leading-[1.55] text-muted">{subtitle}</p></div>
			{action}
		</div>
	)
}

function Badge({ receipt }) {
	const [text, style] = receipt.duplicate === 'confirmed' ? ['Duplicate (excluded)', 'bg-line text-muted']
		: receipt.duplicate === 'pending' ? ['Duplicate?', 'bg-amber-100 text-amber-800']
		: receipt.reimbursed ? ['Reimbursed', 'bg-green-soft text-green']
		: ['Not reimbursed', 'bg-brown-soft text-brown']
	return <span className={`inline-flex rounded-[20px] px-2 py-1.25 text-[10px] font-bold ${style}`}>{text}</span>
}

export default function Dashboard({ goTo }) {
	const organization = useSelectedOrganization()
	const { readOnly } = useSnapshotMode()
	const { push } = useToast()
	const [loaded, setLoaded] = useState({ orgId: null, value: null }) // the response fetched while this page was open
	const [failed, setFailed] = useState(false)
	const orgId = organization?.id
	const ownerId = organization?.ownerId
	const fresh = loaded.orgId === orgId
	const data = fresh ? loaded.value : lastOverview.get(orgId) ?? null

	useEffect(() => {
		// the overview is live data only; snapshot mode shows a note instead
		if (!orgId || readOnly) return
		let cancelled = false
		dashboardAPI.getOverview(orgId, ownerId)
			.then((res) => { lastOverview.set(orgId, res); if (!cancelled) { setLoaded({ orgId, value: res }); setFailed(false) } })
			.catch(() => { if (!cancelled) { setFailed(true); push('Could not load the overview.', 'error') } })
		return () => { cancelled = true }
	}, [orgId, ownerId, readOnly, push])

	const orgName = organization?.orgName ?? organization?.name
	const status = !data || fresh ? null : failed ? 'Showing the last loaded figures (refresh failed).' : 'Updating…'
	const header = (
		<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
			<div>
				<p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">{today}</p>
				<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">{orgName ? `${orgName} overview` : 'Financial overview'}</h1>
				<p className="mt-3 text-[13px] leading-[1.55] text-muted">{orgName ? 'Budgets, cash and what needs your attention.' : 'Your financial snapshot appears after you choose an organization.'}{status && <span className="ml-2 text-xs" role="status">{status}</span>}</p>
			</div>
			{orgName && <button className={button.primary} onClick={() => goTo('agent')}><Icon name="spark" size={16} /> Ask AI Agent</button>}
		</header>
	)

	if (!organization) return <>{header}<OrganizationRequiredEmptyState /></>
	if (readOnly) return <>{header}<div className={`${panel} grid min-h-40 place-items-center text-center text-[13px] text-muted`}>Overview shows live data. Exit the snapshot to see it.</div></>
	if (failed && !data) return <>{header}<p className="text-sm text-muted">Could not load the overview.</p></>
	if (!data) return <>{header}<p className="text-sm text-muted">Loading overview…</p></>

	const { totals, teams, attention, cash, recentReceipts, notes } = data
	const over = totals.remaining < 0
	const negative = cash.balance < 0
	const attentionRows = [
		['Receipts with no amount', attention.missingAmount, 'folders'],
		['Duplicates to review', attention.duplicateReview, 'folders'],
		['Receipts not reimbursed', attention.notReimbursed, 'reimbursement'],
	]

	return (
		<>
			{header}

			<section className="mb-3.5 grid grid-cols-3 gap-3.5 max-[820px]:grid-cols-1" aria-label="Financial summary">
				<article className={`${card} ${over ? 'border-red-300 bg-red-50 text-red-900' : 'border-blue bg-blue text-white'}`} role={over ? 'alert' : undefined}>
					<span className={`${eyebrow} ${over ? 'text-red-700' : 'text-white/72'}`}>Total spent</span>
					<strong className={`mb-3 block font-display text-[30px] tracking-tighter ${over ? 'text-red-600' : ''}`}>{money(totals.spent)}</strong>
					<span className={`block text-xs ${over ? 'font-bold text-red-700' : 'text-white/72'}`}>
						{over ? `Over budget by ${money(-totals.remaining)}` : `${money(totals.remaining)} left of ${money(totals.budget)}`}
					</span>
					<div className={`mt-4 h-1.25 overflow-hidden rounded-[10px] ${over ? 'bg-red-200' : 'bg-white/25'}`}><span className={`block h-full rounded-[10px] ${over ? 'bg-red-600' : 'bg-white'}`} style={{ width: `${Math.min(100, percent(totals.spent, totals.budget))}%` }} /></div>
				</article>
				<article className={`${card} ${negative ? 'border-red-300 bg-red-50' : 'border-line bg-white'}`} role={negative ? 'alert' : undefined}>
					<span className={`${eyebrow} ${negative ? 'text-red-700' : 'text-muted'}`}>Cash balance</span>
					<strong className={`mb-3 block font-display text-[30px] tracking-tighter ${negative ? 'text-red-600' : 'text-ink'}`}>{money(cash.balance)}</strong>
					<span className="block text-xs text-muted">Cash in <b className="text-green">{money(cash.totalCashIn)}</b> · Reimbursed <b className="text-red-600">{money(cash.totalReimbursement)}</b></span>
				</article>
				<article className={`${card} border-line bg-white`}>
					<span className={`${eyebrow} text-muted`}>Needs attention</span>
					<ul className="grid gap-1.5">
						{attentionRows.map(([label, count, page]) => (
							<li key={label}>
								<button type="button" className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-left text-xs text-muted hover:text-blue" onClick={() => goTo(page)}>
									<span>{label}</span>
									<b className={`font-display text-[17px] ${count ? 'text-ink' : 'text-muted'}`}>{count}</b>
								</button>
							</li>
						))}
					</ul>
				</article>
			</section>

			<section className="mb-3.5 grid grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)] gap-3.5 max-[820px]:grid-cols-1">
				<article className={panel}>
					<PanelHead title="Team budgets" subtitle="Spent against each team's budget, most used first" action={<button className={button.secondary} type="button" onClick={() => goTo('teams')}>Manage teams</button>} />
					{teams.length ? (
						<ul className="grid gap-4">
							{teams.map((t) => {
								const teamOver = t.remaining < 0
								return (
									<li key={t.id}>
										<div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
											<strong className="text-ink">{t.name}</strong>
											<span className="text-muted">{money(t.spent)} / {money(t.budget)} · <b className={teamOver ? 'text-red-600' : 'text-ink'}>{teamOver ? `Over by ${money(-t.remaining)}` : `${money(t.remaining)} left`}</b></span>
										</div>
										<div className="h-1.5 overflow-hidden rounded-[10px] bg-line"><span className={`block h-full rounded-[10px] ${teamOver ? 'bg-red-600' : 'bg-brown'}`} style={{ width: `${Math.min(100, percent(t.spent, t.budget))}%` }} /></div>
									</li>
								)
							})}
						</ul>
					) : <p className="text-[13px] text-muted">No teams yet.</p>}
				</article>

				<article className="rounded-[14px] border border-transparent bg-brown-soft p-5.5 max-[560px]:p-4">
					<div className="mb-5 flex items-start justify-between gap-4.5">
						<div><h2 className="font-display text-[17px] tracking-[-0.03em]">Notes</h2><p className="mt-1.5 text-[13px] leading-[1.55] text-muted">What stands out right now</p></div>
						<span className="grid size-7.5 place-items-center rounded-[9px] bg-brown text-white"><Icon name="spark" size={14} /></span>
					</div>
					<ul className="grid gap-3">
						{notes.map((note) => (
							<li key={note} className="flex gap-2.5 border-t border-[rgba(119,82,52,0.16)] pt-3 first:border-t-0 first:pt-0"><span className="mt-1.25 size-2 shrink-0 rounded-full bg-brown" /><p className="text-[13px] leading-[1.55] text-brown-dark">{note}</p></li>
						))}
					</ul>
				</article>
			</section>

			<section className="grid grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)] gap-3.5 max-[820px]:grid-cols-1">
				<article className={panel}>
					<PanelHead title="Recent receipts" subtitle={`Latest across all teams · ${totals.receiptCount} in total`} action={<button className={button.secondary} type="button" onClick={() => goTo('folders')}>View receipts</button>} />
					<div className="overflow-x-auto max-[560px]:-mx-1.25">
						<table className="w-full border-collapse text-xs whitespace-nowrap">
							<thead><tr><th className={th}>Date</th><th className={th}>Receipt</th><th className={th}>Team</th><th className={th}>Amount</th><th className={th}>Status</th></tr></thead>
							<tbody>
								{recentReceipts.length ? recentReceipts.map((r) => (
									<tr key={r.id}>
										<td className={td}>{r.date ?? '—'}</td>
										<td className={`${td} max-w-56 truncate font-semibold text-ink`} title={r.name}>{r.label || r.name}</td>
										<td className={td}>{r.teamName}</td>
										<td className={`${td} font-semibold ${r.unset ? 'text-muted' : 'text-ink'}`}>{r.unset ? 'Amount not set' : money(r.amount)}</td>
										<td className={td}><Badge receipt={r} /></td>
									</tr>
								)) : (
									<tr>
										<td className="border-t border-line p-0" colSpan="5">
											<div className="grid min-h-48 place-items-center p-8 text-center">
												<div>
													<span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="receipt" size={20} /></span>
													<h3 className="mt-4 font-display text-[16px]">No receipts yet</h3>
													<p className="mt-1 text-xs text-muted">Add your first receipt to start tracking your spending.</p>
												</div>
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</article>

				<article className={panel}>
					<PanelHead title="Recent cash flow" subtitle="Latest cash in and reimbursements" action={<button className={button.secondary} type="button" onClick={() => goTo('reimbursement')}>View all</button>} />
					{cash.history.length ? (
						<ul className="grid">
							{cash.history.map((h) => {
								const cashIn = h.kind === 'Cash in'
								return (
									<li key={`${h.kind}-${h.id}`} className="flex items-center justify-between gap-3 border-t border-line py-3 text-xs first:border-t-0 first:pt-0">
										<span className="grid min-w-0 gap-1"><strong className="truncate text-ink">{h.name}</strong><small className="text-muted">{h.date ?? '—'} · {h.kind}{h.detail ? ` · ${h.detail}` : ''}</small></span>
										<b className={cashIn ? 'text-green' : 'text-red-600'}>{cashIn ? '+' : '-'}{money(h.amount)}</b>
									</li>
								)
							})}
						</ul>
					) : <p className="text-[13px] text-muted">No cash flow yet.</p>}
				</article>
			</section>
		</>
	)
}
