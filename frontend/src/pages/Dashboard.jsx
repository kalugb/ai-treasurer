import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { dashboardAPI } from '../api/dashboard'
import { OrganizationContext, OrganizationRequiredEmptyState } from '../components/OrganizationContext'

export default function Dashboard({ goTo, organization, onGoToOrganization }) {
	const [dashboard, setDashboard] = useState(null)

	useEffect(() => {
		dashboardAPI.getDashboard().then(setDashboard)
	}, [])

	const handleTestAxios = async () => {
		try {
			const res = await dashboardAPI.testAxios()
			console.log('Axios test response:', res)

			const testData = {
				title: "title",
				description: "description",
				amount: 100,
				date: "2025-03-19",
			}

			const res2 = await dashboardAPI.testPost(testData)
			console.log('POST request response:', res2)

		} catch (error) {
			console.error('Error occurred while testing axios:', error)
		}
	}

	if (!dashboard) return <p className="text-sm text-muted">Loading overview…</p>
	const receipts = dashboard.recent_receipts
	if (!organization) return <>
		<header className="mb-9"><p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Financew / Overview</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Financial overview</h1><p className="mt-3 text-[13px] leading-[1.55] text-muted">Your financial snapshot appears after you choose an organization.</p></header>
		<OrganizationRequiredEmptyState onGoToOrganization={onGoToOrganization} />
	</>

	return (
		<>
			<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div>
					<p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Tuesday, March 19, 2025</p>
					<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Good morning, Alex.</h1>
					<p className="subtle mt-3 text-[13px] leading-[1.55] text-muted">Here’s your financial snapshot for this month.</p>
				</div>
				<button className={button.primary} onClick={() => goTo('agent')}>
					<Icon name="spark" size={16} />
					Ask AI Agent
				</button>
			</header>
			<OrganizationContext organization={organization} onGoToOrganization={onGoToOrganization} />

			<section className="mb-3.5 grid grid-cols-3 gap-3.5 max-[820px]:grid-cols-1" aria-label="Financial summary">
				<article className="min-h-37.5 rounded-[14px] border border-blue bg-blue p-5.5 text-white max-[820px]:min-h-auto max-[560px]:p-4">
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-white/72">Total spending</span>
					<strong className="mb-4 block font-display text-[30px] tracking-tighter">${dashboard.total_spending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
					<span className="flex items-center gap-1.25 text-xs text-white/72"><Icon name="trend" size={15} /> {Math.abs(dashboard.spending_change)}% less than last month</span>
				</article>
				<article className="min-h-37.5 rounded-[14px] border border-line bg-white p-5.5 max-[820px]:min-h-auto max-[560px]:p-4">
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Receipts captured</span>
					<strong className="mb-4 block font-display text-[30px] tracking-tighter">{dashboard.receipts_captured}</strong>
					<span className="flex items-center gap-1.25 text-xs text-muted">{dashboard.receipts_needing_review} need your review</span>
				</article>
				<article className="min-h-37.5 rounded-[14px] border border-line bg-white p-5.5 max-[820px]:min-h-auto max-[560px]:p-4">
					<span className="mb-2.5 text-[11px] font-bold tracking-W[0.1em] uppercase text-muted">Monthly budget</span>
					<strong className="mb-4 block font-display text-[30px] tracking-tighter">${dashboard.monthly_budget.toLocaleString()}</strong>
					<span className="flex items-center gap-1.25 text-xs text-muted">{dashboard.monthly_budget_used_percent}% used</span>
					<div className="mt-4.5 h-1.25 overflow-hidden rounded-[10px] bg-line"><span className="block h-full rounded-[10px] bg-brown" style={{ width: `${dashboard.monthly_budget_used_percent}%` }} /></div>
				</article>
			</section>

			<section className="grid grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)] gap-3.5 max-[820px]:grid-cols-1">
				<article className="rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
					<div className="mb-5 flex items-start justify-between gap-4.5">
						<div><h2 className="font-display text-[17px] tracking-[-0.03em]">Recent receipts</h2><p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Your latest uploaded records</p></div>
						<button className={`${button.secondary} max-[560px]:px-2.5 max-[560px]:text-[0px]`} onClick={() => goTo('receipts')}><Icon name="plus" size={16} /> Add receipt</button>
					</div>
					<div className="overflow-x-auto max-[560px]:-mx-1.25">
						<table className="w-full border-collapse text-xs whitespace-nowrap">
							<thead><tr><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Date</th><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Merchant</th><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Category</th><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Amount</th><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Status</th></tr></thead>
							<tbody>
								{receipts.length ? receipts.map((receipt) => (
									<tr key={receipt.id}>
										<td className="border-t border-line py-3.25 pr-3 pl-0 text-muted">{receipt.date}</td>
										<td className="border-t border-line py-3.25 pr-3 pl-0 text-muted"><span className="flex items-center gap-2 font-semibold text-ink"><span className="grid size-6.25 place-items-center rounded-[7px] bg-brown-soft text-[11px] text-brown">{receipt.merchant[0]}</span>{receipt.merchant}</span></td>
										<td className="border-t border-line py-3.25 pr-3 pl-0 text-muted">{receipt.category}</td>
										<td className="border-t border-line py-3.25 pr-3 pl-0 text-right font-semibold text-ink">${receipt.amount.toFixed(2)}</td>
										<td className="border-t border-line py-3.25 pr-3 pl-0 text-muted"><span className="inline-flex rounded-[20px] bg-green-soft px-2 py-1.25 text-[10px] font-bold text-green">Reviewed</span></td>
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

				<article className="rounded-[14px] border border-transparent bg-brown-soft p-5.5 max-[560px]:p-4">
					<div className="mb-5 flex items-start justify-between gap-4.5">
						<div><h2 className="font-display text-[17px] tracking-[-0.03em]">AI insight</h2><p className="mt-1.5 text-[13px] leading-[1.55] text-muted">A quick read on your spending</p></div>
						<span className="grid size-7.5 place-items-center rounded-[9px] bg-brown text-white"><Icon name="spark" size={14} /></span>
					</div>
					<div className="my-5 font-display text-[17px] font-semibold leading-[1.45] text-brown-dark">“Your software subscriptions are up 14% this month. I found two recurring charges you may want to review.”</div>
					<div className="mb-5.5 flex gap-2.5 border-t border-[rgba(119,82,52,0.16)] pt-4"><span className="mt-1.25 size-2 shrink-0 rounded-full bg-brown" /><div><strong className="text-xs">Potential saving</strong><p className="mt-1 text-[13px] leading-[1.55] text-muted">Canceling unused plans could save <b className="text-brown-dark">$38 / month</b>.</p></div></div>
				</article>
			</section>

			<div className="mt-8 flex justify-center">
				<button className={button.secondary} type="button" onClick={() => goTo('not-found')}>
					Test 404 page
				</button>
				<button className={`${button.secondary} ml-5`} type="button" onClick={handleTestAxios}>
					Test axios
				</button>
			</div>
		</>
	)
}
