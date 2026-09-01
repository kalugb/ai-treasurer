import { button } from '../components/button'

export default function NotFound({ goTo }) {
	return (
		<section className="relative -mt-13 -mb-13 grid min-h-svh place-items-center overflow-hidden bg-paper text-center max-[820px]:-mt-8 max-[820px]:-mb-8 max-[560px]:-mt-7 max-[560px]:-mb-7">
			<div className="pointer-events-none absolute inset-0" aria-hidden="true">
				<div className="absolute -top-32 left-1/2 size-[min(70vw,640px)] -translate-x-1/2 rounded-full bg-blue-soft/60 blur-3xl motion-reduce:animate-none animate-[pulse_12s_ease-in-out_infinite]" />
				<div className="absolute right-[-12%] bottom-[-18%] size-[min(45vw,420px)] rounded-full bg-brown-soft/70 blur-3xl motion-reduce:animate-none animate-[pulse_15s_ease-in-out_infinite]" />
				<div className="absolute top-1/2 left-1/2 size-[min(64vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue/10 motion-reduce:animate-none animate-[spin_32s_linear_infinite]" />
				<div className="absolute top-1/2 left-1/2 size-[min(40vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brown/10 motion-reduce:animate-none animate-[spin_24s_linear_infinite_reverse]" />
			</div>
			<div className="relative z-1 px-6">
				<p className="text-[11px] font-bold tracking-widest text-muted uppercase">Error 404</p>
				<div className="relative mt-4">
					<span className="pointer-events-none block select-none font-display text-[clamp(104px,21vw,220px)] font-extrabold leading-[0.72] tracking-[-0.14em] text-blue/10" aria-hidden="true">404</span>
					<h1 className="relative mt-7 font-display text-[clamp(36px,6vw,64px)] leading-none tracking-[-0.07em] text-ink">Page not found</h1>
				</div>
				<p className="mx-auto mt-6 max-w-90 text-[13px] leading-6 text-muted">
					The page you’re looking for doesn’t exist or may have moved.
				</p>
				<button className={`${button.primary} mt-6`} type="button" onClick={() => goTo('dashboard')}>
					Back to dashboard
				</button>
			</div>
		</section>
	)
}
