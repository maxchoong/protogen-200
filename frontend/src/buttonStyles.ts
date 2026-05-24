type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost' | 'chip' | 'link'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const baseButtonClass = [
  'inline-flex items-center justify-center rounded-pill',
  'font-medium',
  'transition-colors duration-150',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
  'disabled:opacity-50 disabled:cursor-not-allowed'
].join(' ')

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-7 px-3 text-xs',
  sm: 'h-8 px-3.5 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-sm font-semibold',
  icon: 'h-10 w-10 p-0',
  'icon-sm': 'h-8 w-8 p-0'
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90',
  secondary: 'border border-border bg-surface-2 text-text hover:border-border/90 hover:bg-surface',
  subtle: 'border border-border/80 bg-surface/60 text-text-muted hover:border-border hover:bg-surface-2/60 hover:text-text',
  ghost: 'bg-transparent text-text-muted hover:bg-surface-2/45 hover:text-text',
  chip: 'border border-border bg-surface text-text hover:border-border/90 hover:bg-surface-2',
  link: 'h-auto rounded-none bg-transparent px-0 text-accent underline underline-offset-2 hover:opacity-80'
}

export const buttonClass = ({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = ''
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
} = {}): string => {
  return [
    baseButtonClass,
    sizeClasses[size],
    variantClasses[variant],
    fullWidth ? 'w-full' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')
}

export const inlineLinkClass = (className = ''): string => {
  return [
    'rounded-sm text-text underline decoration-border/50 underline-offset-2 transition-colors',
    'hover:text-accent',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    className
  ]
    .filter(Boolean)
    .join(' ')
}
