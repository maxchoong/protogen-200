import request from 'supertest'
import { app } from '../index'
import { llmClient } from '../clients/llm'
import { tmdbClient } from '../clients/tmdb'
import { recommendationEngine, type Recommendation } from '../engine/recommendationEngine'
import { fetchWithTurnSignal, RECOMMENDATION_TURN_MS, reportTurnStage } from '../engine/turnDeadline'
import { validateSpec } from '../engine/requestSpec'

const events = (text: string) => text.trim().split('\n\n').map(event => ({
  type: event.split('\n')[0].slice(7),
  data: JSON.parse(event.split('\ndata: ')[1])
}))
const title: Recommendation = {
  id: 'tt1234567', title: 'Checked comedy', year: '2025', type: 'movie', score: 8,
  synopsis: 'A warm story.', posterUrl: '', genres: ['Comedy']
}
const saved = validateSpec({ format: 'movie', genres: ['Comedy'], countries: ['MY'] })

describe('Progressive recommendation delivery', () => {
  beforeEach(() => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network forbidden in progressive delivery tests'))
    jest.spyOn(llmClient, 'isEnabled').mockReturnValue(true)
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({ operation: 'new', spec: saved })
    jest.spyOn(llmClient, 'generateResultsIntro').mockImplementation(() => new Promise(() => {}))
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('flushes progress before retrieval finishes, then sends one terminal response with committed state', async () => {
    let firstChunk: () => void = () => { throw new Error('Missing chunk resolver') }
    const progress = new Promise<void>(resolve => { firstChunk = resolve })
    let finish: (result: Recommendation[]) => void = () => { throw new Error('Missing retrieval resolver') }
    let began: () => void = () => { throw new Error('Missing start resolver') }
    const started = new Promise<void>(resolve => { began = resolve })
    jest.spyOn(recommendationEngine, 'getRecommendations').mockImplementation(() => {
      began()
      return new Promise(resolve => { finish = resolve })
    })
    let raw = ''
    const responsePromise = request(app).post('/recommendations').set('Accept', 'text/event-stream')
      .send({ description: 'Malaysian comedy movies' })
      .parse((res, done) => {
        res.on('data', chunk => { raw += chunk.toString(); firstChunk() })
        res.on('end', () => done(null, raw))
        res.on('error', done)
      }).then(response => response)
    await Promise.all([progress, started])
    expect(raw).toContain('event: progress')
    expect(raw).not.toContain('"spec"')
    expect(raw).not.toContain('event: response')
    finish([title])
    const response = await responsePromise
    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.headers['x-accel-buffering']).toBe('no')
    const received = events(raw)
    expect(received.map(event => event.type)).toEqual(['progress', 'progress', 'response'])
    expect(received[2].data).toMatchObject({
      success: true, spec: saved, recommendations: [title],
      requestDiagnostics: { outcome: 'completed', deadlineMs: 15000 }
    })
    expect(llmClient.generateResultsIntro).not.toHaveBeenCalled()
    expect(recommendationEngine.getRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ understandingAttempted: true }), 10, expect.any(Object), expect.any(Object))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('allows useful completion after five seconds and records real stage durations', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    jest.spyOn(recommendationEngine, 'getRecommendations').mockImplementation(async () => {
      await jest.advanceTimersByTimeAsync(6000)
      reportTurnStage('verification')
      await jest.advanceTimersByTimeAsync(1000)
      return [title]
    })
    const response = await request(app).post('/recommendations').send({ description: 'Malaysian comedy movies' })
    expect(response.body.requestDiagnostics).toEqual({
      outcome: 'completed', deadlineMs: 15000, elapsedMs: 7000,
      stages: [
        { stage: 'understanding', durationMs: 0 },
        { stage: 'retrieval', durationMs: 6000 },
        { stage: 'verification', durationMs: 1000 }
      ]
    })
    expect(response.body.recommendations).toEqual([title])
    expect(jest.getTimerCount()).toBe(0)
  })

  it('terminates an already-started stream at 15 seconds with the original saved request', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    let began: () => void = () => { throw new Error('Missing start resolver') }
    const started = new Promise<void>(resolve => { began = resolve })
    jest.mocked(llmClient.parseRequestSpec).mockResolvedValue({
      operation: 'add', spec: { ...saved, countries: ['MY', 'ID'] }
    })
    jest.mocked(global.fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      began()
    }))
    jest.spyOn(recommendationEngine, 'getRecommendations').mockImplementation(async () => {
      await fetchWithTurnSignal('https://example.invalid/catalogue')
      return []
    })
    const responsePromise = request(app).post('/recommendations').set('Accept', 'text/event-stream').send({
      description: 'Malaysian comedy movies', spec: saved,
      clarificationContext: { clarificationRound: 1, userClarification: 'Indonesian films too' }
    }).then(response => response)
    await started
    await jest.advanceTimersByTimeAsync(RECOMMENDATION_TURN_MS)
    const response = await responsePromise
    const received = events(response.text)
    const terminal = received.filter(event => event.type === 'response')
    expect(terminal).toHaveLength(1)
    expect(terminal[0].data).toMatchObject({
      spec: saved, requestDiagnostics: { outcome: 'timed_out', deadlineMs: 15000, elapsedMs: 15000 }
    })
    expect(terminal[0].data.requiresClarification.questions[0].id).toBe('search_timeout')
    expect(terminal[0].data.recommendations).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('reports an explicit terminal error after progress instead of leaving the stream open', async () => {
    jest.spyOn(recommendationEngine, 'getRecommendations').mockRejectedValue(new Error('Catalogue failure'))
    const response = await request(app).post('/recommendations').set('Accept', 'text/event-stream')
      .send({ description: 'Malaysian comedy movies' })
    const received = events(response.text)
    expect(received[received.length - 1]).toEqual({
      type: 'error', data: { success: false, message: 'Internal server error' }
    })
    expect(received.filter(event => event.type === 'error')).toHaveLength(1)
    expect(received.some(event => event.type === 'response')).toBe(false)
  })

  it('preserves validation errors for streamed callers', async () => {
    const response = await request(app).post('/recommendations').set('Accept', 'text/event-stream')
      .send({ description: '' })
    expect(response.status).toBe(400)
    expect(events(response.text)).toEqual([{
      type: 'error', data: { success: false, message: 'Provide a description or select at least one preference.' }
    }])
    expect(llmClient.parseRequestSpec).not.toHaveBeenCalled()
  })
})

