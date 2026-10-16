import { PreferenceParser } from '../preferenceParser'
import { recommendationEngine, type RequestRankingDiagnostics } from '../recommendationEngine'
import { tmdbClient } from '../../clients/tmdb'
import { matchableGenres, titleMatchesAnyGenre } from '../genreTaxonomy'

const followUp = (description: string, clarification: string) => ({
  description,
  clarificationContext: {
    clarificationRound: 1,
    userClarification: clarification,
    askedQuestionIds: [],
    previousRecommendationIds: [],
    cumulativeConstraints: [],
    userTurns: [description, clarification]
  }
})

describe('Genre parsing for clarification options', () => {
  it('keeps crime, mystery and thriller distinct for a series follow-up', () => {
    const prefs = PreferenceParser.parse(followUp('Spanish series', 'Gritty crime thrillers and mysteries'))

    expect(prefs.genres).toEqual(expect.arrayContaining(['Crime', 'Mystery', 'Thriller']))
    expect(prefs.contentType).toBe('tv')
    expect(prefs.originalLanguage).toBe('es')
  })

  it.each([
    ['westerns', ['Western']],
    ['historical dramas', ['History', 'Drama']],
    ['war films', ['War']],
    ['detective stories', ['Mystery']]
  ])('detects %s', (text, expected) => {
    const prefs = PreferenceParser.parse({ description: text })
    expect(prefs.genres).toEqual(expect.arrayContaining(expected))
  })

  it('recognises English as an original language', () => {
    const prefs = PreferenceParser.parse({ description: 'English series' })
    expect(prefs.originalLanguage).toBe('en')
  })
})

describe('Media-aware TMDB genre mapping', () => {
  afterEach(() => jest.restoreAllMocks())

  it('expands Thriller to Crime|Mystery for TV discovery', async () => {
    jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    } as unknown as Response)

    await tmdbClient.discoverByGenres(['Thriller'], { includeTV: true, includeMovies: false })

    const tvUrl = fetchSpy.mock.calls
      .map(call => new URL(call[0] as string))
      .find(url => url.pathname.includes('/discover/tv'))
    expect(tvUrl?.searchParams.get('with_genres')).toBe('80|9648')
  })

  it('maps combined TV genres back to every name they cover', () => {
    expect(tmdbClient.mapGenreIdsToNames([10765], 'tv')).toEqual(['Sci-Fi', 'Fantasy'])
  })
})

describe('Genre taxonomy helpers', () => {
  it('treats Crime or Mystery series as satisfying Thriller', () => {
    expect(titleMatchesAnyGenre({ type: 'series', genres: ['Crime', 'Drama'] }, ['Thriller'])).toBe(true)
    expect(titleMatchesAnyGenre({ type: 'movie', genres: ['Crime', 'Drama'] }, ['Thriller'])).toBe(false)
  })

  it('counts keyword evidence as a genre match', () => {
    const title = { type: 'series', genres: ['Drama'], genreKeywordMatches: ['Horror'] }
    expect(matchableGenres(title)).toContain('Horror')
    expect(titleMatchesAnyGenre(title, ['Horror'])).toBe(true)
  })
})

