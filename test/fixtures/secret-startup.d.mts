import type { ChildProcess } from 'node:child_process'
export interface StartupEvent {
  at: number
  event: string
  path?: string
  snapshot?: Record<string, unknown>
  mode?: string
}
export interface BrowserProcess {
  child: ChildProcess
  startedAt: number
  auditFile: string
  readonly output: string
  readonly launchUrl: string
  exited: Promise<{ code: number | null; signal: string | null }>
  stop(): Promise<{ code: number | null; signal: string | null }>
  ready(): Promise<{ at: number; events: StartupEvent[] }>
  call(method: string, args?: unknown[]): Promise<{ status: number; body: Record<string, unknown> }>
}
export const identity: { serverUrl: string; username: string }
export const legacy: Record<string, unknown>
export function audit(file: string): Promise<StartupEvent[]>
export function unusedPort(): Promise<number>
export function startBrowser(file: string, extra?: NodeJS.ProcessEnv, web?: boolean): Promise<BrowserProcess>
