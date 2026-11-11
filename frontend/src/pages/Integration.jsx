import { useState } from 'react';
import Icon from '../components/Icon'
import { button } from '../components/button'
import { useGoogleIntegration } from '../hooks/useGoogleIntegration'
import { googleAPI } from '../api/googleConnect'
import Modal from '../components/Modal'
import { useToast } from '../context/toast'

export default function IntegrationSection() {
	const { connected, setConnected, loading, setLoading } = useGoogleIntegration();
	const [showDisconnectModal, setShowDisconnectModal] = useState(false);
	const { push } = useToast();

	const showToast = (message, type = 'success') => push(message, type);

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

			<section className="mt-3.5">
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
		</>
	)
}
