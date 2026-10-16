import { PreferenceParser } from '../preferenceParser'
import { recommendationEngine } from '../recommendationEngine'
import { resolveConversationOrigins, resolveOriginConstraints, resolveOriginLists } from '../regionTaxonomy'
import { stripStockPhrases } from '../../clients/llm'
import { tmdbClient } from '../../clients/tmdb'

const followUp = (description: string, ...clarifications: string[]) => ({
  description,
  clarificationContext: {
    clarificationRound: clarifications.length,
    userClarification: clarifications[clarifications.length - 1],
    askedQuestionIds: [],
    previousRecommendationIds: [],
    cumulativeConstraints: [],
    userTurns: [description, ...clarifications]
  }
})

const codes = (result: { languages: Array<{ code: string }>; countries: Array<{ code: string }> }) => ({
  languages: result.languages.map(item => item.code),
  countries: result.countries.map(item => item.code)
})

describe('resolveOriginConstraints', () => {
  it.each([
    ['Malaysian movies', undefined, 'MY'],
    ['Indian thrillers', undefined, 'IN'],
    ['Nigerian dramas', undefined, 'NG'],
    ['Mexican horror', undefined, 'MX'],
    ['Hong Kong action movies', undefined, 'HK'],
    ['Bollywood romances', undefined, 'IN'],
    ['movies from Malaysia', undefined, 'MY'],
    ['films made in the Philippines', undefined, 'PH'],
    ['movies from South Korea', undefined, 'KR'],
    ['Tamil films from Malaysia', 'ta', 'MY'],
    ['French films from Canada', 'fr', 'CA'],
    ['Korean series', 'ko', undefined],
    ['Spanish crime series', 'es', undefined],
    ['Malay comedies', 'ms', undefined],
    ['Cantonese action movies', 'cn', undefined],
    ['films in Vietnamese', 'vi', undefined],
    ['Vietnamese films', undefined, 'VN']
  ])('%s → language %s, country %s', (text, language, country) => {
    const result = resolveOriginConstraints(text)
    expect(result.originalLanguage?.code).toBe(language)
    expect(result.originCountry?.code).toBe(country)
  })

  it.each([
    'movies like American Beauty',
    'Latin American cinema',
    'heartwarming family films',
    'I am from London, recommend thrillers'
  ])('adds no origin constraint for "%s"', text => {
    expect(resolveOriginConstraints(text)).toEqual({})
  })

  it('names countries with a demonym where known', () => {
    expect(resolveOriginConstraints('movies from Malaysia').originCountry?.name).toBe('Malaysian')
    expect(resolveOriginConstraints('Bollywood romances').originCountry?.name).toBe('Indian')
  })
})

describe('resolveOriginLists', () => {
  it.each([
    ['Malaysian and Indonesian films', [], ['MY', 'ID']],
    ['movies from Malaysia or Indonesia', [], ['MY', 'ID']],
    ['movies from Malaysia and something funny', [], ['MY']],
    ['also add Thailand and Singapore', [], ['TH', 'SG']],
    ['Korean or Japanese series', ['ko', 'ja'], []]
  ])('%s', (text, languages, countries) => {
    expect(codes(resolveOriginLists(text))).toEqual({ languages, countries })
  })
})

describe('resolveConversationOrigins', () => {
  it.each([
    [['Malaysian films', 'Heartfelt local comedies and dramas', 'What about Indonesian films too?'], [], ['MY', 'ID'], 'added'],
    [['Malaysian films', 'Indonesian ones as well'], [], ['MY', 'ID'], 'added'],
    [['Malaysian films', 'What about Indonesian films?'], [], ['ID'], 'replaced'],
    [['Malaysian films', 'Korean ones too'], [], ['MY', 'KR'], 'added'],
    [['Korean series', 'Japanese ones too'], ['ko', 'ja'], [], 'added'],
    [['Korean series', 'Nigerian ones too'], [], ['KR', 'NG'], 'added'],
    [['Tamil films', 'from Malaysia'], ['ta'], ['MY'], 'narrowed'],
    [['Malaysian films', 'something funnier'], [], ['MY'], undefined]
  ])('%j', (turns, languages, countries, change) => {
    const result = resolveConversationOrigins(turns as string[])
    expect(codes(result)).toEqual({ languages, countries })
    expect(result.change).toBe(change)
  })

  it('describes what the latest turn changed', () => {
    expect(resolveConversationOrigins(['Malaysian films', 'What about Indonesian films too?']).changeNote)
      .toBe('Added Indonesian alongside Malaysian.')
    expect(resolveConversationOrigins(['Malaysian films', 'What about Indonesian films?']).changeNote)
      .toBe('Switched to Indonesian.')
  })
})

describe('stripStockPhrases', () => {
  it('drops clichéd sentences and keeps the rest', () => {
    expect(stripStockPhrases('I have added Indonesian titles. Grab some popcorn and enjoy!')).toBe('I have added Indonesian titles.')
    expect(stripStockPhrases('Here are Malaysian films based on your verified filter.')).toBe('')
  })
})