describe('Lazy trailer endpoint', () => {
  afterEach(() => jest.restoreAllMocks())

  it.each(['movie', 'tv'])('resolves an IMDb %s trailer only when requested', async type => {
    const trailers = jest.spyOn(tmdbClient, 'getTrailersBatch').mockResolvedValue(new Map([['tt1234567', 'https://www.youtube.com/watch?v=checked']]))
    const response = await request(app).get(`/trailers/${type}/tt1234567`)
    expect(response.body).toEqual({ success: true, trailerUrl: 'https://www.youtube.com/watch?v=checked' })
    expect(trailers).toHaveBeenCalledWith([{ imdbId: 'tt1234567', type }])
  })

  it('supports unmapped TMDB titles and explicitly absent trailers', async () => {
    const videos = jest.spyOn(tmdbClient, 'getVideos').mockResolvedValue([])
    expect((await request(app).get('/trailers/movie/123')).body).toEqual({ success: true, trailerUrl: null })
    expect(videos).toHaveBeenCalledWith(123, 'movie')
  })

  it('rejects invalid identifiers without contacting a provider', async () => {
    const videos = jest.spyOn(tmdbClient, 'getVideos')
    for (const path of ['movie/0', 'tv/ttbad', 'series/123', 'movie/123abc']) {
      expect((await request(app).get(`/trailers/${path}`)).status).toBe(400)
    }
    expect(videos).not.toHaveBeenCalled()
  })

  it('reports provider errors rather than caching them as a missing trailer', async () => {
    jest.spyOn(tmdbClient, 'getVideos').mockRejectedValue(new Error('Unavailable'))
    const response = await request(app).get('/trailers/movie/123')
    expect(response.status).toBe(500)
    expect(response.body.success).toBe(false)
  })
})
