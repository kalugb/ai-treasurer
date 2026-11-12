import { useEffect, useRef, useState } from 'react'

const RESET = { scale: 1, tx: 0, ty: 0 }
const MAX = 5
const STEP = 1.5

// Full-size image with scroll-to-zoom (toward the cursor, 1x-5x) and click-drag pan while zoomed.
// The box needs a height (e.g. `h-64`, `min-h-[40vh]`); the image fills it with object-contain.
// Pass `key` to reset zoom when the image changes. `fallback` renders behind the image, `children` on top of it.
export default function ZoomableImage({ src, alt = '', className = '', imgClassName = '', fallback = null, children = null, ...imgProps }) {
	const [zoom, setZoom] = useState(RESET)
	const [dragging, setDragging] = useState(false) // separate from dragRef so the cursor never reads a ref during render
	const dragRef = useRef(null)
	const boxRef = useRef(null)

	// native listener: React's onWheel is passive, so preventDefault (stop the page scrolling while zooming) only works here
	useEffect(() => {
		const box = boxRef.current
		const onWheel = (event) => {
			event.preventDefault()
			const rect = box.getBoundingClientRect()
			const cx = event.clientX - rect.left - rect.width / 2
			const cy = event.clientY - rect.top - rect.height / 2
			setZoom((current) => {
				const scale = Math.min(MAX, Math.max(1, current.scale - event.deltaY * 0.0015))
				if (scale <= 1) return RESET
				const ratio = scale / current.scale
				return { scale, tx: cx - (cx - current.tx) * ratio, ty: cy - (cy - current.ty) * ratio }
			})
		}
		box.addEventListener('wheel', onWheel, { passive: false })
		return () => box.removeEventListener('wheel', onWheel)
	}, [])

	const onPointerDown = (event) => {
		if (zoom.scale <= 1) return
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = { x: event.clientX, y: event.clientY, tx: zoom.tx, ty: zoom.ty }
		setDragging(true)
	}
	const onPointerMove = (event) => {
		const start = dragRef.current
		if (!start) return
		setZoom((current) => ({ ...current, tx: start.tx + (event.clientX - start.x), ty: start.ty + (event.clientY - start.y) }))
	}
	const onPointerUp = () => { dragRef.current = null; setDragging(false) }

	// button zoom for touchpads/touch: zooms toward the centre of the box, same 1x-5x limits as the wheel
	const zoomBy = (factor) => setZoom((current) => {
		const scale = Math.min(MAX, Math.max(1, current.scale * factor))
		if (scale <= 1) return RESET
		const ratio = scale / current.scale
		return { scale, tx: current.tx * ratio, ty: current.ty * ratio }
	})
	const controlClass = 'grid size-8 place-items-center rounded-full border border-line bg-white text-[18px] leading-none font-bold text-blue shadow-md transition hover:bg-blue-soft focus-visible:outline-[3px] focus-visible:outline-blue-ring disabled:cursor-not-allowed disabled:opacity-40'

	return (
		<div ref={boxRef} className={`relative grid place-items-center overflow-hidden ${className}`}>
			{fallback}
			{src && (
				<img
					{...imgProps}
					src={src}
					alt={alt}
					draggable={false}
					className={`absolute inset-0 h-full w-full touch-none object-contain ${imgClassName}`}
					style={{ transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`, cursor: zoom.scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>
			)}
			{src && (
				<div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5" role="group" aria-label="Zoom controls">
					<button className={controlClass} type="button" aria-label="Zoom out" disabled={zoom.scale <= 1} onClick={() => zoomBy(1 / STEP)}>−</button>
					<button className={controlClass} type="button" aria-label="Zoom in" disabled={zoom.scale >= MAX} onClick={() => zoomBy(STEP)}>+</button>
				</div>
			)}
			{zoom.scale > 1 && <span className="absolute bottom-3 left-3 rounded-full bg-[rgb(28_35_36/70%)] px-2.5 py-1 text-[11px] font-bold text-white">{zoom.scale.toFixed(1)}×</span>}
			{children}
		</div>
	)
}
