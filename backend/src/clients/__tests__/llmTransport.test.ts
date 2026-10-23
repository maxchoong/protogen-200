import { LLMClient, RECOMMENDATION_LLM_WINDOW_MS } from '../llm'
import { withTurnDeadline } from '../../engine/turnDeadline'

describe('LLM deadline with the real SDK and mocked transport', () => {
  const environment = { ...process.env }

  beforeEach(() => {
    process.env.LLM_API_KEY = 'test-only-key'
    process.env.LLM_BASE_URL = 'https://example.invalid/v1'
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    process.env = { ...environment }
  })

  it.each([429, 503])('dispatches once for HTTP %s, with no hidden SDK retry', async status => {
    const transport = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Mock provider failure' } }),
      { status, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }
    ))
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      expect(await client.parseRequestSpec({ latestTurn: 'French mysteries' })).toBeNull()
      expect(client.getRequestDiagnostics().failures).toEqual([
        expect.objectContaining({
          stage: 'request understanding', status, reason: status === 429 ? 'rate_limit' : 'provider_error'
        })
      ])
    })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('cancels the actual SDK fetch at the remaining deadline without orphaned work', async () => {
    jest.useFakeTimers()
    let aborted = false
    const transport = jest.spyOn(global, 'fetch').mockImplementation((_input, options) =>
      new Promise((_resolve, reject) => {
        const signal = options?.signal
        if (!signal) throw new Error('SDK did not forward an abort signal')
        signal.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('Mock fetch cancelled', 'AbortError'))
        }, { once: true })
      })
    )
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      const result = client.parseRequestSpec({ latestTurn: 'Korean dramas' })
      await jest.advanceTimersByTimeAsync(RECOMMENDATION_LLM_WINDOW_MS - 1)
      expect(aborted).toBe(false)
      await jest.advanceTimersByTimeAsync(1)
      expect(await result).toBeNull()
      expect(aborted).toBe(true)
      expect(transport).toHaveBeenCalledTimes(1)
      expect(client.getRequestDiagnostics()).toMatchObject({
        budgetExhausted: true,
        failures: [{ stage: 'request understanding', reason: 'deadline', elapsedMs: 4000 }]
      })
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  it('propagates turn disconnect through the real SDK without caching a fallback result', async () => {
      jest.useFakeTimers()
      const connection = new AbortController()
      const expired = jest.fn()
      let aborted = false
      const transport = jest.spyOn(global, 'fetch').mockImplementation((_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('Disconnected', 'AbortError'))
          }, { once: true })
        })
      )
      const client = new LLMClient()
      const run = withTurnDeadline(
        () => client.withRequestBudget(() => client.parseRequestSpec({ latestTurn: 'Korean dramas' })),
        expired, connection.signal
      )
      const stopped = expect(run).rejects.toMatchObject({ reason: 'disconnected' })
      await jest.advanceTimersByTimeAsync(100)
      connection.abort()
      await stopped
      expect(aborted).toBe(true)
      expect(transport).toHaveBeenCalledTimes(1)
      expect(expired).not.toHaveBeenCalled()
      expect(client.getCacheStats().size).toBe(0)
      expect(jest.getTimerCount()).toBe(0)
  })
})
