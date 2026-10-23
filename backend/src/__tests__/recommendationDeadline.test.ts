import request from 'supertest'
import { app } from '../index'
import { llmClient } from '../clients/llm'
import { recommendationEngine, type Recommendation } from '../engine/recommendationEngine'
import { fetchWithTurnSignal, RECOMMENDATION_TURN_MS } from '../engine/turnDeadline'
import { validateSpec } from '../engine/requestSpec'

describe('POST /recommendations whole-turn deadline', () => {
  const saved = validateSpec({ countries: ['MY'], languages: ['ms'], format: 'movie', genres: ['Comedy'] })
  const result: Recommendation = {
    id: 'tt1234567', title: 'Checked film', year: '2025', type: 'movie',
    synopsis: 'A comedy.', posterUrl: '', score: 8
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network forbidden in route deadline tests'))
    jest.spyOn(llmClient, 'isEnabled').mockReturnValue(true)
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({
      operation: 'add', spec: { ...saved, countries: ['MY', 'ID'] }
    })
    jest.spyOn(llmClient, 'generateResultsIntro').mockResolvedValue(null)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it.each([false, true])('responds at the deadline without waiting for a late retrieval (saved state: %s)', async hasSaved => {
    let started: () => void = () => { throw new Error('Missing start') }
    const began = new Promise<void>(resolve => { started = resolve })
    let finish: (titles: Recommendation[]) => void = () => { throw new Error('Missing finish') }
    jest.spyOn(recommendationEngine, 'getRecommendations').mockImplementation(() => {
      started()
      return new Promise(resolve => { finish = resolve })
    })
    const responsePromise = request(app).post('/recommendations').send({
      description: 'Malaysian comedy films',
      ...(hasSaved ? {
        spec: saved,
        clarificationContext: { clarificationRound: 1, userClarification: 'include Indonesian films too' }
      } : {})
    }).then(response => response)
    await began
    await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS - 1)
    let responded = false
    void responsePromise.then(() => { responded = true })
    expect(responded).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(response.body.requestDiagnostics).toMatchObject({ outcome: 'timed_out', deadlineMs: 15000, elapsedMs: 15000 })
    expect(response.body.requiresClarification.questions[0].id).toBe('search_timeout')
    expect(response.body.requiresClarification.context).toContain("doesn't mean there are no matches")
    expect(response.body.recommendations).toBeUndefined()
    expect(response.body.spec).toEqual(hasSaved ? saved : undefined)
    finish([result])
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(llmClient.generateResultsIntro).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('aborts retrieval and never starts empty-result widening after the deadline', async () => {
    let started: () => void = () => { throw new Error('Missing start') }
    const began = new Promise<void>(resolve => { started = resolve })
    let aborted = false
    jest.mocked(global.fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(init.signal?.reason)
      }, { once: true })
      started()
    }))
    jest.spyOn(recommendationEngine, 'getRecommendations').mockImplementation(async () => {
      await fetchWithTurnSignal('https://example.invalid/catalogue')
      return []
    })
    const preview = jest.spyOn(recommendationEngine, 'previewRecommendations').mockResolvedValue([])
    const responsePromise = request(app).post('/recommendations').send({
      description: 'Malaysian comedy films', spec: saved,
      clarificationContext: { clarificationRound: 1, userClarification: 'include Indonesian films too' }
    }).then(response => response)
    await began
    await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS)
    const response = await responsePromise
    expect(aborted).toBe(true)
    expect(response.body.spec).toEqual(saved)
    expect(preview).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('clears the turn timer for normal and invalid responses', async () => {
    jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue([result])
    const response = await request(app).post('/recommendations').send({
      description: 'Malaysian comedy films', spec: saved,
      clarificationContext: { clarificationRound: 1, userClarification: 'include Indonesian films too' }
    })
    expect(response.body.recommendations).toHaveLength(1)
    expect(response.body.spec.countries).toEqual(['MY', 'ID'])
    expect(response.body.requestDiagnostics).toMatchObject({ outcome: 'completed', deadlineMs: 15000 })
    expect(jest.getTimerCount()).toBe(0)
    expect((await request(app).post('/recommendations').send({ description: '' })).status).toBe(400)
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each([false, true])('stops provider work when the HTTP client disconnects (streaming: %s)', async streaming => {
    let started: () => void = () => { throw new Error('Missing start') }
    const began = new Promise<void>(resolve => { started = resolve })
    let cancelled: () => void = () => { throw new Error('Missing cancel') }
    const stopped = new Promise<void>(resolve => { cancelled = resolve })
    jest.mocked(global.fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        cancelled()
        reject(init.signal?.reason)
      }, { once: true })
      started()
    }))
    jest.spyOn(recommendationEngine, 'getRecommendations').mockImplementation(async () => {
      await fetchWithTurnSignal('https://example.invalid/catalogue')
      return []
    })
    const server = app.listen(0)
    await new Promise<void>(resolve => server.once('listening', resolve))
    const call = request(server).post('/recommendations').set('Accept', streaming ? 'text/event-stream' : 'application/json')
      .send({ description: 'Malaysian comedy films' })
    try {
      call.end(() => {})
      await began
      call.abort()
      await stopped
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(jest.getTimerCount()).toBe(0)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    } finally {
      call.abort()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
