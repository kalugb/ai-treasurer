import { useState } from 'react'
import Icon from '../components/Icon'
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
      <header className="page-header">
        <div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="subtle">{page.description}</p></div>
        {isManagedPage ? (
          <button className="button button-primary" onClick={addItem}>
            <Icon name="plus" size={16} />
            {type === 'receipts' ? 'Add receipt' : 'Add insight'}
          </button>
        ) : (
          <button className="button button-primary" onClick={type === 'receipts' ? addItem : undefined}><Icon name={type === 'receipts' ? 'plus' : 'spark'} size={16} /> {type === 'receipts' ? 'Add receipt' : 'Ask AI Agent'}</button>
        )}
      </header>
      <section className="panel mock-page">
        <div className="panel-heading"><div><h2>{page.heading}</h2><p className="subtle">Mock data for the first frontend pass</p></div><span className="mock-count">{items.length} items</span></div>
        {items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Icon name={icon} size={22} /></span>
            <h3>{emptyCopy[type][0]}</h3>
            <p>{emptyCopy[type][1]}</p>
            <button className="button button-primary" onClick={addItem}><Icon name="plus" size={16} /> Add {type === 'receipts' ? 'receipt' : 'insight'}</button>
          </div>
        ) : (
          <div className="mock-list">
            {items.map(([label, detail, action], index) => (
              <div className="mock-row" key={`${label}-${index}`}>
                <span className="mock-icon"><Icon name={icon} size={16} /></span>
                <span><strong>{label}</strong><small>{detail}</small></span>
                {isManagedPage ? (
                  <span className="mock-actions">
                    <span className="mock-action">{action}</span>
                    {type === 'receipts' && <button className="mock-control" onClick={() => setSelectedItem(index)}>View</button>}
                    {type !== 'insights' && <button className="mock-control" onClick={() => editItem(index)}>Edit</button>}
                    <button className="mock-control danger" onClick={() => deleteItem(index)}>Delete</button>
                  </span>
                ) : <span className="mock-action">{action}</span>}
                {type === 'receipts' && selectedItem === index && <div className="receipt-detail"><strong>{label}</strong><span>{detail}</span><small>Mock receipt detail view · no backend connected</small></div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
