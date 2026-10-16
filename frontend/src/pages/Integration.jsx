import { useState } from 'react';
import Icon from '../components/Icon'
import { button } from '../components/button'
import { useGoogleIntegration } from '../hooks/useGoogleIntegration'
import { googleAPI } from '../api/googleConnect'
import Modal from '../components/Modal'
import Toast from '../components/Toast'

export default function Integration() {
	const { connected, setConnected, loading, setLoading } = useGoogleIntegration();
	const [showDisconnectModal, setShowDisconnectModal] = useState(false);
	const [toast, setToast] = useState(null);

	const showToast = (message, type = 'success') => {
		setToast({ message, type });
	};

	const handleGoogleIntegration = async () => {
		if (connected) {
			setShowDisconnectModal(true);
		} else {
			try {
				setLoading(true);
				await googleAPI.connectGoogleIntegration();
				setConnected(true);
				showToast('Google connected successfully');
			} catch (error) {
				console.error('Error connecting Google integration:', error);
				showToast('Failed to connect Google', 'error');
			} finally {
				setLoading(false);
			}
		}
	};

	const confirmDisconnect = async () => {
		try {
			setLoading(true);
			await googleAPI.disconnectGoogleIntegration();
			setConnected(false);
			showToast('Google disconnected successfully');
		} catch (error) {
			console.error('Error disconnecting Google integration:', error);
			showToast('Failed to disconnect Google', 'error');
		} finally {
			setLoading(false);
			setShowDisconnectModal(false);
		}
	};

	return (
		<>
			<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div>
					<p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Settings / Integration</p>
					<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Connect your tools.</h1>
					<p className="mt-3 text-[13px] leading-[1.55] text-muted">Bring the places where your financial records already live into AI Treasurer.</p>
				</div>
			</header>
			<section className="grid grid-cols-[minmax(0,620px)]">
				<article className="flex items-start gap-4.5 rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
					<div className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-soft font-display text-2xl font-extrabold text-[#4285f4]">G</div>
					<div className="flex-1">
						<div className="flex items-center gap-2.5"><h2 className="font-display text-[17px] tracking-[-0.03em]">Google</h2><span className={`rounded-[20px] px-2 py-1.25 text-[10px] font-bold ${connected ? 'bg-green-soft text-green' : 'bg-paper text-muted'}`}>{connected ? 'Connected' : 'Available'}</span></div>
						<p className="mb-4.5 mt-2 max-w-112.5 text-[13px] leading-[1.55] text-muted">Connect Google Drive to import receipt files and keep your records organized.</p>
						<button className={loading ? 'inline-flex min-h-10.5 items-center justify-center gap-2 rounded-lg border border-transparent px-3.75 text-[13px] font-bold transition-[transform,background-color,border-color] duration-200 ease-out bg-line hover:bg-line/80 cursor-not-allowed' : connected ? button.secondary : button.primary} onClick={handleGoogleIntegration} disabled={loading}>
							<Icon name={loading ? 'spinner' : connected ? 'plug' : 'plus'} size={16} />
							{loading ? 'Loading...' : connected ? 'Disconnect' : 'Connect Google'}
						</button>
					</div>
				</article>
			</section>
			<Modal
				isOpen={showDisconnectModal}
				onClose={() => setShowDisconnectModal(false)}
				title="Disconnect Google?"
			>
				<p className="text-muted">Are you sure you want to disconnect Google Drive? You'll need to reconnect to import receipts again.</p>
				<div className="mt-6 flex items-center justify-end gap-3" slot="footer">
					<button className={button.quiet} onClick={() => setShowDisconnectModal(false)}>Cancel</button>
					<button className="inline-flex min-h-10.5 items-center justify-center gap-2 rounded-lg border border-transparent px-3.75 text-[13px] font-bold transition-[transform,background-color,border-color] duration-200 ease-out hover:-translate-y-0.25 focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2 bg-red-soft text-red hover:bg-red-soft/80" onClick={confirmDisconnect} disabled={loading}>
						Disconnect
					</button>
				</div>
			</Modal>
			{toast && (
				<Toast
					message={toast.message}
					type={toast.type}
					onClose={() => setToast(null)}
				/>
			)}
		</>
	)
}
