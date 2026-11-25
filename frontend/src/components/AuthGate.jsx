import Icon from './Icon'
import Login from '../pages/Login'
import { useAuth } from '../context/auth'

// Nothing behind this mounts until someone is signed in, so no request, stream or cache starts before then.
export default function AuthGate({ children }) {
	const { status } = useAuth()
	if (status === 'loading') return <div className="grid min-h-svh place-items-center bg-paper text-blue"><Icon name="spinner" size={28} /></div>
	if (status === 'signedOut') return <Login />
	return children
}
