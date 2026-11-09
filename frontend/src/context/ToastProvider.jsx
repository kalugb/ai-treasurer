import { useCallback, useMemo, useRef, useState } from 'react'
import { ToastContext } from './toast'

const MAX_TOASTS = 4

// Global toast store: any source calls push(); the stack renders them and caps at MAX_TOASTS,
// dropping the oldest when a new one arrives over the limit (fixes overlapping fixed-position toasts).
export function ToastProvider({ children }) {
	const [toasts, setToasts] = useState([])
	const idRef = useRef(0)

	const dismiss = useCallback((id) => {
		setToasts((list) => list.filter((t) => t.id !== id))
	}, [])

	const push = useCallback((message, type = 'success', duration = 5000) => {
		const id = ++idRef.current
		setToasts((list) => [...list, { id, message, type, duration }].slice(-MAX_TOASTS))
		return id
	}, [])

	const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])
	return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}