describe('Series genre filter', () => {
  afterEach(() => jest.restoreAllMocks())

  const series = (id: string, genres: string[], extra: Record<string, unknown> = {}) => ({
    id, title: `Series ${id}`, type: 'series', genres,
    plot: 'A tense investigation unfolds.', rating: 7.5, voteCount: 2000, year: 2020,
    originalLanguage: 'es', ...extra
  })

  it('keeps Crime/Mystery series for a thriller request', () => {
    const prefs = PreferenceParser.parse(followUp('Spanish series', 'Gritty crime thrillers and mysteries'))
    const ranked = (recommendationEngine as any).rankTitles([
      series('tt1', ['Crime', 'Drama']),
      series('tt2', ['Mystery'])
    ], prefs, [])

    expect(ranked.map((t: any) => t.id).sort()).toEqual(['tt1', 'tt2'])
  })

  it('keeps keyword-tagged horror series that TMDB genres cannot express', () => {
    const prefs = PreferenceParser.parse({ description: 'Korean horror series' })
    const ranked = (recommendationEngine as any).rankTitles([
      series('tt3', ['Drama', 'Mystery'], { originalLanguage: 'ko', genreKeywordMatches: ['Horror'] }),
      series('tt4', ['Comedy'], { originalLanguage: 'ko' })
    ], prefs, [])

    expect(ranked.map((t: any) => t.id)).toEqual(['tt3'])
  })

  it('prefers the qualifier genre for "historical dramas" and falls back to drama honestly', () => {
    const prefs = PreferenceParser.parse({ description: 'Spanish historical dramas series' })
    ;(recommendationEngine as any).lastGenreFilterRelaxation = undefined
    const withHistory = (recommendationEngine as any).rankTitles([
      series('tt6', ['Drama'], { genreKeywordMatches: ['History'] }),
      series('tt7', ['Drama', 'Comedy'])
    ], prefs, [])
    expect(withHistory.map((t: any) => t.id)).toEqual(['tt6'])
    expect((recommendationEngine as any).lastGenreFilterRelaxation).toBeUndefined()

    const withoutHistory = (recommendationEngine as any).rankTitles([
      series('tt7', ['Drama', 'Comedy']),
      series('tt8', ['Comedy'])
    ], prefs, [])
    expect(withoutHistory.map((t: any) => t.id)).toEqual(['tt7'])
    expect((recommendationEngine as any).lastGenreFilterRelaxation).toEqual(['History'])
  })

  it('relaxes the filter rather than returning nothing, and records it', () => {
    const prefs = PreferenceParser.parse({ description: 'Spanish horror series' })
    ;(recommendationEngine as any).lastGenreFilterRelaxation = undefined
    const ranked = (recommendationEngine as any).rankTitles([
      series('tt5', ['Drama'])
    ], prefs, [])

    expect(ranked.length).toBe(1)
    expect((recommendationEngine as any).lastGenreFilterRelaxation).toEqual(expect.arrayContaining(['Horror']))
  })

  it('records relaxation per request when requests run concurrently', async () => {
    jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    jest.spyOn(tmdbClient, 'getTitleDetails').mockResolvedValue(null)
    jest.spyOn(tmdbClient, 'searchTitles').mockResolvedValue([])
    jest.spyOn(tmdbClient, 'discoverByKeywords').mockResolvedValue([])
    jest.spyOn(tmdbClient as any, 'discoverMovies').mockResolvedValue([])
    jest.spyOn(tmdbClient as any, 'discoverTV').mockImplementation(async (...args: unknown[]) => {
      const [, , page] = args as [string, unknown, number]
      return page === 1
        ? [{
            id: 9, name: 'Comedy Show', media_type: 'tv', genre_ids: [35], overview: 'A series.',
            poster_path: '/p.jpg', first_air_date: '2020-01-01', vote_average: 7.5, vote_count: 3000,
            adult: false, original_language: 'ko'
          }]
        : []
    })

    const westernDiagnostics: RequestRankingDiagnostics = {}
    const comedyDiagnostics: RequestRankingDiagnostics = {}
    await Promise.all([
      recommendationEngine.getRecommendations(followUp('Korean series', 'westerns') as any, 10, undefined, westernDiagnostics),
      recommendationEngine.getRecommendations(followUp('Korean series', 'comedies') as any, 10, undefined, comedyDiagnostics)
    ])

    expect(westernDiagnostics.genreFilterRelaxed).toEqual(['Western'])
    expect(comedyDiagnostics.genreFilterRelaxed).toBeUndefined()
  })
})

