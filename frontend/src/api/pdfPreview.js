// Rasterize a PDF file's first page to a PNG object URL so it flows through the same <img> zoom/pan
// path as images (mirrors the backend's pdfium render for Drive PDFs).
// pdfjs + worker are heavy (~1 MB), so both are dynamically imported — only loaded when a PDF is picked.
export async function pdfFirstPageToImageUrl(file) {
	const pdfjs = await import('pdfjs-dist')
	// Vite's ?worker import returns a Worker constructor it has bundled correctly — the most
	// reliable wiring for pdfjs v4+ (avoids ?url / new URL() resolution quirks).
	const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')
	pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

	const data = new Uint8Array(await file.arrayBuffer())
	const loadingTask = pdfjs.getDocument({ data })
	const pdf = await loadingTask.promise
	try {
		const page = await pdf.getPage(1)
		const viewport = page.getViewport({ scale: 2 }) // ~144 DPI, matches the backend preview
		const canvas = document.createElement('canvas')
		canvas.width = viewport.width
		canvas.height = viewport.height
		await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
		return URL.createObjectURL(blob)
	} finally {
		loadingTask.destroy()  // v6: destroy the loading task, not the document proxy
	}
}
