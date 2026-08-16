import Icon from '../components/Icon'
import { receipts } from '../data/mockData'

export default function Dashboard({ goTo }) {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Tuesday, March 19, 2025</p>
          <h1>Good morning, Alex.</h1>
          <p className="subtle">Here’s your financial snapshot for this month.</p>
        </div>
        <button className="button button-primary" onClick={() => goTo('agent')}>
          <Icon name="spark" size={16} />
          Ask AI Agent
        </button>
      </header>

      <section className="metrics" aria-label="Financial summary">
        <article className="metric-card featured">
          <span className="metric-label">Total spending</span>
          <strong>$2,847.62</strong>
          <span className="metric-foot"><Icon name="trend" size={15} /> 8.4% less than last month</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Receipts captured</span>
          <strong>38</strong>
          <span className="metric-foot neutral">12 need your review</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Monthly budget</span>
          <strong>$4,200</strong>
          <span className="metric-foot neutral">67.8% used</span>
          <div className="progress"><span style={{ width: '68%' }} /></div>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel receipt-panel">
          <div className="panel-heading">
            <div><h2>Recent receipts</h2><p className="subtle">Your latest uploaded records</p></div>
            <button className="button button-secondary" onClick={() => goTo('receipts')}><Icon name="plus" size={16} /> Add receipt</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {receipts.map(([date, merchant, category, amount, status]) => (
                  <tr key={merchant}>
                    <td>{date}</td><td className="merchant"><span className="merchant-mark">{merchant[0]}</span>{merchant}</td>
                    <td>{category}</td><td className="amount">{amount}</td>
                    <td><span className={`status ${status === 'Reviewed' ? 'done' : 'review'}`}>{status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="text-button" onClick={() => goTo('receipts')}>View all receipts <Icon name="arrow" size={15} /></button>
        </article>

        <article className="panel insight-panel">
          <div className="panel-heading">
            <div><h2>AI insight</h2><p className="subtle">A quick read on your spending</p></div>
            <span className="ai-badge"><Icon name="spark" size={14} /></span>
          </div>
          <div className="insight-quote">“Your software subscriptions are up 14% this month. I found two recurring charges you may want to review.”</div>
          <div className="insight-detail"><span className="insight-dot" /><div><strong>Potential saving</strong><p className="subtle">Canceling unused plans could save <b>$38 / month</b>.</p></div></div>
          <button className="button button-quiet" onClick={() => goTo('insights')}>Explore with AI <Icon name="arrow" size={15} /></button>
        </article>
      </section>
    </>
  )
}
