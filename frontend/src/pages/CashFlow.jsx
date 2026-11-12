import { useState } from 'react'
import CashFlowSummary from '../components/CashFlowSummary'
import CashInSection from '../components/CashInSection'
import Reimbursement from './Reimbursement'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'

const TABS = [
	{ id: 'flow', label: 'Cash flow' },
	{ id: 'in', label: 'Cash in' },
	{ id: 'out', label: 'Reimbursement' },
]

export default function CashFlow({ goTo }) {
	const organization = useSelectedOrganization()
	const [tab, setTab] = useState('flow')
	const orgId = organization?.id
	const ownerId = organization?.ownerId

	return (
		<>
			<header className="mb-6 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div>
					<p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Finance / Cash flow</p>
					<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Cash flow</h1>
					<p className="mt-3 text-[13px] leading-[1.55] text-muted">
						{organization ? `Cash in and reimbursements for ${organization.orgName ?? organization.name}.` : 'Cash flow appears after you choose an organization.'}
					</p>
				</div>
			</header>

			{!organization ? <OrganizationRequiredEmptyState onGoToOrganization={() => goTo('organization')} /> : (
				<>
					<div className="mb-5 inline-flex rounded-lg border border-line bg-white p-1" role="tablist" aria-label="Cash flow sections">
						{TABS.map((t) => (
							<button
								key={t.id}
								type="button"
								role="tab"
								aria-selected={tab === t.id}
								className={`rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-[3px] focus-visible:outline-blue-ring ${tab === t.id ? 'bg-blue text-white' : 'text-muted hover:text-ink'}`}
								onClick={() => setTab(t.id)}
							>
								{t.label}
							</button>
						))}
					</div>
					{/* the active section is mounted alone, so it always loads fresh data (e.g. the summary after an edit) */}
					{tab === 'flow' && <CashFlowSummary orgId={orgId} ownerId={ownerId} />}
					{tab === 'in' && <CashInSection orgId={orgId} ownerId={ownerId} />}
					{tab === 'out' && <Reimbursement organization={organization} />}
				</>
			)}
		</>
	)
}
