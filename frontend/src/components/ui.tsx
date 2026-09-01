import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

/* A small hand-rolled kit rather than a component library: the whole design is
   a document, and a generic card/button set fights that more than it helps. */

const VARIANTS = {
  primary: 'bg-ink text-paper hover:bg-ink/88 disabled:hover:bg-ink',
  seal: 'bg-seal-500 text-white hover:bg-seal-600 disabled:hover:bg-seal-500',
  outline: 'bg-transparent text-ink border border-rule-strong hover:bg-vellum',
  ghost: 'bg-transparent text-ink-soft hover:text-ink hover:bg-vellum',
} as const

export function Button({
  variant = 'primary',
  className = '',
  busy = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-medium
        transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}

export const Spinner = () => (
  <span
    aria-hidden
    className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
  />
)

export const Label = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`label ${className}`}>{children}</div>
)

export const Mono = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`font-mono text-[0.8125rem] ${className}`}>{children}</span>
)

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <Label className="mb-1.5">{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </label>
  )
}

const FIELD_STYLE =
  'w-full rounded-sm border border-rule bg-leaf px-3 py-2 text-sm text-ink placeholder:text-ink-faint ' +
  'focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/15'

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${FIELD_STYLE} ${props.className ?? ''}`} />
)

export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={`${FIELD_STYLE} font-serif text-[0.95rem] leading-relaxed ${props.className ?? ''}`} />
)

export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sheet rounded-sm ${className}`}>{children}</div>
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-sm border border-dashed border-rule-strong px-8 py-14 text-center">
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-vellum ${className}`} />
}

export function Callout({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'seal' | 'signed' | 'amber'
  children: ReactNode
}) {
  const tones = {
    neutral: 'border-rule bg-vellum text-ink-soft',
    seal: 'border-seal-200 bg-seal-50 text-seal-700',
    signed: 'border-signed-500/30 bg-signed-100 text-signed-700',
    amber: 'border-amber-500/30 bg-amber-100 text-amber-700',
  } as const
  return <div className={`rounded-sm border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
}
