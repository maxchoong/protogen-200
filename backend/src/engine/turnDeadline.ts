import { AsyncLocalStorage } from 'node:async_hooks'

export const RECOMMENDATION_TURN_MS = 15000
export type TurnStage = 'understanding' | 'retrieval' | 'ranking' | 'verification' | 'catalogue_choices'
export interface TurnProgress {
  stage: TurnStage
  elapsedMs: number
}
export interface TurnDiagnostics {
  outcome: 'completed' | 'timed_out'
  deadlineMs: number
  elapsedMs: number
  stages: Array<{ stage: TurnStage; durationMs: number }>
}

export class TurnStoppedError extends Error {
  constructor(readonly reason: 'deadline' | 'disconnected') {
    super(`Recommendation turn stopped: ${reason}`)
    this.name = 'TurnStoppedError'
  }
}

interface TurnContext {
  started: number
  deadline: number
  controller: AbortController
  stop: (reason: TurnStoppedError['reason']) => void
  stages: Array<{ stage: TurnStage; started: number }>
  onProgress?: (progress: TurnProgress) => void
}

const turnContext = new AsyncLocalStorage<TurnContext>()

export async function withTurnDeadline<T>(
  work: () => Promise<T>,
  onDeadline: () => void,
  disconnected: AbortSignal,
  onProgress?: (progress: TurnProgress) => void
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const context: TurnContext = {
    started: performance.now(),
    deadline: performance.now() + RECOMMENDATION_TURN_MS,
    stages: [],
    onProgress,
    controller,
    stop: reason => {
      if (controller.signal.aborted) return
      console.warn(`[Turn] Stopping recommendation work: ${reason}`)
      controller.abort(new TurnStoppedError(reason))
      cleanup()
      if (reason === 'deadline') turnContext.run(context, onDeadline)
    }
  }
  const onDisconnect = () => context.stop('disconnected')
  const cleanup = () => {
    if (timer) clearTimeout(timer)
    disconnected.removeEventListener('abort', onDisconnect)
  }
  return turnContext.run(context, async () => {
    disconnected.addEventListener('abort', onDisconnect, { once: true })
    if (disconnected.aborted) onDisconnect()
    timer = setTimeout(() => context.stop('deadline'), RECOMMENDATION_TURN_MS)
    try {
      throwIfTurnStopped()
      const result = await work()
      throwIfTurnStopped()
      return result
    } finally {
      cleanup()
    }
  })
}

export function reportTurnStage(stage: TurnStage): void {
  throwIfTurnStopped()
  const context = turnContext.getStore()
  if (!context || context.stages[context.stages.length - 1]?.stage === stage) return
  const now = performance.now()
  context.stages.push({ stage, started: now })
  context.onProgress?.({ stage, elapsedMs: Math.round(now - context.started) })
}

export function getTurnDiagnostics(outcome: TurnDiagnostics['outcome']): TurnDiagnostics | undefined {
  const context = turnContext.getStore()
  if (!context) return undefined
  const now = performance.now()
  return {
    outcome,
    deadlineMs: RECOMMENDATION_TURN_MS,
    elapsedMs: Math.round(now - context.started),
    stages: context.stages.map((entry, index) => ({
      stage: entry.stage,
      durationMs: Math.round((context.stages[index + 1]?.started ?? now) - entry.started)
    }))
  }
}

export function throwIfTurnStopped(): void {
  const context = turnContext.getStore()
  if (!context) return
  if (performance.now() >= context.deadline) context.stop('deadline')
  context.controller.signal.throwIfAborted()
}

export function turnSignal(signal?: AbortSignal | null): AbortSignal | undefined {
  throwIfTurnStopped()
  const requestSignal = turnContext.getStore()?.controller.signal
  return requestSignal && signal ? AbortSignal.any([requestSignal, signal]) : requestSignal || signal || undefined
}

/** The request signal remains live through response-body consumption. */
export async function fetchWithTurnSignal(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const response = await globalThis.fetch(input, { ...init, signal: turnSignal(init?.signal) })
  throwIfTurnStopped()
  return response
}
