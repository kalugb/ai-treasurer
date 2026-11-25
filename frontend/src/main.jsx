import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './components/AuthGate'
import { AuthProvider } from './context/AuthProvider'
import { SnapshotModeProvider } from './context/SnapshotModeProvider'

createRoot(document.getElementById('root')).render(
	<StrictMode>
		<AuthProvider>
			<AuthGate>
				<SnapshotModeProvider>
					<App />
				</SnapshotModeProvider>
			</AuthGate>
		</AuthProvider>
	</StrictMode>,
)
