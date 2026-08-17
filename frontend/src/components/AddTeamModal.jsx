import { useState } from 'react'
import Icon from './Icon'

export default function AddTeamModal({ open, onClose, onAdd }) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('both')
  const [googleFolderId, setGoogleFolderId] = useState('')

  if (!open) return null

  const submit = (event) => {
    event.preventDefault()
    onAdd({ name: name.trim(), source, googleFolderId: googleFolderId.trim() })
    setName('')
    setSource('both')
    setGoogleFolderId('')
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-team-title"
      >
        <div className="panel-heading">
          <div>
            <h2 id="add-team-title">Add team</h2>
            <p className="subtle">
              Choose where this team receives receipts from.
            </p>
          </div>
          <button className="text-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={submit}>
          <label className="folder-root-field">
            Team name
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Marketing"
              required
            />
          </label>

          <label className="folder-root-field">
            Receipt source
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
                if (event.target.value === 'manual') setGoogleFolderId('')
              }}
            >
              <option value="manual">Manual upload</option>
              <option value="google">Google Drive</option>
              <option value="both">Both sources</option>
            </select>
          </label>

          {source !== 'manual' && (
            <label className="folder-root-field">
              Google folder ID
              <input
                value={googleFolderId}
                onChange={(event) => setGoogleFolderId(event.target.value)}
                placeholder="Paste Google Drive folder ID"
                required
              />
            </label>
          )}

          <div className="organization-form-actions">
            <button className="button button-primary" type="submit">
              <Icon name="plus" size={16} />
              Add team
            </button>
            <button className="button button-secondary" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
