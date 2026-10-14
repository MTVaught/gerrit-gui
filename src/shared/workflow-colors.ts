import type { ReviewState } from './types.ts'

/** Semantic colors shared by CSS state indicators and solid tray badges. */
export const WORKFLOW_COLORS = {
  fix: { solid: '#dc2626', light: ['#b91c1c', '#fee2e2'], dark: ['#f87171', '#7f1d1d55'] },
  merge: { solid: '#7c3aed', light: ['#7c3aed', '#ede9fe'], dark: ['#c4b5fd', '#4c1d9555'] },
  approved: { solid: '#15803d', light: ['#15803d', '#dcfce7'], dark: ['#4ade80', '#14532d55'] },
  review: { solid: '#3730a3', light: ['#3730a3', '#eef2ff'], dark: ['#c7d2fe', '#312e8155'] },
  iterating: { solid: '#b45309', light: ['#b45309', '#fef3c7'], dark: ['#fbbf24', '#78350f55'] },
  progress: { solid: '#6b7280', light: ['#6b7280', '#f1f4f9'], dark: ['#9aa0ad', '#222734'] },
} as const

export type WorkflowColor = keyof typeof WORKFLOW_COLORS

export const STATE_COLORS = {
  'needs-changes': 'fix',
  'ready-to-merge': 'merge',
  approved: 'approved',
  'needs-review': 'review',
  'in-person-review': 'review',
  iterating: 'iterating',
  'in-progress': 'progress',
} as const satisfies Partial<Record<ReviewState, WorkflowColor>>

const SEGMENT_COLORS: Record<string, WorkflowColor> = {
  neg: 'fix', merge: 'merge', pos: 'approved', pending: 'review',
  hot: 'review', plain: 'review', iterating: 'iterating', wip: 'progress',
}

/** Keep theme values and state selectors in sync without a browser dependency. */
export function workflowColorCss(): string {
  const themes = (['light', 'dark'] as const).map(theme => {
    const selector = theme === 'light' ? ':root' : ':root[data-theme="dark"]'
    const vars = Object.entries(WORKFLOW_COLORS).map(([key, colors]) =>
      `--state-${key}:${colors[theme][0]};--state-${key}-bg:${colors[theme][1]};`).join('')
    return `${selector}{${vars}}`
  })
  const states = Object.entries(STATE_COLORS).map(([state, color]) => `
    .change.state-${state}, .ledger tr.state-${state} td.c { border-left-color:var(--state-${color}); }
    .badge.${state} { color:var(--state-${color}); background:var(--state-${color}-bg); }
  `)
  const segments = Object.entries(SEGMENT_COLORS).map(([tone, color]) =>
    `.count.split > .${tone}{color:var(--state-${color});background:var(--state-${color}-bg);}`)
  return [...themes, ...states, ...segments,
    '.ledger .next-hint{color:var(--state-review);}',
    '.tab .count.hot{background:var(--state-review);color:var(--bg);}'].join('\n')
}
