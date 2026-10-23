import { buildCatalogueDirections, buildCatalogueWidening, resolveCatalogueChoice, CATALOGUE_CHOICE_WINDOW_MS } from '../catalogueChoices'
import { recommendationEngine, type Recommendation } from '../recommendationEngine'
import type { RecommendationRequest } from '../preferenceParser'
import { diffSpecs, validateSpec } from '../requestSpec'
import { RECOMMENDATION_TURN_MS, TurnStoppedError, withTurnDeadline } from '../turnDeadline'

const titles = (genre: string, count = 3): Recommendation[] => Array.from({ length: count }, (_, index) => ({
  id: `${genre}-${index}`, title: `${genre} ${index}`, year: '2025', type: 'movie',
  genres: [genre], synopsis: 'Catalogue evidence.', posterUrl: '', score: 8
}))

describe('Catalogue-backed choices', () => {
  let request: RecommendationRequest
  let sequence = 0

  beforeEach(() => {
    request = {
      description: `Catalogue request ${++sequence}`,
      spec: validateSpec({ countries: ['MY'], languages: ['ms'], format: 'movie', excludeGenres: ['Horror'] })
    }
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network forbidden in catalogue tests'))
    jest.spyOn(recommendationEngine, 'previewRecommendations').mockImplementation(async input => {
      if (!input.spec?.genres.length) return [...titles('Comedy'), ...titles('Drama')]
      return titles(input.spec.genres[0])
    })
  })

  afterEach(() => {
    expect(global.fetch).not.toHaveBeenCalled()
    jest.restoreAllMocks()
  })

  it.each([
    { countries: ['MY'], languages: ['ms'], format: 'movie' },
    { countries: ['MY', 'ID'], languages: [], format: 'movie' },
    { countries: ['JP'], languages: ['ja'], format: 'tv' },
    { countries: [], languages: ['pt'], format: 'tv' }
  ])('keeps active country, language, format and exclusions for $countries/$languages/$format', async spec => {
    request.spec = validateSpec({ ...spec, excludeGenres: ['Horror'] })
    const result = await buildCatalogueDirections(request)
    expect(result?.questions[0].options).toEqual(['Explore Comedy', 'Explore Drama'])
    const calls = jest.mocked(recommendationEngine.previewRecommendations).mock.calls
    expect(calls[0][1]).toBe(30)
    for (const [input, limit] of calls.slice(1)) {
      expect(input.spec).toMatchObject({ ...spec, excludeGenres: ['Horror'] })
      expect(limit).toBe(10)
      expect(diffSpecs(request.spec, input.spec!)).toEqual([expect.objectContaining({ field: 'genres' })])
    }
  })

  it.each(['Crime', 'Mystery', 'Sci-Fi', 'Animation', 'Documentary'])('derives %s rather than hard-coded mood bundles', async genre => {
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementation(async input =>
      input.spec?.genres.length ? titles(input.spec.genres[0]) : [...titles(genre), ...titles('Drama')]
    )
    expect((await buildCatalogueDirections(request))?.questions[0].options).toContain(`Explore ${genre}`)
  })

  it('rejects thin specialised paths and genre-relaxed lists, even after a promising broad preview', async () => {
    request.description = 'Malaysian critics favourites from 2025'
    request.spec = validateSpec({ ...request.spec, years: { min: 2025, max: 2025 } })
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementation(async input =>
      input.spec?.genres.length
        ? input.spec.genres[0] === 'Comedy' ? titles('Comedy', 2) : titles('Action', 10)
        : [...titles('Comedy'), ...titles('Drama')]
    )
    expect(await buildCatalogueDirections(request)).toBeUndefined()
  })

  it('does not count duplicate IDs or missing genre metadata as three matches', async () => {
    jest.mocked(recommendationEngine.previewRecommendations).mockResolvedValue([
      ...Array.from({ length: 10 }, () => titles('Comedy', 1)[0]),
      ...titles('Drama').map(title => ({ ...title, genres: undefined }))
    ])
    expect(await buildCatalogueDirections(request)).toBeUndefined()
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(1)
  })

  it('does not delay results for only one checked direction', async () => {
    jest.mocked(recommendationEngine.previewRecommendations).mockResolvedValue(titles('Comedy'))
    expect(await buildCatalogueDirections(request)).toBeUndefined()
  })

  it('does not promise three matches when the user requested fewer results', async () => {
    expect(await buildCatalogueDirections(request, 2)).toBeUndefined()
    expect((await buildCatalogueWidening(request, 2)).questions[0].type).toBe('text')
    expect(recommendationEngine.previewRecommendations).not.toHaveBeenCalled()
  })

  it('does not ask a redundant question when different genre labels produce the same titles', async () => {
    jest.mocked(recommendationEngine.previewRecommendations).mockResolvedValue(
      titles('Comedy').map(title => ({ ...title, genres: ['Comedy', 'Drama'] }))
    )
    expect(await buildCatalogueDirections(request)).toBeUndefined()
  })

  it('keeps bounded checks and offers at most three choices', async () => {
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementation(async input =>
      input.spec?.genres.length ? titles('Horror') : [
        ...titles('Action'), ...titles('Comedy'), ...titles('Crime'),
        ...titles('Drama'), ...titles('Family'), ...titles('Romance')
      ]
    )
    expect(await buildCatalogueDirections(request)).toBeUndefined()
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(6)
  })

  it('caches previews briefly, including full context and requested pool size', async () => {
    await buildCatalogueDirections(request)
    const firstCount = jest.mocked(recommendationEngine.previewRecommendations).mock.calls.length
    await buildCatalogueDirections(request)
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(firstCount)
    await buildCatalogueDirections({ ...request, region: 'US' })
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(firstCount * 2)
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001)
    await buildCatalogueDirections(request)
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(firstCount * 3)
  })

  it('surfaces catalogue errors instead of marking unknown checks viable', async () => {
    jest.mocked(recommendationEngine.previewRecommendations).mockRejectedValue(new Error('Catalogue unavailable'))
    await expect(buildCatalogueDirections(request)).rejects.toThrow('Catalogue unavailable')
  })

  it('does not cache a preview which completes after its whole-turn deadline', async () => {
    let now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementationOnce(async () => {
      now = RECOMMENDATION_TURN_MS
      return [...titles('Comedy'), ...titles('Drama')]
    })
    await expect(withTurnDeadline(
      () => buildCatalogueDirections(request), jest.fn(), new AbortController().signal
    )).rejects.toBeInstanceOf(TurnStoppedError)
    now = 0
    expect(await buildCatalogueDirections(request)).toBeDefined()
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(4)
  })

  it('stops after a slow broad preview without starting unverified genre paths', async () => {
    let now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementation(async () => {
      now += CATALOGUE_CHOICE_WINDOW_MS
      return [...titles('Comedy'), ...titles('Drama')]
    })
    expect(await buildCatalogueDirections(request)).toBeUndefined()
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(1)
  })

  it('requires two completed directions even if the preview scheduling window expires', async () => {
    let now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementation(async input => {
      if (!input.spec?.genres.length) return [...titles('Comedy'), ...titles('Drama')]
      now += CATALOGUE_CHOICE_WINDOW_MS
      return titles(input.spec.genres[0])
    })
    expect(await buildCatalogueDirections(request)).toBeUndefined()
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(2)
  })

  it('shows only completed widening checks with explicit incomplete-check wording', async () => {
    let now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementation(async () => {
      now += CATALOGUE_CHOICE_WINDOW_MS
      return titles('Comedy')
    })
    const result = await buildCatalogueWidening(request)
    expect(result.questions[0].options).toEqual(['Include any original language'])
    expect(result.context).toContain("didn't finish checking every alternative")
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(1)
  })

  it('does not describe expired, unchecked widening as a confirmed empty catalogue', async () => {
    let now = 0
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementation(async () => {
      now += CATALOGUE_CHOICE_WINDOW_MS
      return []
    })
    const result = await buildCatalogueWidening(request)
    expect(result.context).toContain("couldn't finish checking")
    expect(result.questions[0].options).toBeUndefined()
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(1)
  })

  it('evicts old previews instead of growing the process cache indefinitely', async () => {
    await buildCatalogueDirections(request)
    for (let index = 0; index < 51; index++) {
      await buildCatalogueDirections({ ...request, description: `${request.description} eviction ${index}` })
    }
    const count = jest.mocked(recommendationEngine.previewRecommendations).mock.calls.length
    await buildCatalogueDirections(request)
    expect(recommendationEngine.previewRecommendations).toHaveBeenCalledTimes(count + 3)
  })

  it('offers explicit widening of one dimension only, leaving the original request untouched', async () => {
    request.spec = validateSpec({
      ...request.spec, genres: ['Western'], years: { min: 2020 },
      dateRange: { from: '2020-01-01' }
    })
    const original = JSON.stringify(request.spec)
    const result = await buildCatalogueWidening(request)
    expect(result.questions[0].options).toHaveLength(3)
    expect(JSON.stringify(request.spec)).toBe(original)
    for (const [input] of jest.mocked(recommendationEngine.previewRecommendations).mock.calls) {
      expect(diffSpecs(request.spec, input.spec!)).toHaveLength(1)
    }
    const label = 'Include titles from any country'
    const selection = { ...request, clarificationContext: {
      clarificationRound: 1, userClarification: label, userTurns: [request.description, label]
    } }
    const resolved = resolveCatalogueChoice(result.questions[0].optionTokens![label], request.spec, label, selection)
    expect(resolved).toMatchObject({ operation: 'remove', spec: { countries: [], languages: ['ms'], genres: ['Western'], format: 'movie' } })
  })

  it('asks for freeform guidance instead of suggesting unsupported widening', async () => {
    jest.mocked(recommendationEngine.previewRecommendations).mockResolvedValue([])
    const result = await buildCatalogueWidening(request)
    expect(result.questions[0]).toMatchObject({ id: 'catalogue_rephrase', type: 'text' })
    expect(result.questions[0].options).toBeUndefined()
    expect(result.context).toContain("couldn't confirm")
  })

  it('does not silently relax a retained genre when verifying a different widening dimension', async () => {
    request.spec = validateSpec({ ...request.spec, genres: ['Western'] })
    jest.mocked(recommendationEngine.previewRecommendations).mockImplementation(async input =>
      input.spec?.genres.length ? titles('Comedy', 10) : []
    )
    const result = await buildCatalogueWidening(request)
    expect(result.questions[0].type).toBe('text')
    expect(result.questions[0].options).toBeUndefined()
  })

  it('treats one release window as a named widening dimension and retains other fields', async () => {
    request.spec = validateSpec({
      format: 'both', tones: ['Relaxing'], years: { min: 2024 },
      dateRange: { from: '2024-01-01' }, releasedWithinDays: 365
    })
    const result = await buildCatalogueWidening(request)
    expect(result.questions[0].options).toEqual(['Look beyond the requested release window'])
    expect(jest.mocked(recommendationEngine.previewRecommendations).mock.calls[0][0].spec).toEqual(
      validateSpec({ format: 'both', tones: ['Relaxing'] })
    )
  })

  it('rejects edited signatures, cross-query reuse and altered user-turn histories', async () => {
    const result = await buildCatalogueDirections(request)
    const label = result!.questions[0].options![0]
    const token = result!.questions[0].optionTokens![label]
    const selection = { ...request, clarificationContext: {
      clarificationRound: 1, userClarification: label, userTurns: [request.description, label]
    } }
    expect(resolveCatalogueChoice(`${token}x`, request.spec, label, selection)).toBeUndefined()
    expect(resolveCatalogueChoice(token, request.spec, label, { ...selection, description: 'Different request' })).toBeUndefined()
    expect(resolveCatalogueChoice(token, request.spec, label, {
      ...selection, clarificationContext: { ...selection.clarificationContext, userTurns: ['Other history', label] }
    })).toBeUndefined()
    expect(resolveCatalogueChoice(token, request.spec, label, selection)?.spec.genres).toEqual(['Comedy'])
  })
})
