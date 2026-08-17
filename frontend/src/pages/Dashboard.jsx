import Icon from '../components/Icon'
import { button } from '../components/button'
import { receipts } from '../data/mockData'

export default function Dashboard({ goTo }) {
  return (
    <>
      <header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div>
          <p className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Tuesday, March 19, 2025</p>
          <h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">Good morning, Alex.</h1>
          <p className="subtle mt-3 text-[13px] leading-[1.55] text-muted">Here’s your financial snapshot for this month.</p>
        </div>
        <button className={button.primary} onClick={() => goTo('agent')}>
          <Icon name="spark" size={16} />
          Ask AI Agent
        </button>
      </header>

      <section className="mb-[14px] grid grid-cols-3 gap-[14px] max-[820px]:grid-cols-1" aria-label="Financial summary">
        <article className="min-h-[150px] rounded-[14px] border border-blue bg-blue p-[22px] text-white max-[820px]:min-h-auto max-[560px]:p-4">
          <span className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-white/72">Total spending</span>
          <strong className="mb-4 block font-display text-[30px] tracking-[-0.05em]">$2,847.62</strong>
          <span className="flex items-center gap-[5px] text-xs text-white/72"><Icon name="trend" size={15} /> 8.4% less than last month</span>
        </article>
        <article className="min-h-[150px] rounded-[14px] border border-line bg-white p-[22px] max-[820px]:min-h-auto max-[560px]:p-4">
          <span className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Receipts captured</span>
          <strong className="mb-4 block font-display text-[30px] tracking-[-0.05em]">38</strong>
          <span className="flex items-center gap-[5px] text-xs text-muted">12 need your review</span>
        </article>
        <article className="min-h-[150px] rounded-[14px] border border-line bg-white p-[22px] max-[820px]:min-h-auto max-[560px]:p-4">
          <span className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Monthly budget</span>
          <strong className="mb-4 block font-display text-[30px] tracking-[-0.05em]">$4,200</strong>
          <span className="flex items-center gap-[5px] text-xs text-muted">67.8% used</span>
          <div className="mt-[18px] h-[5px] overflow-hidden rounded-[10px] bg-line"><span className="block h-full rounded-[10px] bg-brown" style={{ width: '68%' }} /></div>
        </article>
      </section>

      <section className="grid grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)] gap-[14px] max-[820px]:grid-cols-1">
        <article className="rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4">
          <div className="mb-5 flex items-start justify-between gap-[18px]">
            <div><h2 className="font-display text-[17px] tracking-[-0.03em]">Recent receipts</h2><p className="mt-[6px] text-[13px] leading-[1.55] text-muted">Your latest uploaded records</p></div>
            <button className={`${button.secondary} max-[560px]:px-[10px] max-[560px]:text-[0px]`} onClick={() => goTo('receipts')}><Icon name="plus" size={16} /> Add receipt</button>
          </div>
          <div className="overflow-x-auto max-[560px]:-mx-[5px]">
            <table className="w-full border-collapse text-xs whitespace-nowrap">
              <thead><tr><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Date</th><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Merchant</th><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Category</th><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Amount</th><th className="pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted">Status</th></tr></thead>
              <tbody>
                {receipts.map(([date, merchant, category, amount, status]) => (
                  <tr key={merchant}>
                    <td className="border-t border-line py-[13px] pr-3 pl-0 text-muted">{date}</td>
                    <td className="border-t border-line py-[13px] pr-3 pl-0 text-muted"><span className="flex items-center gap-2 font-semibold text-ink"><span className="grid size-[25px] place-items-center rounded-[7px] bg-brown-soft text-[11px] text-brown">{merchant[0]}</span>{merchant}</span></td>
                    <td className="border-t border-line py-[13px] pr-3 pl-0 text-muted">{category}</td>
                    <td className="border-t border-line py-[13px] pr-3 pl-0 text-right font-semibold text-ink">{amount}</td>
                    <td className="border-t border-line py-[13px] pr-3 pl-0 text-muted"><span className={`inline-flex rounded-[20px] px-2 py-[5px] text-[10px] font-bold ${status === 'Reviewed' ? 'bg-green-soft text-green' : 'bg-brown-soft text-brown'}`}>{status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-[14px] border border-transparent bg-brown-soft p-[22px] max-[560px]:p-4">
          <div className="mb-5 flex items-start justify-between gap-[18px]">
            <div><h2 className="font-display text-[17px] tracking-[-0.03em]">AI insight</h2><p className="mt-[6px] text-[13px] leading-[1.55] text-muted">A quick read on your spending</p></div>
            <span className="grid size-[30px] place-items-center rounded-[9px] bg-brown text-white"><Icon name="spark" size={14} /></span>
          </div>
          <div className="my-5 font-display text-[17px] font-semibold leading-[1.45] text-brown-dark">“Your software subscriptions are up 14% this month. I found two recurring charges you may want to review.”</div>
          <div className="mb-[22px] flex gap-[10px] border-t border-[rgba(119,82,52,0.16)] pt-4"><span className="mt-[5px] size-2 shrink-0 rounded-full bg-brown" /><div><strong className="text-xs">Potential saving</strong><p className="mt-1 text-[13px] leading-[1.55] text-muted">Canceling unused plans could save <b className="text-brown-dark">$38 / month</b>.</p></div></div>
          <button className={button.quiet} onClick={() => goTo('insights')}>Explore with AI <Icon name="arrow" size={15} /></button>
        </article>
      </section>
    </>
  )
}
