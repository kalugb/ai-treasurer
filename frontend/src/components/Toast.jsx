import { useEffect } from 'react';
import Icon from './Icon';

export default function Toast({ message, type = 'success', onClose, duration = 5000 }) {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [onClose, duration]);

    const bgClass = type === 'success' ? 'bg-green-soft text-green' : 'bg-red-soft text-red';
    const iconName = type === 'success' ? 'check' : 'close';

    return (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 rounded-lg border border-line/50 bg-white px-4 py-3 shadow-xl animate-slide-in ${bgClass}`} role="alert" aria-live="polite">
            <Icon name={iconName} size={16} className="shrink-0" />
            <span className="text-[13px] font-medium">{message}</span>
            <button onClick={onClose} className="ml-2 rounded p-1 hover:bg-black/10 transition-colors" aria-label="Dismiss">
                <Icon name="close" size={14} />
            </button>
        </div>
    );
}