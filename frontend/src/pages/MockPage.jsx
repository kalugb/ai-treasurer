import Icon from '../components/Icon'
import { receipts } from '../data/mockData'

export default function MockPage({ type }) {
  const pages = { insights: { eyebrow: 'AI / Insights', title: 'Make sense of your money.', description: 'Personalized observations from your mock financial records.', heading: 'Recent insights', items: [['Subscriptions', 'You have 4 recurring subscriptions totaling $87.20 this month.', 'Review'], ['Travel', 'Travel is your largest category so far, at 31% of total spending.', 'Explore'], ['Receipts', '12 receipts are waiting for a quick review.', 'Review']] }, policies: { eyebrow: 'AI / Policies', title: 'Set the rules for your AI.', description: 'Choose what AI Treasurer can do when organizing your records.', heading: 'Active policies', items: [['Receipt categorization', 'Suggest a category for new receipts before saving.', 'On'], ['Monthly summaries', 'Create a plain-English summary on the first day of each month.', 'On'], ['Spending alerts', 'Flag unusual purchases over $250 for your review.', 'On']] }, receipts: { eyebrow: 'Finance / Receipts', title: 'Your receipt records.', description: 'Add, review, and organize the purchases in your workspace.', heading: 'All receipts', items: receipts.map(([date, merchant, category, amount, status]) => [merchant, `${date} · ${category} · ${amount}`, status]) }, summaries: { eyebrow: 'Finance / Summaries', title: 'Your financial summaries.', description: 'A simple view of where your money is going.', heading: 'March 2025', items: [['Total spending', '$2,847.62 across 38 captured receipts.', 'On track'], ['Top category', 'Travel · $882.40 this month.', '31%'], ['Budget remaining', '$1,352.38 available for the rest of March.', '32%']] } }
  const page = pages[type]
  const icon = type === 'receipts' ? 'receipt' : type === 'summaries' ? 'summary' : type === 'policies' ? 'shield' : 'insight'
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="subtle">{page.description}</p></div>
        <button className="button button-primary"><Icon name={type === 'receipts' ? 'plus' : 'spark'} size={16} /> {type === 'receipts' ? 'Add receipt' : 'Ask AI Agent'}</button>
      </header>
      <section className="panel mock-page">
        <div className="panel-heading"><div><h2>{page.heading}</h2><p className="subtle">Mock data for the first frontend pass</p></div><span className="mock-count">{page.items.length} items</span></div>
        <div className="mock-list">
          {page.items.map(([label, detail, action]) => (
            <div className="mock-row" key={label}>
              <span className="mock-icon"><Icon name={icon} size={16} /></span>
              <span><strong>{label}</strong><small>{detail}</small></span>
              <span className="mock-action">{action}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
