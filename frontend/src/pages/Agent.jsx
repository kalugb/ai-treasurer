import { useState } from 'react'
import Icon from '../components/Icon'

export default function Agent() {
  const [prompt, setPrompt] = useState('')
  return (
    <>
      <header className="page-header agent-header">
        <div><p className="eyebrow">Your financial co-pilot</p><h1>What would you like to know?</h1><p className="subtle">Ask about your spending, upload a receipt, or get a clear summary.</p></div>
        <span className="agent-orb"><Icon name="spark" size={25} /></span>
      </header>
      <section className="agent-layout">
        <article className="panel chat-panel">
          <div className="chat-welcome"><span className="ai-badge large"><Icon name="spark" size={18} /></span><h2>Hi Alex, I’m ready to help.</h2><p className="subtle">I can analyse your records, organize receipts, and turn your finances into simple next steps.</p></div>
          <div className="suggestions">
            <button onClick={() => setPrompt('Summarize my spending this month')}>Summarize my spending <Icon name="arrow" size={15} /></button>
            <button onClick={() => setPrompt('Which subscriptions should I review?')}>Find subscriptions to review <Icon name="arrow" size={15} /></button>
            <button onClick={() => setPrompt('Show my biggest expenses')}>Show my biggest expenses <Icon name="arrow" size={15} /></button>
          </div>
          <div className="chat-input"><input aria-label="Ask the AI agent" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask anything about your finances..." /><button aria-label="Send question"><Icon name="arrow" size={18} /></button></div>
        </article>
        <aside className="agent-aside"><div className="panel mini-panel"><span className="metric-label">Quick actions</span><button className="action-row"><span className="action-icon blue"><Icon name="receipt" size={17} /></span><span><strong>Add a receipt</strong><small>Upload or enter one manually</small></span><Icon name="chevron" size={16} /></button><button className="action-row"><span className="action-icon brown"><Icon name="chat" size={17} /></span><span><strong>Prepare a summary</strong><small>Get a shareable monthly view</small></span><Icon name="chevron" size={16} /></button></div></aside>
      </section>
    </>
  )
}
