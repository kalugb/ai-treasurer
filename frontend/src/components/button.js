const base = 'inline-flex min-h-10.5 items-center justify-center gap-2 rounded-lg border px-3.75 text-[13px] font-bold transition-[transform,background-color,border-color] duration-200 ease-out hover:-translate-y-0.25 focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2'

export const button = {
	primary: `${base} border-transparent bg-blue text-white hover:bg-blue-dark`,
	secondary: `${base} border-transparent bg-blue-soft text-blue`,
	danger: `${base} border-transparent bg-red-600 text-white hover:bg-red-700`,
	dangerSoft: `${base} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`,
	warning: `${base} border-transparent bg-brown-soft text-brown hover:bg-brown-soft/80`,
	outline: `${base} border-line bg-white text-ink hover:bg-paper`,
	quiet: `${base} border-transparent bg-transparent px-0 text-blue`,
}
