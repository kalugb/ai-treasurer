import { useEffect, useState } from 'react'

const ORG_CHANGED_EVENT = 'ai-treasurer:org-changed'

export function useSelectedOrganization() {
  const [organization, setOrganization] = useState(() => {
    try {
      const raw = sessionStorage.getItem('selectedOrganization')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const handleStorage = () => {
      try {
        const raw = sessionStorage.getItem('selectedOrganization')
        setOrganization(raw ? JSON.parse(raw) : null)
      } catch {
        setOrganization(null)
      }
    }

    const handleCustomEvent = (event) => {
      if (event.detail) {
        setOrganization(event.detail)
      } else {
        try {
          const raw = sessionStorage.getItem('selectedOrganization')
          setOrganization(raw ? JSON.parse(raw) : null)
        } catch {
          setOrganization(null)
        }
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(ORG_CHANGED_EVENT, handleCustomEvent)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ORG_CHANGED_EVENT, handleCustomEvent)
    }
  }, [])

  return organization
}

export function dispatchOrgChange(org) {
  window.dispatchEvent(new CustomEvent(ORG_CHANGED_EVENT, { detail: org }))
}