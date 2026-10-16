export default function Modal({ isOpen, onClose, title, children, footer }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="relative w-full max-w-md rounded-[14px] bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                {title && (
                    <h2 id="modal-title" className="mb-4 font-display text-[19px] tracking-[-0.02em] text-ink">{title}</h2>
                )}
                <div>{children}</div>
                {footer && (
                    <div className="mt-6 flex items-center justify-end gap-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}