import { useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { receipts } from '../data/mockData'

export default function MockPage({ type }) {
  const pages = { insights: { eyebrow: 'AI / Insights', title: 'Make sense of your money.', description: 'Personalized observations from your mock financial records.', heading: 'Recent insights', items: [['Subscriptions', 'You have 4 recurring subscriptions totaling $87.20 this month.', 'Review'], ['Travel', 'Travel is your largest category so far, at 31% of total spending.', 'Explore'], ['Receipts', '12 receipts are waiting for a quick review.', 'Review']] }, receipts: { eyebrow: 'Finance / Receipts', title: 'Your receipt records.', description: 'Add, review, and organize the purchases in your workspace.', heading: 'All receipts', items: receipts.map(([date, merchant, category, amount, status]) => [merchant, `${date} · ${category} · ${amount}`, status]) }, summaries: { eyebrow: 'Finance / Summaries', title: 'Your financial summaries.', description: 'A simple view of where your money is going.', heading: 'March 2025', items: [['Total spending', '$2,847.62 across 38 captured receipts.', 'On track'], ['Top category', 'Travel · $882.40 this month.', '31%'], ['Budget remaining', '$1,352.38 available for the rest of March.', '32%']] } }
  const page = pages[type]
  const icon = type === 'receipts' ? 'receipt' : type === 'summaries' ? 'summary' : 'insight'
  const [items, setItems] = useState(page.items)
  const [selectedItem, setSelectedItem] = useState(null)
  const isManagedPage = ['insights', 'receipts'].includes(type)

  const addItem = () => {
    const label = type === 'receipts' ? 'New merchant receipt' : 'New insight'
    const detail = type === 'receipts' ? 'Mar 19, 2025 · Uncategorized · $0.00' : 'Mock item added for this frontend preview.'
    setItems((current) => [[label, detail, type === 'receipts' ? 'Needs review' : 'Review'], ...current])
  }

  const editItem = (index) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? [`${item[0]} · edited`, item[1], item[2]] : item))
  }

  const deleteItem = (index) => {
    if (selectedItem === index) setSelectedItem(null)
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const emptyCopy = {
    insights: ['No AI insights yet', 'Add an insight to keep a useful note about your finances for later.'],
    receipts: ['No receipts yet', 'Add your first receipt to start tracking and understanding your spending.'],
  }

  return (
    <>
      <header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div><p className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">{page.eyebrow}</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">{page.title}</h1><p className="mt-3 text-[13px] leading-[1.55] text-muted">{page.description}</p></div>
        {isManagedPage ? (
          <button className={button.primary} onClick={addItem}>
            <Icon name="plus" size={16} />
            {type === 'receipts' ? 'Add receipt' : 'Add insight'}
          </button>
        ) : (
          <button className={button.primary} onClick={type === 'receipts' ? addItem : undefined}><Icon name={type === 'receipts' ? 'plus' : 'spark'} size={16} /> {type === 'receipts' ? 'Add receipt' : 'Ask AI Agent'}</button>
        )}
      </header>
      <section className="min-h-[360px] rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4">
        <div className="mb-5 flex items-start justify-between gap-[18px]"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">{page.heading}</h2><p className="mt-[6px] text-[13px] leading-[1.55] text-muted">Mock data for the first frontend pass</p></div><span className="rounded-[20px] bg-blue-soft px-[9px] py-[6px] text-[11px] font-bold text-blue">{items.length} items</span></div>
        {items.length === 0 ? (
          <div className="grid justify-items-center px-6 pt-[58px] pb-[46px] text-center">
            <span className="mb-4 grid size-[48px] place-items-center rounded-[14px] bg-blue-soft text-blue"><Icon name={icon} size={22} /></span>
            <h3 className="font-display text-[17px]">{emptyCopy[type][0]}</h3>
            <p className="mb-5 mt-2 max-w-[360px] text-[13px] leading-[1.5] text-muted">{emptyCopy[type][1]}</p>
            <button className={button.primary} onClick={addItem}><Icon name="plus" size={16} /> Add {type === 'receipts' ? 'receipt' : 'insight'}</button>
          </div>
        ) : (
          <div className="grid">
            {items.map(([label, detail, action], index) => (
              <div className="flex items-center gap-3 border-t border-line py-4" key={`${label}-${index}`}>
                <span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name={icon} size={16} /></span>
                <span className="grid flex-1 gap-[5px]"><strong>{label}</strong><small className="text-xs text-muted">{detail}</small></span>
                {isManagedPage ? (
                  <span className="flex items-center gap-2">
                    <span className="rounded-[20px] bg-brown-soft px-[9px] py-[5px] text-[10px] font-bold text-brown">{action}</span>
                    {type === 'receipts' && <button className="rounded-md border border-line bg-transparent px-[7px] py-[5px] text-[10px] font-bold text-blue hover:border-blue hover:bg-blue-soft" onClick={() => setSelectedItem(index)}>View</button>}
                    {type !== 'insights' && <button className="rounded-md border border-line bg-transparent px-[7px] py-[5px] text-[10px] font-bold text-blue hover:border-blue hover:bg-blue-soft" onClick={() => editItem(index)}>Edit</button>}
                    <button className="rounded-md border border-line bg-transparent px-[7px] py-[5px] text-[10px] font-bold text-brown hover:border-brown hover:bg-brown-soft" onClick={() => deleteItem(index)}>Delete</button>
                  </span>
                ) : <span className="rounded-[20px] bg-brown-soft px-[9px] py-[5px] text-[10px] font-bold text-brown">{action}</span>}
                {type === 'receipts' && selectedItem === index && <div className="mt-1 ml-[46px] grid basis-full gap-1 rounded-lg bg-paper p-3 text-xs text-muted"><strong className="text-ink">{label}</strong><span>{detail}</span><small className="text-[11px]">Mock receipt detail view · no backend connected</small></div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
