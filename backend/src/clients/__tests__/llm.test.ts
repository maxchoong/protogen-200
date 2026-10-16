import OpenAI from 'openai'
import { LLMClient } from '../llm'

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
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-mini' }))
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
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'provider-model' }))
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
    expect(options).toEqual({ timeout: 8000, maxRetries: 1 })
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
})