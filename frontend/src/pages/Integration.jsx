import { useState } from 'react'
import Icon from '../components/Icon'

export default function Integration() {
  const [connected, setConnected] = useState(false)

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings / Integration</p>
          <h1>Connect your tools.</h1>
          <p className="subtle">Bring the places where your financial records already live into AI Treasurer.</p>
        </div>
      </header>
      <section className="integration-grid">
        <article className="panel integration-card">
          <div className="integration-logo">G</div>
          <div className="integration-copy">
            <div className="integration-title"><h2>Google</h2><span className={`integration-status ${connected ? 'connected' : ''}`}>{connected ? 'Connected' : 'Available'}</span></div>
            <p className="subtle">Connect Google Drive to import receipt files and keep your records organized.</p>
            <button className={`button ${connected ? 'button-secondary' : 'button-primary'}`} onClick={() => setConnected((value) => !value)}>
              <Icon name={connected ? 'plug' : 'plus'} size={16} />
              {connected ? 'Disconnect' : 'Connect Google'}
            </button>
          </div>
        </article>
      </section>
    </>
  )
}