describe('Origin country through the pipeline', () => {
  afterEach(() => jest.restoreAllMocks())

  it('keeps the country from the first turn when an option is selected', () => {
    const prefs = PreferenceParser.parse(followUp('Malaysian movies', 'Heartwarming comedies and family stories'))
    expect(prefs.originCountry).toBe('MY')
    expect(prefs.originCountryName).toBe('Malaysian')
    expect(prefs.constraints).toContain('country:MY')
    expect(prefs.genres).toEqual(expect.arrayContaining(['Comedy']))
    expect(prefs.mood).toContain('Happy')
  })

  it('widens to a second country on "What about Indonesian films too?"', () => {
    const prefs = PreferenceParser.parse(followUp('Malaysian films', 'Heartfelt local comedies and dramas', 'What about Indonesian films too?'))
    expect(prefs.originCountry).toBe('MY|ID')
    expect(prefs.originCountryName).toBe('Malaysian and Indonesian')
    expect(prefs.constraints).toEqual(expect.arrayContaining(['country:MY', 'country:ID']))
    expect(prefs.genres).toEqual(expect.arrayContaining(['Comedy']))
    expect(prefs.turnOperation?.operation).toBe('widen')
    expect(prefs.originChangeNote).toBe('Added Indonesian alongside Malaysian.')
  })

  it('switches country on "What about Indonesian films?"', () => {
    const prefs = PreferenceParser.parse(followUp('Malaysian films', 'What about Indonesian films?'))
    expect(prefs.originCountry).toBe('ID')
    expect(prefs.turnOperation?.operation).toBe('replace')
  })

  it('queries each country separately and tags movies with the country queried', async () => {
    jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const country = new URL(input as string).searchParams.get('with_origin_country')
      return {
        ok: true,
        json: async () => ({
          results: [{ id: country === 'MY' ? 1 : 2, title: `${country} film`, overview: 'x', poster_path: '/p.jpg', genre_ids: [35] }]
        })
      } as unknown as Response
    })

    const results = await tmdbClient.discoverByGenres(['Comedy'], { includeMovies: true, includeTV: false, originCountry: 'MY|ID' })

    const countries = fetchSpy.mock.calls.map(call => new URL(call[0] as string).searchParams.get('with_origin_country'))
    expect(new Set(countries)).toEqual(new Set(['MY', 'ID']))
    expect(results.find(title => title.id === 1)?.origin_country).toEqual(['MY'])
    expect(results.find(title => title.id === 2)?.origin_country).toEqual(['ID'])
  })

  it('sends with_origin_country to TMDB discovery and also fetches established titles', async () => {
    jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    } as unknown as Response)

    await tmdbClient.discoverByGenres(['Comedy'], { includeMovies: true, includeTV: false, originCountry: 'MY' })

    const urls = fetchSpy.mock.calls.map(call => new URL(call[0] as string))
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every(url => url.searchParams.get('with_origin_country') === 'MY')).toBe(true)
    expect(urls.map(url => url.searchParams.get('sort_by'))).toEqual(
      expect.arrayContaining(['popularity.desc', 'vote_count.desc'])
    )
  })

  it('only recommends titles from the requested country', async () => {
    const movie = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
      id, title, media_type: 'movie', genre_ids: [35, 10751], overview: 'A warm family comedy.',
      poster_path: '/p.jpg', release_date: '2019-01-01', vote_average: 7.4, vote_count: 900,
      adult: false, original_language: 'en', ...extra
    })
    jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    jest.spyOn(tmdbClient, 'getTitleDetails').mockResolvedValue(null)
    jest.spyOn(tmdbClient, 'searchTitles').mockResolvedValue([
      movie(90, 'Hollywood Family Hit', { vote_count: 20000 }) as any
    ])
    jest.spyOn(tmdbClient, 'discoverByKeywords').mockResolvedValue([
      movie(91, 'Another Hollywood Comedy', { vote_count: 15000 }) as any
    ])
    jest.spyOn(tmdbClient as any, 'discoverTV').mockResolvedValue([])
    jest.spyOn(tmdbClient as any, 'discoverMovies').mockImplementation(async (...args: unknown[]) => {
      const [, options, page] = args as [string, { originCountry?: string }, number]
      if (page !== 1 || options.originCountry !== 'MY') return []
      return [
        movie(1, 'Malay Family Comedy', { original_language: 'ms', origin_country: ['MY'] }),
        movie(2, 'Malaysian Chinese Comedy', { original_language: 'zh', origin_country: ['MY'] })
      ]
    })

    const recommendations = await recommendationEngine.getRecommendations(
      followUp('Malaysian movies', 'Heartwarming comedies and family stories') as any
    )

    expect(recommendations.map(rec => rec.title).sort()).toEqual(['Malay Family Comedy', 'Malaysian Chinese Comedy'])
  })
})
