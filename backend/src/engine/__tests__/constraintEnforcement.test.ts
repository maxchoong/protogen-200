import { RecommendationEngine, type RequestRankingDiagnostics } from '../recommendationEngine'
import { validateSpec } from '../requestSpec'
import { fmdbClient } from '../../clients/fmdb'
import { llmClient } from '../../clients/llm'
import { tmdbClient, type TMDBTitle } from '../../clients/tmdb'

describe('Candidate-source-independent constraint checks', () => {
  const film = (id: number, date?: string, type: 'movie' | 'tv' = 'movie'): TMDBTitle => ({
    id, title: `Title ${id}`, media_type: type,
    release_date: type === 'movie' ? date : undefined,
    first_air_date: type === 'tv' ? date : undefined,
    genre_ids: [35], overview: 'A funny, warm comedy about friendship.', poster_path: '/poster.jpg',
    vote_average: 7.5, vote_count: 1000, adult: false, original_language: 'ms', origin_country: ['MY']
  })
  const windowSpec = () => validateSpec({
    countries: ['MY'], format: 'movie', genres: ['Comedy'],
    dateRange: { from: '2026-09-01', to: '2026-09-30' }
  })
  let engine: RecommendationEngine

  beforeEach(() => {
    engine = new RecommendationEngine()
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network forbidden in constraint tests'))
    jest.spyOn(llmClient, 'isEnabled').mockReturnValue(false)
    jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    jest.spyOn(tmdbClient, 'searchTitles').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'discoverByGenres').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'discoverByFilters').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'discoverByKeywords').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'discoverPopularByYear').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'getTrending').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'searchTitlesForPerson').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'getRelatedTitles').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'getTitleDetails').mockResolvedValue(null)
    jest.spyOn(tmdbClient, 'findTitleByImdbId').mockResolvedValue(null)
    jest.spyOn(tmdbClient, 'getExternalIds').mockImplementation(async id => ({ imdbId: `tt94000${id}` }))
    jest.spyOn(tmdbClient, 'getTitleCredits').mockResolvedValue({ mainCast: [], directors: [] })
    jest.spyOn(tmdbClient, 'getVideos').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'getTrailersBatch').mockResolvedValue(new Map())
    jest.spyOn(fmdbClient, 'getDetails').mockResolvedValue(null)
    jest.spyOn(fmdbClient, 'searchWithDetails').mockResolvedValue([])
  })

  afterEach(() => {
    try {
      expect(global.fetch).not.toHaveBeenCalled()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('keeps exact inclusive date matches and excludes out-of-window, unknown and wrong-format discovery candidates', async () => {
    jest.mocked(tmdbClient.discoverByGenres).mockResolvedValue([
      film(1, '2026-09-01'), film(2, '2026-09-30'), film(3, '2026-08-31'),
      film(4, '2026-10-01'), film(5), film(6, '2026-09-15', 'tv')
    ])
    const diagnostics: RequestRankingDiagnostics = {}
    const results = await engine.getRecommendations({
      description: 'Malaysian comedy films released in September 2026',
      spec: windowSpec(), specOperation: 'new'
    }, 10, undefined, diagnostics)
    expect(results.map(item => item.title).sort()).toEqual(['Title 1', 'Title 2'])
    expect(results.map(item => item.releaseDate).sort()).toEqual(['2026-09-01', '2026-09-30'])
    expect(diagnostics.missingReleaseDates).toBe(1)
  })

  it('hydrates missing dates from details, but never substitutes a year for a full date', async () => {
    jest.mocked(tmdbClient.discoverByGenres).mockResolvedValue([film(1), film(2), film(3)])
    jest.mocked(tmdbClient.getTitleDetails).mockImplementation(async id =>
      id === 1 ? film(1, '2026-09-15') : id === 2 ? film(2, '2026-08-15') : null
    )
    const results = await engine.getRecommendations({
      description: 'Malaysian comedy films', spec: windowSpec(), specOperation: 'new'
    })

    expect(results.map(item => item.title)).toEqual(['Title 1'])
  })

  it('does not repeat LLM preference parsing after route understanding failed', async () => {
    jest.mocked(llmClient.isEnabled).mockReturnValue(true)
    const parsing = jest.spyOn(llmClient, 'parsePreferences').mockImplementation(() => new Promise(() => {}))
    jest.mocked(tmdbClient.discoverByGenres).mockResolvedValue([film(1, '2025-01-01')])
    const results = await engine.getRecommendations({ description: 'comedy movies', understandingAttempted: true })
    expect(results.length).toBeGreaterThan(0)
    expect(parsing).not.toHaveBeenCalled()
  })

  it('rechecks previous results alongside fresh retrieval after a date-scope change', async () => {
    const previousSpec = validateSpec({ format: 'movie', genres: ['Comedy'] })
    jest.mocked(fmdbClient.getDetails).mockResolvedValue({
      imdbID: 'tt9400010', Title: 'Old result', Year: '2026', Type: 'movie',
      Plot: 'A warm comedy.', Genre: 'Comedy', Rated: 'PG', imdbRating: '9'
    })
    jest.mocked(tmdbClient.findTitleByImdbId).mockResolvedValue({ tmdbId: 10, mediaType: 'movie' })
    jest.mocked(tmdbClient.getTitleDetails).mockImplementation(async id => film(id, id === 10 ? '2026-01-01' : '2026-09-15'))
    jest.mocked(tmdbClient.discoverByGenres).mockResolvedValue([film(1, '2026-09-15')])
    const spec = validateSpec({ ...windowSpec(), countries: [] })
    const results = await engine.getRecommendations({
      description: 'comedy films', previousSpec, spec, specOperation: 'refine',
      clarificationContext: {
        clarificationRound: 1, userClarification: 'only September 2026',
        previousRecommendationIds: ['tt9400010']
      }
    })
    expect(results.map(item => item.title)).toEqual(['Title 1'])
    expect(tmdbClient.discoverByGenres).toHaveBeenCalled()
  })

  it('rechecks authoritative dates after final detail enrichment', async () => {
    jest.mocked(tmdbClient.discoverByGenres).mockResolvedValue([film(1, '2026-09-15')])
    jest.mocked(tmdbClient.getTitleDetails).mockResolvedValue(film(1, '2026-01-01'))
    const results = await engine.getRecommendations({
      description: 'Malaysian comedy films', spec: windowSpec(), specOperation: 'new'
    })
    expect(results).toEqual([])
  })

  it('filters date/format on actor-filmography candidates, not just discovery', async () => {
    jest.mocked(tmdbClient.searchTitlesForPerson).mockResolvedValue([
      film(1, '2026-09-15'), film(2, '2026-01-01'), film(3, '2026-09-15', 'tv')
    ])
    const results = await engine.getRecommendations({
      description: 'comedy films with Tom Hanks in September 2026',
      spec: validateSpec({ ...windowSpec(), actors: ['Tom Hanks'] }), specOperation: 'new'
    })
    expect(results.map(item => item.title)).toEqual(['Title 1'])
  })

  it('applies dates to specialised critics-year retrieval', async () => {
    jest.mocked(tmdbClient.discoverPopularByYear).mockResolvedValue([
      film(1, '2026-09-15'), film(2, '2026-01-01')
    ])
    const results = await engine.getRecommendations({
      description: 'critics favourite comedy films of 2026 released in September',
      spec: validateSpec({ ...windowSpec(), years: { min: 2026, max: 2026 } }), specOperation: 'new'
    })
    expect(tmdbClient.discoverPopularByYear).toHaveBeenCalled()
    expect(results.map(item => item.title)).toEqual(['Title 1'])
  })

  it('keeps country, language and exclusions strict even when genre matching relaxes', async () => {
    jest.mocked(tmdbClient.discoverByGenres).mockResolvedValue([
      film(1, '2026-09-15'), { ...film(2, '2026-09-15'), origin_country: ['US'] },
      { ...film(3, '2026-09-15'), original_language: 'en' },
      { ...film(4, '2026-09-15'), genre_ids: [27] }
    ])
    const results = await engine.getRecommendations({
      description: 'Malaysian Malay-language western films without horror',
      spec: validateSpec({ ...windowSpec(), languages: ['ms'], genres: ['Western'], excludeGenres: ['Horror'] }),
      specOperation: 'new'
    })
    expect(results.map(item => item.title)).toEqual(['Title 1'])
  })

  it('uses first-air dates for series and preserves unconstrained missing-date behaviour', async () => {
    jest.mocked(tmdbClient.discoverByGenres).mockResolvedValue([film(1, '2026-09-15', 'tv'), film(2)])
    const series = await engine.getRecommendations({
      description: 'Malaysian comedy series',
      spec: validateSpec({ ...windowSpec(), format: 'tv' }), specOperation: 'new'
    })
    expect(series.map(item => [item.type, item.releaseDate])).toEqual([['tv', '2026-09-15']])
    const films = await engine.getRecommendations({
      description: 'Malaysian comedy films',
      spec: validateSpec({ countries: ['MY'], genres: ['Comedy'], format: 'movie' }), specOperation: 'new'
    })
    expect(films.map(item => item.title)).toEqual(['Title 2'])
  })

  it.each([
    { countries: ['MY'], format: 'movie' },
    { languages: ['ms'], format: 'movie' },
    { format: 'movie' },
    { format: 'tv' }
  ])('supports undirected catalogue previews for $countries/$languages/$format without LLMs or trailers', async fields => {
    jest.mocked(llmClient.isEnabled).mockReturnValue(true)
    const parsing = jest.spyOn(llmClient, 'parsePreferences').mockResolvedValue(null)
    const explanations = jest.spyOn(llmClient, 'generateWhyThisBatch').mockResolvedValue(new Map())
    const actorSeeds = jest.spyOn(llmClient, 'suggestActorTitleSeeds').mockResolvedValue([])
    jest.mocked(tmdbClient.discoverByFilters).mockResolvedValue([
      film(1, '2025-01-01', fields.format === 'tv' ? 'tv' : 'movie')
    ])
    const spec = validateSpec(fields)
    const results = await engine.previewRecommendations({ description: 'Find titles', spec }, 10)
    expect(results).toHaveLength(1)
    expect(tmdbClient.discoverByFilters).toHaveBeenCalled()
    expect(parsing).not.toHaveBeenCalled()
    expect(explanations).not.toHaveBeenCalled()
    expect(actorSeeds).not.toHaveBeenCalled()
    expect(tmdbClient.getTrailersBatch).not.toHaveBeenCalled()
  })

  it('uses the same final constraints for preview and normal selected retrieval', async () => {
    jest.mocked(tmdbClient.discoverByGenres).mockResolvedValue([
      film(1, '2026-09-15'), film(2, '2026-09-20'), film(3, '2026-09-30'),
      film(4, '2026-01-01'), film(5, '2026-09-15', 'tv')
    ])
    const request = { description: 'Malaysian comedies in September 2026', spec: windowSpec() }
    const preview = await engine.previewRecommendations(request, 10)
    const selected = await engine.getRecommendations(request, 10)
    expect(preview.map(title => title.id)).toEqual(selected.map(title => title.id))
    expect(preview).toHaveLength(3)
  })

  it('checks the specialised critics quality floor during preview, not cheap discovery totals', async () => {
    jest.mocked(tmdbClient.discoverPopularByYear).mockResolvedValue([
      film(1, '2026-09-15'), film(2, '2026-09-20'),
      { ...film(3, '2026-09-30'), vote_average: 4, vote_count: 5 }
    ])
    const preview = await engine.previewRecommendations({
      description: 'Malaysian critics favourite comedy films of 2026',
      spec: validateSpec({ ...windowSpec(), years: { min: 2026, max: 2026 } })
    }, 10)
    expect(tmdbClient.discoverPopularByYear).toHaveBeenCalled()
    expect(preview.map(title => title.title).sort()).toEqual(['Title 1', 'Title 2'])
  })

  it('never invokes legacy LLM parsing or actor-seed recovery during previews', async () => {
    jest.mocked(llmClient.isEnabled).mockReturnValue(true)
    const parsing = jest.spyOn(llmClient, 'parsePreferences').mockResolvedValue(null)
    const seeds = jest.spyOn(llmClient, 'suggestActorTitleSeeds').mockResolvedValue([])
    const results = await engine.previewRecommendations({ description: 'movies with Tom Hanks' })
    expect(results).toEqual([])
    expect(tmdbClient.searchTitlesForPerson).toHaveBeenCalled()
    expect(parsing).not.toHaveBeenCalled()
    expect(seeds).not.toHaveBeenCalled()
  })
})
