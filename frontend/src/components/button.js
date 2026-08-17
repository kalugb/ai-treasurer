const base = 'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-transparent px-[15px] text-[13px] font-bold transition-[transform,background-color,border-color] duration-200 ease-out hover:-translate-y-[1px] focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2'

export const button = {
  primary: `${base} bg-blue text-white hover:bg-blue-dark`,
  secondary: `${base} bg-blue-soft text-blue`,
  quiet: `${base} bg-transparent px-0 text-blue`,
}
