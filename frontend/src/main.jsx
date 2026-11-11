import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SnapshotModeProvider } from './context/SnapshotModeProvider'

createRoot(document.getElementById('root')).render(
	<StrictMode>
		<SnapshotModeProvider>
			<App />
		</SnapshotModeProvider>
	</StrictMode>,
)
