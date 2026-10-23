import { fetchWithTurnSignal, RECOMMENDATION_TURN_MS, throwIfTurnStopped, TurnStoppedError, turnSignal, withTurnDeadline } from '../turnDeadline'
import { TMDBClient } from '../../clients/tmdb'
import { FMDBClient } from '../../clients/fmdb'

describe('Recommendation turn deadline and catalogue cancellation', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected network request'))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const disconnected = () => new AbortController()

  it('aborts a stalled fetch at the overall deadline, reports expiry once and clears timers', async () => {
    const expired = jest.fn()
    let signal: AbortSignal | null | undefined
    jest.mocked(global.fetch).mockImplementation((_url, init) => {
      signal = init?.signal
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }))
    })
    const run = withTurnDeadline(async () => {
      await fetchWithTurnSignal('https://example.invalid/catalogue')
    }, expired, disconnected().signal)
    const stopped = expect(run).rejects.toMatchObject({ reason: 'deadline' })
    await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS - 1)
    expect(expired).not.toHaveBeenCalled()
    expect(signal?.aborted).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    await stopped
    expect(signal?.aborted).toBe(true)
    expect(expired).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps cancellation active while response headers have arrived but JSON is stalled', async () => {
    const expired = jest.fn()
    jest.mocked(global.fetch).mockImplementation(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"results":'))
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true })
      }
    })))
    const run = withTurnDeadline(async () => {
      const response = await fetchWithTurnSignal('https://example.invalid/catalogue')
      return response.json()
    }, expired, disconnected().signal)
    const stopped = expect(run).rejects.toBeInstanceOf(TurnStoppedError)
    await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS)
    await stopped
    expect(expired).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each(['tmdb', 'omdb'] as const)('rejects late %s body data without poisoning its details cache', async provider => {
    const tmdb = new TMDBClient()
    jest.spyOn(tmdb, 'isEnabled').mockReturnValue(true)
    const omdb = new FMDBClient()
    const details = async () => provider === 'tmdb' ? await tmdb.getTitleDetails(123, 'movie') : await omdb.getDetails('tt1234567')
    const data = provider === 'tmdb'
      ? { id: 123, title: 'Recovered film', release_date: '2025-01-01', genres: [] }
      : { imdbID: 'tt1234567', Title: 'Recovered film', Type: 'movie', Year: '2025', Response: 'True' }
    const response = new Response('{}')
    jest.spyOn(response, 'json').mockImplementation(async () => {
      await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS)
      return data
    })
    jest.mocked(global.fetch).mockResolvedValueOnce(response).mockResolvedValue(new Response(JSON.stringify(data)))
    await expect(withTurnDeadline(details, jest.fn(), disconnected().signal)).rejects.toBeInstanceOf(TurnStoppedError)
    await expect(details()).resolves.not.toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('cancels on disconnect without sending a deadline reply', async () => {
    const connection = disconnected()
    const expired = jest.fn()
    const removeListener = jest.spyOn(connection.signal, 'removeEventListener')
    jest.mocked(global.fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const run = withTurnDeadline(() => fetchWithTurnSignal('https://example.invalid/catalogue'), expired, connection.signal)
    const stopped = expect(run).rejects.toMatchObject({ reason: 'disconnected' })
    connection.abort()
    await stopped
    expect(expired).not.toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(jest.getTimerCount()).toBe(0)
  })

  it('clears deadline/listener on successful and failed work without changing standalone fetch behavior', async () => {
    const expired = jest.fn()
    const connection = disconnected()
    const removeListener = jest.spyOn(connection.signal, 'removeEventListener')
    await expect(withTurnDeadline(async () => 'done', expired, connection.signal)).resolves.toBe('done')
    await expect(withTurnDeadline(async () => { throw new Error('ordinary failure') }, expired, connection.signal))
      .rejects.toThrow('ordinary failure')
    expect(jest.getTimerCount()).toBe(0)
    expect(removeListener).toHaveBeenCalledTimes(2)
    expect(turnSignal()).toBeUndefined()
    expect(() => throwIfTurnStopped()).not.toThrow()
    await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS)
    expect(expired).not.toHaveBeenCalled()
  })

  it('combines provider and turn signals without weakening the earlier provider timeout', async () => {
    const provider = new AbortController()
    const expired = jest.fn()
    await withTurnDeadline(async () => {
      const signal = turnSignal(provider.signal)
      provider.abort(new Error('Provider limit'))
      expect(signal?.aborted).toBe(true)
      expect(signal?.reason.message).toBe('Provider limit')
      expect(() => throwIfTurnStopped()).not.toThrow()
    }, expired, disconnected().signal)
    expect(expired).not.toHaveBeenCalled()
  })

  it('detects elapsed deadlines even before the timer callback gets an event-loop turn', async () => {
    const expired = jest.fn()
    let now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    await expect(withTurnDeadline(async () => {
      now = RECOMMENDATION_TURN_MS
      throwIfTurnStopped()
    }, expired, disconnected().signal)).rejects.toMatchObject({ reason: 'deadline' })
    expect(expired).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('does not accept late fetches or start fallback calls after expiry', async () => {
    jest.mocked(global.fetch).mockImplementation(async () => {
      await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS)
      return new Response('{}')
    })
    await expect(withTurnDeadline(async () => {
      try {
        await fetchWithTurnSignal('https://example.invalid/catalogue')
      } catch {
        await fetchWithTurnSignal('https://example.invalid/fallback')
      }
    }, jest.fn(), disconnected().signal)).rejects.toBeInstanceOf(TurnStoppedError)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('isolates a timed-out turn from a later concurrent request', async () => {
    let release: () => void = () => { throw new Error('Missing release') }
    const wait = new Promise<void>(resolve => { release = resolve })
    const first = withTurnDeadline(async () => {
      await wait
      throwIfTurnStopped()
    }, jest.fn(), disconnected().signal)
    const stopped = expect(first).rejects.toBeInstanceOf(TurnStoppedError)
    await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS)
    await withTurnDeadline(async () => {
      release()
      expect(() => throwIfTurnStopped()).not.toThrow()
    }, jest.fn(), disconnected().signal)
    await stopped
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each(['tmdb', 'omdb'] as const)('does not cache cancelled %s details as a negative result', async provider => {
    const tmdb = new TMDBClient()
    jest.spyOn(tmdb, 'isEnabled').mockReturnValue(true)
    const omdb = new FMDBClient()
    const details = async () => provider === 'tmdb' ? await tmdb.getTitleDetails(123, 'movie') : await omdb.getDetails('tt1234567')
    jest.mocked(global.fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const run = withTurnDeadline(details, jest.fn(), disconnected().signal)
    const stopped = expect(run).rejects.toBeInstanceOf(TurnStoppedError)
    await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS)
    await stopped
    jest.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify(provider === 'tmdb'
      ? { id: 123, title: 'Recovered film', release_date: '2025-01-01', genres: [] }
      : { imdbID: 'tt1234567', Title: 'Recovered film', Type: 'movie', Year: '2025', Response: 'True' }
    )))
    await expect(details()).resolves.not.toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