describe('Language x genre series matrix (mocked TMDB)', () => {
  afterEach(() => jest.restoreAllMocks())

  const languages: Array<[string, string]> = [
    ['Spanish', 'es'], ['Korean', 'ko'], ['French', 'fr'], ['Japanese', 'ja'], ['English', 'en']
  ]
  const genreRequests: Array<[string, string[]]> = [
    ['gritty crime thrillers and mysteries', ['Crime Show', 'Mystery Show', 'Suspense Show']],
    ['psychological thrillers', ['Crime Show', 'Mystery Show', 'Suspense Show']],
    ['horror', ['Haunted Show']],
    ['fantasy', ['Fantasy Show']],
    ['comedies', ['Comedy Show']],
    ['historical dramas', ['History Show']],
    ['crime dramas', ['Crime Show']],
    ['westerns', ['Western Show']]
  ]

  // A small TV catalogue using only real TMDB TV genre IDs; horror/history/thriller
  // are only reachable through keyword discovery, as on live TMDB.
  const tvCatalogue = (lang: string) => [
    { id: 1, name: 'Crime Show', genre_ids: [80, 18] },
    { id: 2, name: 'Mystery Show', genre_ids: [9648] },
    { id: 3, name: 'Fantasy Show', genre_ids: [10765] },
    { id: 4, name: 'Comedy Show', genre_ids: [35] },
    { id: 5, name: 'Western Show', genre_ids: [37] },
    { id: 6, name: 'Period Drama', genre_ids: [18] }
  ].map(show => ({
    ...show, media_type: 'tv', overview: 'A series.', poster_path: '/p.jpg',
    first_air_date: '2020-01-01', vote_average: 7.6, vote_count: 3000,
    adult: false, original_language: lang
  }))

  const keywordHits = (lang: string, keywords: string[]) => {
    const joined = keywords.join(' ')
    const make = (id: number, name: string) => ({
      id, name, media_type: 'tv', genre_ids: [18, 9648], overview: 'A series.',
      poster_path: '/p.jpg', first_air_date: '2020-01-01', vote_average: 7.4,
      vote_count: 2500, adult: false, original_language: lang
    })
    if (/horror|ghost|zombie/.test(joined)) return [make(101, 'Haunted Show')]
    if (/thriller|suspense/.test(joined)) return [make(102, 'Suspense Show')]
    if (/historical|period/.test(joined)) return [make(103, 'History Show')]
    return []
  }

  for (const [languageName, code] of languages) {
    for (const [genreRequest, acceptableTitles] of genreRequests) {
      it(`${languageName} series -> ${genreRequest} returns genre-consistent results`, async () => {
        jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
        jest.spyOn(tmdbClient, 'getTitleDetails').mockResolvedValue(null)
        jest.spyOn(tmdbClient, 'searchTitles').mockResolvedValue([])
        jest.spyOn(tmdbClient as any, 'discoverMovies').mockResolvedValue([])
        jest.spyOn(tmdbClient as any, 'discoverTV').mockImplementation(async (...args: unknown[]) => {
          const [genreIds, , page] = args as [string, unknown, number]
          if (page !== 1) return []
          const ids = new Set(genreIds.split(/[|,]/).filter(Boolean).map(Number))
          // Genre-less discovery (language-only) returns the whole catalogue, as live TMDB would.
          return tvCatalogue(code).filter(show => ids.size === 0 || show.genre_ids.some(id => ids.has(id)))
        })
        jest.spyOn(tmdbClient, 'discoverByKeywords').mockImplementation(
          async (keywords: string[]) => keywordHits(code, keywords) as any
        )

        const recommendations = await recommendationEngine.getRecommendations(
          followUp(`${languageName} series`, genreRequest) as any
        )

        expect(recommendations.length).toBeGreaterThan(0)
        for (const rec of recommendations) {
          expect(acceptableTitles).toContain(rec.title)
        }
        expect(recommendationEngine.getLastRetrievalDiagnostics().genreFilterRelaxed).toBeUndefined()
      })
    }
  }

  describe('estimateAvailableTitles probe', () => {
    const mockCatalogue = (code: string) => {
      jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
      jest.spyOn(tmdbClient as any, 'discoverMovies').mockResolvedValue([])
      jest.spyOn(tmdbClient as any, 'discoverTV').mockImplementation(async (...args: unknown[]) => {
        const [genreIds, , page] = args as [string, unknown, number]
        if (page !== 1) return []
        const ids = new Set(genreIds.split(/[|,]/).filter(Boolean).map(Number))
        return tvCatalogue(code).filter(show => ids.size === 0 || show.genre_ids.some(id => ids.has(id)))
      })
      jest.spyOn(tmdbClient, 'discoverByKeywords').mockImplementation(
        async (keywords: string[]) => keywordHits(code, keywords) as any
      )
    }
    const probe = (...turns: string[]) => recommendationEngine.estimateAvailableTitles(
      PreferenceParser.parse(followUp(turns[0], turns[1]) as any)
    )

    it('counts genre-consistent series for a viable follow-up', async () => {
      mockCatalogue('es')
      await expect(probe('Spanish series', 'gritty crime thrillers')).resolves.toBeGreaterThan(0)
    })

    it('returns 0 when nothing matches the language', async () => {
      mockCatalogue('fr')
      await expect(probe('Korean series', 'comedies')).resolves.toBe(0)
    })

    it('is unknown (undefined) when TMDB is unavailable', async () => {
      jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(false)
      await expect(probe('Spanish series', 'comedies')).resolves.toBeUndefined()
    })
  })
})
