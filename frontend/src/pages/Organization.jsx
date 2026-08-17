import { useState } from 'react'
import Icon from '../components/Icon'

const initialOrganizations = ['Personal workspace']

export default function Organization() {
  const [organizations, setOrganizations] = useState(initialOrganizations)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null)

  const save = (event) => {
    event.preventDefault()
    const value = name.trim()
    if (!value) return
    setOrganizations((current) => editing === null
      ? [...current, value]
      : current.map((organization, index) => index === editing ? value : organization))
    setName('')
    setEditing(null)
  }

  const edit = (index) => {
    setEditing(index)
    setName(organizations[index])
  }

  const remove = (index) => {
    setOrganizations((current) => current.filter((_, itemIndex) => itemIndex !== index))
    if (editing === index) {
      setEditing(null)
      setName('')
    }
  }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Workspace</p><h1>Organizations</h1><p className="subtle">Create and manage the organizations that keep your finances separate.</p></div>
      </header>
      <section className="panel settings-card organization-page">
        <div className="panel-heading"><div><h2>{editing === null ? 'Add an organization' : 'Edit organization'}</h2><p className="subtle">Local-only for now. Changes are kept in this page while it is open.</p></div><span className="mock-count">{organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'}</span></div>
        <form className="organization-form" onSubmit={save}>
          <label htmlFor="organization-name">Organization name<input id="organization-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Inc." /></label>
          <div className="organization-form-actions"><button className="button button-primary" type="submit"><Icon name="plus" size={16} /> {editing === null ? 'Add organization' : 'Save changes'}</button>{editing !== null && <button className="button button-secondary" type="button" onClick={() => { setEditing(null); setName('') }}>Cancel</button>}</div>
        </form>
        <div className="mock-list organization-list">
          {organizations.map((organization, index) => <div className="mock-row" key={`${organization}-${index}`}><span className="mock-icon"><Icon name="grid" size={16} /></span><span><strong>{organization}</strong><small>Local organization</small></span><span className="mock-actions"><button className="mock-control" onClick={() => edit(index)}>Edit</button><button className="mock-control danger" onClick={() => remove(index)}>Remove</button></span></div>)}
        </div>
      </section>
    </>
  )
}
