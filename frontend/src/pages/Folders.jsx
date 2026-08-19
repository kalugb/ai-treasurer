import { useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'

const formatMoney = (amount) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ReceiptPreview({ receipt, onClose }) {
  if (!receipt) return null
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36_/_38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-[min(100%,500px)] rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36_/_18%)]" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-bold tracking-[0.1em] text-muted uppercase">Receipt preview</p><h2 id="receipt-preview-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{receipt.merchant}</h2></div>
          <button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="grid min-h-[190px] place-items-center rounded-xl border border-line bg-paper text-blue"><Icon name="receipt" size={48} /></div>
        <div className="mt-5 grid grid-cols-2 gap-4 text-[13px]"><div><span className="block text-xs text-muted">Filename</span><strong className="mt-1 block truncate">{receipt.filename}</strong></div><div><span className="block text-xs text-muted">Amount</span><strong className="mt-1 block">{formatMoney(receipt.amount)}</strong></div><div><span className="block text-xs text-muted">Date</span><strong className="mt-1 block">{receipt.date}</strong></div><div><span className="block text-xs text-muted">Category</span><strong className="mt-1 block">{receipt.category}</strong></div></div>
      </div>
    </div>
  )
}

export default function Folders({ teams = [] }) {
  const [teamIndex, setTeamIndex] = useState(0)
  const [preview, setPreview] = useState(null)
  const selectedIndex = teams.length ? Math.min(teamIndex, teams.length - 1) : 0
  const team = teams[selectedIndex]
  const remaining = team ? Math.max(0, team.budget - team.used) : 0
  const remainingPercent = team?.budget ? (remaining / team.budget) * 100 : 0
  const alert = team && remainingPercent < 10

  return (
    <>
      <header className="mb-12 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div><p className="mb-2.5 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">Finance / Receipts management</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">Receipts management</h1><p className="mt-3 text-[13px] leading-6 text-muted">Browse receipts by team in one shared workspace.</p></div>
        <label className="grid min-w-[190px] gap-2 text-xs font-bold text-ink">Team<select className="h-10 rounded-lg border border-line bg-white px-3 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={selectedIndex} onChange={(event) => setTeamIndex(Number(event.target.value))}>{teams.map((item, index) => <option key={item.id} value={index}>{item.name}</option>)}</select></label>
      </header>
      {team ? (
        <>
          <section className={alert ? 'mb-6 rounded-[14px] border border-red-200 bg-red-50 p-5 text-red-900' : 'mb-6 rounded-[14px] border border-line bg-white p-5'}>
            <div className="flex items-end justify-between gap-5 max-[560px]:flex-col max-[560px]:items-start"><div><p className="text-[11px] font-bold tracking-[0.1em] uppercase opacity-70">{team.name} · budget summary</p><p className="mt-2 font-display text-[24px] tracking-[-0.04em]">{formatMoney(team.used)} <span className="font-body text-sm font-normal opacity-70">spent</span></p></div><div className="text-left min-[561px]:text-right"><p className="text-xs opacity-70">Remaining budget</p><p className="mt-1 font-display text-[20px]">{formatMoney(remaining)}</p></div></div>
            {alert && <p className="mt-4 flex items-center gap-2 text-xs font-bold"><Icon name="insight" size={15} /> Less than 10% of this team’s budget remains.</p>}
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-[18px] tracking-[-0.03em]">Team receipts</h2><p className="mt-1 text-xs text-muted">{team.receipts.length} {team.receipts.length === 1 ? 'receipt' : 'receipts'}</p></div><button className={button.secondary} type="button"><Icon name="plus" size={15} /> Add receipt</button></div>
            {team.receipts.length ? <div className="grid grid-cols-2 gap-4 min-[700px]:grid-cols-3 min-[1050px]:grid-cols-5">{team.receipts.map((receipt) => <button className="group min-w-0 text-left focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" key={receipt.id} onClick={() => setPreview(receipt)}><div className="grid aspect-[1.15] place-items-center rounded-[14px] border border-line bg-white text-blue shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-blue group-hover:shadow-md"><Icon name="receipt" size={34} /></div><strong className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ink">{receipt.filename}</strong><span className="mt-1 block truncate text-xs text-muted">{receipt.date} · {formatMoney(receipt.amount)}</span></button>)}</div> : <div className="grid min-h-[220px] place-items-center rounded-[14px] border border-dashed border-line bg-white p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="folder" size={20} /></span><h3 className="mt-4 font-display text-[16px]">No receipts yet</h3><p className="mt-1 text-xs text-muted">Add the first receipt for {team.name} to see it here.</p></div></div>}
          </section>
        </>
      ) : <div className="rounded-[14px] border border-line bg-white p-8 text-sm text-muted">No teams available. Add a team from Team Management first.</div>}
      <ReceiptPreview receipt={preview} onClose={() => setPreview(null)} />
    </>
  )
}
