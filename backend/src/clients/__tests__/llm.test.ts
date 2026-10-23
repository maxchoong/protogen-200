import OpenAI from 'openai'
import { LLMClient, RECOMMENDATION_LLM_WINDOW_MS } from '../llm'

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn()
}))

describe('LLM provider configuration', () => {
  const originalEnvironment = { ...process.env }
  const createCompletion = jest.fn()
  const mockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>

  beforeEach(() => {
    process.env = { ...originalEnvironment }
    for (const name of ['GITHUB_TOKEN', 'OPENAI_API_KEY', 'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL']) {
      delete process.env[name]
    }
    jest.clearAllMocks()
    createCompletion.mockReset()
    mockOpenAI.mockImplementation(() => ({
      chat: { completions: { create: createCompletion } }
    } as unknown as OpenAI))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = originalEnvironment
  })

  it('does not use a GitHub token with the retired service or a different provider', async () => {
    process.env.GITHUB_TOKEN = 'test-github-token'
    const client = new LLMClient()

    expect(client.isEnabled()).toBe(false)
    expect(await client.parsePreferences('A relaxing film')).toBeNull()
    expect(mockOpenAI).not.toHaveBeenCalled()
  })

  it('uses OpenAI defaults with a separately configured API key', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"mood":["Relaxing"],"referenceSuggestions":["Solaris"]}' } }]
    })
    const client = new LLMClient()

    expect(client.isEnabled()).toBe(true)
    expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-openai-key', baseURL: 'https://api.openai.com/v1'
    }))
    expect(await client.parsePreferences('Like Inception but more relaxing')).toEqual(
      expect.objectContaining({ mood: ['Relaxing'], referenceSuggestions: ['Solaris'] })
    )
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-mini' }), expect.objectContaining({
      timeout: 15000, maxRetries: 0, signal: expect.any(AbortSignal)
    }))
  })

  it('uses explicit compatible-provider credentials, endpoint, and model for explanations', async () => {
    process.env.OPENAI_API_KEY = 'unused-openai-key'
    process.env.LLM_API_KEY = 'test-provider-key'
    process.env.LLM_BASE_URL = 'https://example.com/v1'
    process.env.LLM_MODEL = 'provider-model'
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"1":"A thoughtful memory story."}' } }]
    })
    const client = new LLMClient()

    expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-provider-key', baseURL: 'https://example.com/v1'
    }))
    const explanations = await client.generateWhyThisBatch('A thoughtful film', [
      { title: 'Solaris', genre: 'Sci-Fi', plot: 'A psychologist confronts memories.' }
    ])
    expect(explanations.get('Solaris')).toBe('A thoughtful memory story.')
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'provider-model' }), expect.objectContaining({
      maxRetries: 0
    }))
  })

  it.each(['https://models.inference.ai.azure.com', 'https://models.github.ai/inference'])(
    'rejects the retired GitHub endpoint %s', baseURL => {
      process.env.LLM_API_KEY = 'test-key'
      process.env.LLM_BASE_URL = baseURL
      expect(new LLMClient().isEnabled()).toBe(false)
      expect(mockOpenAI).not.toHaveBeenCalled()
    }
  )

  it('falls back if a configured provider request fails', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    createCompletion.mockRejectedValue(new Error('Connection error'))
    const client = new LLMClient()

    expect(await client.parsePreferences('A relaxing film')).toBeNull()
    expect(await client.generateWhyThisBatch('A relaxing film', [
      { title: 'Solaris', genre: 'Sci-Fi', plot: 'A psychologist confronts memories.' }
    ])).toEqual(new Map())
  })

  it('does not return fallback-only clarification as LLM output', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    createCompletion.mockResolvedValue({ choices: [{ message: { content: '{}' } }] })
    const result = await new LLMClient().generateConversationalClarification('A film', [{
      id: 'mood',
      question: 'What kind of mood?',
      type: 'select',
      options: ['Light', 'Thoughtful']
    }])

    expect(result).toBeNull()
  })

  it('validates creator hints and restricts cross-role fallback to director-primary requests', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    createCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      creators: [
        { name: ' James Cameron ', role: 'director', allowOtherRoles: true },
        { name: 'Nora Ephron', role: 'writer', allowOtherRoles: true },
        { name: 'Invalid Role', role: 'celebrity' }, null, { name: 123, role: 'director' }
      ]
    }) } }] })
    const hints = await new LLMClient().parsePreferences('Films by James Cameron and written by Nora Ephron')
    expect(hints?.creators).toEqual([
      { name: 'James Cameron', role: 'director', allowOtherRoles: true },
      { name: 'Nora Ephron', role: 'writer', allowOtherRoles: false }
    ])
    expect(createCompletion.mock.calls[0][0].messages[0].content).toContain('unqualified request')
  })

  it('supplies actual creator roles rather than inferring direction from talent scores', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    createCompletion.mockResolvedValue({ choices: [{ message: { content: '{"1":"James Cameron has a producing credit."}' } }] })
    const explanations = await new LLMClient().generateWhyThisBatch('Films by James Cameron', [{
      title: 'Producer Pick', genre: 'Drama', plot: 'A story.', talentMatchScore: 0.6,
      creatorCredits: [{ name: 'James Cameron', roles: ['producer'] }]
    }])
    expect(explanations.get('Producer Pick')).toContain('producing credit')
    expect(createCompletion.mock.calls[0][0].messages[1].content).toContain('James Cameron: producer')
  })

  it('returns the structured request with the previous request and turns in the prompt', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"operation":"add","spec":{"countries":["MY","ID"]}}' } }]
    })
    const client = new LLMClient()

    const result = await client.parseRequestSpec({
      latestTurn: 'What about Indonesian films too?',
      earlierTurns: ['Malaysian movies'],
      previousSpec: { countries: ['MY'] },
      today: new Date('2026-10-15T00:00:00Z')
    })

    expect(result).toEqual({ operation: 'add', spec: { countries: ['MY', 'ID'] } })
    const [body, options] = createCompletion.mock.calls[0]
    expect(body.messages[0].content).toContain('Today is 2026-10-15')
    expect(body.messages[0].content).toContain('Keep previous genres alongside the new ones')
    expect(body.messages[0].content).toContain('replaces only countries')
    expect(body.messages[1].content).toContain('Previous request: {"countries":["MY"]}')
    expect(body.messages[1].content).toContain('- Malaysian movies')
    expect(options).toMatchObject({ timeout: 8000, maxRetries: 0, signal: expect.any(AbortSignal) })
  })

  it('returns null for malformed request understanding', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    createCompletion.mockResolvedValue({ choices: [{ message: { content: '[1,2]' } }] })
    const client = new LLMClient()

    expect(await client.parseRequestSpec({ latestTurn: 'Nordic noir' })).toBeNull()
  })

  it('skips further calls for a cooldown after a rate limit', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    createCompletion.mockRejectedValue(Object.assign(new Error('429 status code (no body)'), { status: 429 }))
    const client = new LLMClient()

    expect(await client.parseRequestSpec({ latestTurn: 'Nordic noir' })).toBeNull()
    expect(await client.parseRequestSpec({ latestTurn: 'Korean thrillers' })).toBeNull()
    expect(createCompletion).toHaveBeenCalledTimes(1)
  })

  it('shares one elapsed deadline across understanding and optional stages, including retrieval time', async () => {
    jest.useFakeTimers()
    process.env.OPENAI_API_KEY = 'test-key'
    createCompletion
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"operation":"new","spec":{"genres":["Comedy"]}}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"1":"A warm comedy."}' } }] })
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      await jest.advanceTimersByTimeAsync(1000)
      expect(await client.parseRequestSpec({ latestTurn: 'Comedy films' })).not.toBeNull()
      expect(createCompletion.mock.calls[0][1].timeout).toBe(3000)
      await jest.advanceTimersByTimeAsync(2500)
      await client.generateWhyThisBatch('Comedy films', [{ title: 'A film', genre: 'Comedy', plot: 'A funny story.' }])
      expect(createCompletion.mock.calls[1][1].timeout).toBe(500)
      await jest.advanceTimersByTimeAsync(500)
      expect(await client.generateResultsIntro('Comedy films', 'Comedy', ['A film'])).toBeNull()
      expect(createCompletion).toHaveBeenCalledTimes(2)
      expect(client.getRequestDiagnostics()).toEqual({
        budgetExhausted: true,
        failures: [{ stage: 'results introduction', reason: 'deadline', elapsedMs: 0 }]
      })
      expect(jest.getTimerCount()).toBe(0)
    })
    expect(client.getRequestDiagnostics()).toEqual({})
  })

  it('aborts in-flight understanding at the shared deadline and never retries or starts later stages', async () => {
    jest.useFakeTimers()
    process.env.OPENAI_API_KEY = 'test-key'
    createCompletion.mockImplementation((_body, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('Transport aborted')), { once: true })
      })
    )
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      const result = client.parseRequestSpec({ latestTurn: 'Korean movies' })
      await jest.advanceTimersByTimeAsync(RECOMMENDATION_LLM_WINDOW_MS - 1)
      expect(createCompletion.mock.calls[0][1].signal.aborted).toBe(false)
      await jest.advanceTimersByTimeAsync(1)
      expect(await result).toBeNull()
      expect(createCompletion.mock.calls[0][1].signal.aborted).toBe(true)
      await client.parsePreferences('Korean movies')
      expect(createCompletion).toHaveBeenCalledTimes(1)
      expect(client.getRequestDiagnostics()).toEqual({
        budgetExhausted: true,
        failures: [
          { stage: 'request understanding', reason: 'deadline', elapsedMs: 4000 },
          { stage: 'preference parsing', reason: 'deadline', elapsedMs: 0 }
        ]
      })
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  it('rejects late transport output rather than caching an expired understanding', async () => {
    jest.useFakeTimers()
    process.env.OPENAI_API_KEY = 'test-key'
    createCompletion.mockImplementation(async () => {
      await jest.advanceTimersByTimeAsync(RECOMMENDATION_LLM_WINDOW_MS + 1)
      return { choices: [{ message: { content: '{"operation":"new","spec":{"genres":["Comedy"]}}' } }] }
    })
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      expect(await client.parseRequestSpec({ latestTurn: 'Comedy films' })).toBeNull()
      expect(client.getRequestDiagnostics().budgetExhausted).toBe(true)
    })
    expect(client.getCacheStats().size).toBe(0)
  })

  it('classifies a fractional remaining-window abort as budget exhaustion, not a provider timeout', async () => {
    jest.useFakeTimers()
    let now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    process.env.OPENAI_API_KEY = 'test-key'
    createCompletion.mockImplementation((_body, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
      })
    )
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      now = 0.5
      const result = client.parseRequestSpec({ latestTurn: 'Comedy films' })
      expect(createCompletion.mock.calls[0][1].timeout).toBe(3999)
      now = 3999.5
      await jest.advanceTimersByTimeAsync(3999)
      expect(await result).toBeNull()
      expect(client.getRequestDiagnostics()).toMatchObject({
        budgetExhausted: true, failures: [{ stage: 'request understanding', reason: 'deadline' }]
      })
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  it('allows cached understanding after the network window expires without another provider call', async () => {
    jest.useFakeTimers()
    process.env.OPENAI_API_KEY = 'test-key'
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"operation":"new","spec":{"genres":["Comedy"]}}' } }]
    })
    const client = new LLMClient()
    await client.parseRequestSpec({ latestTurn: 'Comedy films' })
    await client.withRequestBudget(async () => {
      await jest.advanceTimersByTimeAsync(4001)
      expect(await client.parseRequestSpec({ latestTurn: 'Comedy films' })).not.toBeNull()
      expect(client.getRequestDiagnostics()).toEqual({})
    })
    expect(createCompletion).toHaveBeenCalledTimes(1)
  })

  it('gates every uncached LLM stage after the shared window, preserving their fallback shapes', async () => {
    jest.useFakeTimers()
    process.env.OPENAI_API_KEY = 'test-key'
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      await jest.advanceTimersByTimeAsync(RECOMMENDATION_LLM_WINDOW_MS)
      expect(await client.parseRequestSpec({ latestTurn: 'Comedy' })).toBeNull()
      expect(await client.parsePreferences('Comedy')).toBeNull()
      expect(await client.generateWhyThis('Comedy', 'A film', 'Comedy', 'A funny story.')).toBeNull()
      expect(await client.generateWhyThisBatch('Comedy', [{ title: 'A film', genre: 'Comedy', plot: 'A funny story.' }])).toEqual(new Map())
      expect(await client.generateSpoilerFreeSynopsis('A film', 'A funny story.')).toBeNull()
      expect(await client.suggestActorTitleSeeds(['Tom Hanks'], 'Comedy')).toEqual([])
      expect(await client.generateConversationalClarification('Comedy', [{
        id: 'direction', question: 'Which direction?', type: 'select', options: ['Comedy', 'Drama']
      }])).toBeNull()
      expect(await client.generateResultsIntro('Comedy', 'Comedy', ['A film'])).toBeNull()
      expect(client.getRequestDiagnostics().failures?.map(failure => failure.stage)).toEqual([
        'request understanding', 'preference parsing', 'recommendation explanations',
        'recommendation explanations', 'synopsis generation', 'actor title recovery',
        'clarification wording', 'results introduction'
      ])
      expect(createCompletion).not.toHaveBeenCalled()
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  it('starts cooldown on the first 429 and resumes only after it expires', async () => {
    jest.useFakeTimers()
    process.env.OPENAI_API_KEY = 'test-key'
    createCompletion.mockRejectedValueOnce(Object.assign(new Error('Provider body must not appear in diagnostics'), { status: 429 }))
      .mockResolvedValue({ choices: [{ message: { content: '{"operation":"new","spec":{"genres":["Comedy"]}}' } }] })
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      await client.parseRequestSpec({ latestTurn: 'Comedy films' })
      await client.parsePreferences('Comedy films')
      expect(client.getRequestDiagnostics().failures).toEqual([
        { stage: 'request understanding', reason: 'rate_limit', status: 429, elapsedMs: 0 },
        { stage: 'preference parsing', reason: 'cooldown', elapsedMs: 0 }
      ])
    })
    expect(createCompletion.mock.calls[0][1].maxRetries).toBe(0)
    await jest.advanceTimersByTimeAsync(60_000)
    await client.withRequestBudget(async () => {
      expect(await client.parseRequestSpec({ latestTurn: 'Comedy films' })).not.toBeNull()
      expect(client.getRequestDiagnostics()).toEqual({})
    })
    expect(createCompletion).toHaveBeenCalledTimes(2)
  })

  it('keeps concurrent request deadlines and failure evidence isolated', async () => {
    jest.useFakeTimers()
    process.env.OPENAI_API_KEY = 'test-key'
    createCompletion.mockResolvedValue({ choices: [{ message: { content: '{"mood":["Happy"]}' } }] })
    const client = new LLMClient()
    let release: () => void = () => { throw new Error('Missing release callback') }
    const paused = new Promise<void>(resolve => { release = resolve })
    const first = client.withRequestBudget(async () => {
      await paused
      expect(await client.parsePreferences('expired request')).toBeNull()
      return client.getRequestDiagnostics()
    })
    await jest.advanceTimersByTimeAsync(4001)
    const second = client.withRequestBudget(async () => {
      release()
      expect(await client.parsePreferences('healthy concurrent request')).not.toBeNull()
      return client.getRequestDiagnostics()
    })
    expect((await first).budgetExhausted).toBe(true)
    expect(await second).toEqual({})
    expect(createCompletion).toHaveBeenCalledTimes(1)
  })

  it.each([
    { error: Object.assign(new Error('unavailable'), { status: 503 }), reason: 'provider_error', status: 503 },
    { error: Object.assign(new Error('timeout'), { name: 'APIConnectionTimeoutError' }), reason: 'timeout', status: undefined }
  ])('captures $reason evidence and clears the abort timer', async ({ error, reason, status }) => {
    process.env.OPENAI_API_KEY = 'test-key'
    createCompletion.mockRejectedValue(error)
    const client = new LLMClient()
    await client.withRequestBudget(async () => {
      expect(await client.parseRequestSpec({ latestTurn: 'Mystery series' })).toBeNull()
      expect(client.getRequestDiagnostics().failures).toEqual([
        expect.objectContaining({ stage: 'request understanding', reason, ...(status ? { status } : {}) })
      ])
    })
    expect(createCompletion).toHaveBeenCalledTimes(1)
  })
})