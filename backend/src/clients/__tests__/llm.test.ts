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
})