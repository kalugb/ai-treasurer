export default function Settings() {
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Workspace preferences</p><h1>Settings</h1><p className="subtle">Make AI Treasurer work the way you do.</p></div>
      </header>
      <section className="settings-grid">
        <article className="panel settings-card">
          <div className="panel-heading"><div><h2>Profile</h2><p className="subtle">Your personal details</p></div></div>
          <label>Display name<input defaultValue="Alex Morgan" /></label>
          <label>Email address<input defaultValue="alex@example.com" type="email" /></label>
          <button className="button button-primary">Save changes</button>
        </article>
        <article className="panel settings-card">
          <div className="panel-heading"><div><h2>AI preferences</h2><p className="subtle">Tune how your assistant helps</p></div></div>
          <label className="toggle-row"><span><strong>Monthly spending summaries</strong><small>Receive a plain-English recap</small></span><input type="checkbox" defaultChecked /></label>
          <label className="toggle-row"><span><strong>Review reminders</strong><small>Get notified when receipts need attention</small></span><input type="checkbox" defaultChecked /></label>
          <label>Default currency<select defaultValue="USD"><option>USD — US Dollar</option><option>CAD — Canadian Dollar</option><option>GBP — Pound Sterling</option></select></label>
        </article>
      </section>
    </>
  )
}
