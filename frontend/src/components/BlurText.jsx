// Adapted from the React Bits BlurText pattern for this Tailwind project.
export default function BlurText({ text, className = '' }) {
  return (
    <span className={className} aria-label={text}>
      {text.split('').map((character, index) => (
        <span
          key={`${character}-${index}`}
          aria-hidden="true"
          className="inline-block animate-[blur-in_420ms_var(--ease-out)_both]"
          style={{ animationDelay: `${index * 24}ms` }}
        >
          {character === ' ' ? '\u00a0' : character}
        </span>
      ))}
    </span>
  )
}
