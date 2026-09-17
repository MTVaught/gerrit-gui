const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const RefreshIcon = () => (
  <svg {...common}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
)

export const ShrinkIcon = () => (
  <svg {...common}>
    <path d="M4 14h6v6" />
    <path d="M20 10h-6V4" />
    <path d="M14 10l7-7" />
    <path d="M3 21l7-7" />
  </svg>
)

export const ExpandIcon = () => (
  <svg {...common}>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </svg>
)

/** A padlock, for the Private badge. */
export const LockIcon = () => (
  <svg {...common}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

export const GearIcon = () => (
  <svg {...common}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)

/** Git branch glyph for changes that exist on several branches. */
export const ForkIcon = () => (
  <svg {...common} width={14} height={14}>
    <circle cx="6" cy="4" r="2.5" />
    <circle cx="6" cy="20" r="2.5" />
    <circle cx="18" cy="8" r="2.5" />
    <path d="M6 6.5v11" />
    <path d="M18 10.5c0 4-12 2-12 7" />
  </svg>
)

export const DownloadIcon = () => (
  <svg {...common}>
    <path d="M12 3v13" />
    <path d="m7 11 5 5 5-5" />
    <path d="M4 21h16" />
  </svg>
)

/** Circular arrow with a check: the update is on disk, a restart applies it. */
export const RestartIcon = () => (
  <svg {...common}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

/** Two sliders: the View menu with search, filter and sort. */
export const SlidersIcon = () => (
  <svg {...common} width={14} height={14}>
    <path d="M4 7h9" />
    <path d="M17 7h3" />
    <path d="M4 17h3" />
    <path d="M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
)

/** A plug: the connection window. */
export const PlugIcon = () => (
  <svg {...common} width={14} height={14}>
    <path d="M9 2v6M15 2v6" />
    <path d="M6 8h12v4a6 6 0 0 1-12 0z" />
    <path d="M12 18v4" />
  </svg>
)

/** A luggage tag: the trailers of the commit message. */
export const TagIcon = () => (
  <svg {...common} width={11} height={11} strokeWidth={2.2}>
    <path d="M3 12V4h8l10 10-8 8z" />
    <circle cx="7.5" cy="8.5" r="1.2" fill="currentColor" />
  </svg>
)
