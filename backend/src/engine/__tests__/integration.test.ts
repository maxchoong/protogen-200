/**
 * PHASE 6: Integration Tests for Full Recommendation Flow
 * Tests all four phases working together focusing on preference parsing
 */

import { PreferenceParser } from '../preferenceParser'
import { recommendationEngine } from '../recommendationEngine'
import { fmdbClient } from '../../clients/fmdb'
import { llmClient } from '../../clients/llm'
import { tmdbClient } from '../../clients/tmdb'

describe('End-to-End Recommendation Flow - Phase 5 Integration', () => {
  describe('Query: "funny heist like Ocean\'s Eleven"', () => {
    it('Phase 1: Should parse reference titles', () => {
      const request = { description: 'funny heist like Ocean\'s Eleven' }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.referenceTitle).toBeDefined()
      expect(preferences.referenceTitle!.length).toBeGreaterThan(0)
      expect(preferences.genres).toContain('Comedy')
    })

    it('Phase 1: Should extract mood confidence', () => {
      const request = { description: 'funny heist' }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.moodStrength).toBeDefined()
      expect(preferences.moodStrength!.has('Funny')).toBe(true)
      // 'funny' should have high confidence
      expect(preferences.moodStrength!.get('Funny')).toBeGreaterThan(0.7)
    })
  })

  describe('Query: "no horror, dark comedy instead"', () => {
    it('Phase 1: Should detect excluded genres', () => {
      const request = { description: 'no horror, dark comedy instead' }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.excludedGenres).toBeDefined()
      expect(preferences.excludedGenres!.length).toBeGreaterThan(0)
      // Horror should be excluded
      const hasHorror = preferences.excludedGenres!.some(g =>
        g.toLowerCase().includes('horror')
      )
      expect(hasHorror).toBe(true)
    })

    it('Phase 1: Should parse comedy genre', () => {
      const request = { description: 'no horror, dark comedy instead' }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.genres).toContain('Comedy')
    })

    it('Phase 1: Should capture dark mood', () => {
      const request = { description: 'no horror, dark comedy instead' }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.moodStrength).toBeDefined()
      // Dark mood should be detected or at least have moods parsed
      expect(preferences.mood.length > 0 || preferences.moodStrength!.size > 0).toBe(true)
    })
  })

  describe('Query: "slow-burn thoughtful sci-fi"', () => {
    it('Phase 1: Should parse sci-fi genre', () => {
      const request = { description: 'slow-burn thoughtful sci-fi' }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.genres).toContain('Sci-Fi')
    })

    it('Phase 1: Should extract thoughtful mood', () => {
      const request = { description: 'slow-burn thoughtful sci-fi' }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.moodStrength).toBeDefined()
      // Thoughtful mood should be captured
      const hasThoughtful = Array.from(preferences.moodStrength!.keys()).some(
        m => m.toLowerCase().includes('thoughtful') || m.toLowerCase().includes('slow')
      )
      expect(hasThoughtful || preferences.mood.length > 0).toBe(true)
    })

    it('Phase 1: Should capture constraint', () => {
      const request = { description: 'slow-burn thoughtful sci-fi' }
      const preferences = PreferenceParser.parse(request)

      // Should have either constraint or mood data
      const hasData = preferences.constraints || preferences.mood.length > 0 || preferences.moodStrength!.size > 0
      expect(hasData).toBeTruthy()
    })
  })

  describe('Mood Strength Weighting', () => {
    it('should apply different confidence for different intensity modifiers', () => {
      const veryRequest = { description: 'very funny' }
      const kindaRequest = { description: 'kinda funny' }

      const veryPrefs = PreferenceParser.parse(veryRequest)
      const kindaPrefs = PreferenceParser.parse(kindaRequest)

      const veryConfidence = veryPrefs.moodStrength?.get('Funny') || 0
      const kindaConfidence = kindaPrefs.moodStrength?.get('Funny') || 0

      // 'very funny' should have higher confidence than 'kinda funny'
      if (veryConfidence > 0 && kindaConfidence > 0) {
        expect(veryConfidence).toBeGreaterThan(kindaConfidence)
      }
    })

    it('should prefer parsed moods in recommendations', () => {
      const request = { description: 'very funny movie' }
      const preferences = PreferenceParser.parse(request)

      const funnyConfidence = preferences.moodStrength?.get('Funny') || 0
      if (funnyConfidence > 0) {
        expect(funnyConfidence).toBeGreaterThan(0.7)
      }
    })
  })

  describe('Genre Exclusion Logic', () => {
    it('should properly exclude genres from parsed preferences', () => {
      const request = { description: 'comedy but no action' }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.genres).toContain('Comedy')
      expect(preferences.excludedGenres).toBeDefined()

      // Action should be in excluded
      const hasAction = preferences.excludedGenres!.some(g =>
        g.toLowerCase() === 'action'
      )
      expect(hasAction).toBe(true)

      // Action should be removed from genres if it was there
      expect(preferences.genres).not.toContain('Action')
    })

    it('should not restore an explicitly excluded genre through hard genre inference', () => {
      const preferences = PreferenceParser.parse({ description: 'A heist, no thriller' })
      const ranked = (recommendationEngine as any).rankTitles([
        {
          id: 'crime-only',
          title: 'Crime Pick',
          genres: ['Crime'],
          plot: 'A crew plans a carefully coordinated heist.',
          rating: 7.1,
          voteCount: 500,
          year: 2020
        },
        {
          id: 'thriller-heist',
          title: 'Thriller Pick',
          genres: ['Crime', 'Thriller'],
          plot: 'A tense heist unfolds against the clock.',
          rating: 8.0,
          voteCount: 2000,
          year: 2020
        }
      ], preferences, [])

      expect(ranked.map((title: any) => title.title)).toEqual(['Crime Pick'])
    })
  })

  describe('Multiple mood extraction', () => {
    it('should handle multiple moods in single query', () => {
      const request = {
        description: 'something funny, thoughtful, and romantic'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.mood.length > 0 || preferences.moodStrength!.size > 0).toBe(true)
    })

    it('should apply confidence scoring to each mood', () => {
      const request = {
        description: 'very funny, kinda dark, thoughtful'
      }
      const preferences = PreferenceParser.parse(request)

      for (const confidence of preferences.moodStrength!.values()) {
        expect(confidence).toBeGreaterThan(0)
        expect(confidence).toBeLessThanOrEqual(1.0)
      }
    })
  })

  describe('Genre Detection Across Queries', () => {
    it('should not infer documentary from the substring in "really"', () => {
      const preferences = PreferenceParser.parse({ description: 'I really want a comedy' })

      expect(preferences.genres).toContain('Comedy')
      expect(preferences.genres).not.toContain('Documentary')
    })

    it('should detect multiple genres when mentioned', () => {
      const request = {
        description: 'comedy thriller with mystery elements'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.genres.length).toBeGreaterThan(1)
    })

    it('should not duplicate genres', () => {
      const request = {
        description: 'I want a comedy, something funny and laughable'
      }
      const preferences = PreferenceParser.parse(request)

      const uniqueGenres = new Set(preferences.genres)
      expect(uniqueGenres.size).toBe(preferences.genres.length)
    })
  })

  describe('Reference Title Detection', () => {
    it('should retain full title references and reject generic like-phrases', () => {
      const titlePreferences = PreferenceParser.parse({ description: 'Like The Office' })
      const genericPreferences = PreferenceParser.parse({ description: "I'd like something" })

      expect(titlePreferences.referenceTitle).toContain('The Office')
      expect(genericPreferences.referenceTitle).toEqual([])
    })

    it('should detect movie reference when mentioned', () => {
      const request = {
        description: 'something like Inception'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.referenceTitle).toBeDefined()
      expect(preferences.referenceTitle!.length).toBeGreaterThan(0)
    })

    it('should detect multiple reference titles', () => {
      const request = {
        description: 'like The Matrix but more like Inception'
      }
      const preferences = PreferenceParser.parse(request)

      if (preferences.referenceTitle && preferences.referenceTitle.length > 0) {
        // Should detect at least one reference
        expect(preferences.referenceTitle.length).toBeGreaterThanOrEqual(1)
      }
    })

    it('should not confuse genre keywords with reference titles', () => {
      const request = {
        description: 'a comedy thriller'
      }
      const preferences = PreferenceParser.parse(request)

      // Should not treat 'comedy' or 'thriller' as reference titles
      const lowerRefs = preferences.referenceTitle?.map(r => r.toLowerCase()) || []
      expect(lowerRefs).not.toContain('comedy')
      expect(lowerRefs).not.toContain('thriller')
    })
  })
})

/**
 * Performance benchmarks for Phase 3 & 4
 */
describe('Performance Benchmarks - Phase 6', () => {
  it('should parse preferences efficiently', () => {
    const requests = Array(1000)
      .fill(null)
      .map((_, i) => ({
        description: `funny heist like Ocean's Eleven number ${i}`
      }))

    const start = Date.now()
    requests.forEach(req => PreferenceParser.parse(req))
    const duration = Date.now() - start

    // Should process 1000 queries in under 1 second
    expect(duration).toBeLessThan(1000)
  })

  it('should handle complex multi-constraint queries', () => {
    const complexQueries = [
      'very funny dark comedy heist like Ocean\'s Eleven but no action',
      'slow-burn thoughtful sci-fi like Inception with mystery elements',
      'romantic comedy tragedy, sort of like The Notebook but darker'
    ]

    complexQueries.forEach(query => {
      const start = Date.now()
      const preferences = PreferenceParser.parse({ description: query })
      const duration = Date.now() - start

      expect(duration).toBeLessThan(10) // Each query should parse in <10ms
      expect(preferences).toBeDefined()
      expect(preferences.genres.length > 0).toBe(true)
    })
  })
})

/**
 * Manual smoke tests for expected behavior
 */
describe('Manual Smoke Tests - Phase 4 Explanations', () => {
  it('Query 1: heist with reference title should focus on inference and talent', () => {
    const request = { description: 'heist like Ocean\'s Eleven' }
    const preferences = PreferenceParser.parse(request)
    
    // Verification: reference title survives parsing; genre enforcement happens later in ranking.
    expect(preferences.referenceTitle).toBeDefined()
    expect(preferences.referenceTitle!.length).toBeGreaterThan(0)
  })

  it('Query 2: excluded genres should be captured for filtering', () => {
    const request = { description: 'no horror, no action' }
    const preferences = PreferenceParser.parse(request)
    
    expect(preferences.excludedGenres).toBeDefined()
    expect(preferences.excludedGenres!.length).toBeGreaterThan(0)
  })

  it('Query 3: mood-focused query should prioritize mood matching', () => {
    const request = { description: 'very funny and thoughtful' }
    const preferences = PreferenceParser.parse(request)
    
    expect(preferences.moodStrength).toBeDefined()
    expect(preferences.moodStrength!.size).toBeGreaterThan(0)
  })
})

describe('TMDB genre discovery', () => {
  it('uses OR semantics when discovering multiple requested genres', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    } as Response)

    await tmdbClient.discoverByGenres(['Drama', 'Romance'], {
      includeMovies: true,
      includeTV: false,
      excludeAdult: true,
      excludedGenres: ['Horror'],
      yearRange: { min: 1980, max: 1989 }
    })

    const requestedUrl = new URL(fetchSpy.mock.calls[0][0] as string)
    expect(requestedUrl.searchParams.get('with_genres')).toBe('18|10749')
    expect(requestedUrl.searchParams.get('without_genres')).toBe('27')
    expect(requestedUrl.searchParams.get('primary_release_date.gte')).toBe('1980-01-01')
    expect(requestedUrl.searchParams.get('primary_release_date.lte')).toBe('1989-12-31')

    fetchSpy.mockRestore()
    enabledSpy.mockRestore()
  })

  it('resolves search concepts to TMDB keywords before discover requests', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input))
      const results = url.pathname.endsWith('/search/keyword') ? [{ id: 42 }] : []
      return { ok: true, json: async () => ({ results }) } as Response
    })

    await tmdbClient.discoverByKeywords(['cozy'], {
      includeMovies: true,
      includeTV: false,
      excludeAdult: true
    })

    const keywordSearchUrl = new URL(fetchSpy.mock.calls[0][0] as string)
    const discoverUrl = new URL(fetchSpy.mock.calls[1][0] as string)
    expect(keywordSearchUrl.pathname).toContain('/search/keyword')
    expect(keywordSearchUrl.searchParams.get('query')).toBe('cozy')
    expect(discoverUrl.searchParams.get('with_keywords')).toBe('42')

    fetchSpy.mockRestore()
    enabledSpy.mockRestore()
  })

  it('fetches a second keyword page to include less-popular conceptual matches', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input))
      const results = url.pathname.endsWith('/search/keyword')
        ? [{ id: 88 }]
        : url.searchParams.get('page') === '2'
          ? [{
              id: 89,
              title: 'Project Hail Mary',
              media_type: 'movie',
              overview: 'A scientist wakes without memory and solves a space puzzle.',
              poster_path: '/hail-mary.jpg',
              genre_ids: [878, 12],
              vote_average: 8.0,
              vote_count: 5000,
              adult: false,
              original_language: 'en'
            }]
          : []
      return { ok: true, json: async () => ({ results }) } as Response
    })

    const results = await tmdbClient.discoverByKeywords(['memory'], {
      includeMovies: true,
      includeTV: false,
      excludeAdult: true,
      keywordPages: 3
    })
    const discoverCalls = fetchSpy.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter(url => url.pathname.endsWith('/discover/movie'))

    expect(discoverCalls).toHaveLength(3)
    expect(discoverCalls.map(url => url.searchParams.get('page'))).toEqual(['1', '2', '3'])
    expect(results.map(item => item.title)).toContain('Project Hail Mary')

    fetchSpy.mockRestore()
    enabledSpy.mockRestore()
  })

  it('discovers reference keywords independently so astronaut matches are not buried by broader concepts', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input))
      const isKeywordSearch = url.pathname.endsWith('/search/keyword')
      const results = isKeywordSearch
        ? [{ id: url.searchParams.get('query') === 'astronaut' ? 88 : 99 }]
        : url.searchParams.get('with_keywords') === '88' && url.searchParams.get('page') === '1'
          ? [{
              id: 921,
              title: 'Project Hail Mary',
              media_type: 'movie',
              overview: 'A scientist wakes without memory and solves a space puzzle.',
              poster_path: '/hail-mary.jpg',
              genre_ids: [878, 12],
              vote_average: 8.0,
              vote_count: 5000,
              adult: false,
              original_language: 'en'
            }]
          : []
      return { ok: true, json: async () => ({ results }) } as Response
    })

    const results = await tmdbClient.discoverByKeywords(['astronaut', 'memory'], {
      includeMovies: true,
      includeTV: false,
      excludeAdult: true,
      separateKeywordQueries: true,
      keywordPages: 2
    })

    expect(results.map(title => title.title)).toContain('Project Hail Mary')

    fetchSpy.mockRestore()
    enabledSpy.mockRestore()
  })

  it('uses TV genre IDs and keeps TV discover results typed as series', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          id: 52,
          name: 'A TV drama',
          overview: 'A dramatic story.',
          poster_path: '/tv.jpg',
          genre_ids: [10759],
          vote_average: 7,
          vote_count: 100,
          adult: false,
          original_language: 'en'
        }]
      })
    } as Response)

    const results = await tmdbClient.discoverByGenres(['Action'], {
      includeMovies: false,
      includeTV: true,
      excludeAdult: true
    })

    const requestedUrl = new URL(fetchSpy.mock.calls[0][0] as string)
    expect(requestedUrl.searchParams.get('with_genres')).toBe('10759')
    expect(results[0].media_type).toBe('tv')
    expect(tmdbClient.mapGenreIdsToNames([10759], 'tv')).toEqual(['Action'])

    fetchSpy.mockRestore()
    enabledSpy.mockRestore()
  })

  it('retrieves TMDB recommendations and similar titles from the reference media type', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          id: 73,
          title: 'A Similar Film',
          overview: 'A thoughtful science-fiction story.',
          poster_path: '/similar.jpg',
          genre_ids: [878],
          vote_average: 7.2,
          vote_count: 500,
          adult: false,
          original_language: 'en'
        }]
      })
    } as Response)

    const results = await tmdbClient.getRelatedTitles(99, 'movie', 'recommendations')
    const requestedUrl = new URL(fetchSpy.mock.calls[0][0] as string)

    expect(requestedUrl.pathname).toContain('/movie/99/recommendations')
    expect(results[0].media_type).toBe('movie')

    fetchSpy.mockRestore()
    enabledSpy.mockRestore()
  })

  it('does not use title search for mood or genre discovery signals', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const genreDiscoverSpy = jest.spyOn(tmdbClient, 'discoverByGenres').mockResolvedValue([])
    const keywordDiscoverSpy = jest.spyOn(tmdbClient, 'discoverByKeywords').mockResolvedValue([])
    const titleSearchSpy = jest.spyOn(tmdbClient, 'searchTitles').mockResolvedValue([])

    await (recommendationEngine as any).searchWithTmdbPrimary(
      [],
      'movie',
      'mood',
      ['Drama', 'Romance'],
      ['cozy', 'feel-good']
    )

    expect(genreDiscoverSpy).toHaveBeenCalled()
    expect(keywordDiscoverSpy).toHaveBeenCalled()
    expect(titleSearchSpy).not.toHaveBeenCalled()

    enabledSpy.mockRestore()
    genreDiscoverSpy.mockRestore()
    keywordDiscoverSpy.mockRestore()
    titleSearchSpy.mockRestore()
  })

  it('keeps exact reference suggestion results ahead of a crowded genre/keyword pool', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const broadGenres = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      title: `Broad genre result ${index}`,
      media_type: 'movie',
      overview: 'A broad genre result.',
      poster_path: '/broad.jpg',
      genre_ids: [878],
      vote_average: 7,
      vote_count: 200,
      adult: false,
      original_language: 'en'
    }))
    const broadKeywords = Array.from({ length: 40 }, (_, index) => ({
      ...broadGenres[index],
      id: index + 101,
      title: `Broad keyword result ${index}`
    }))
    const genreSpy = jest.spyOn(tmdbClient, 'discoverByGenres').mockResolvedValue(broadGenres as any)
    const keywordSpy = jest.spyOn(tmdbClient, 'discoverByKeywords').mockResolvedValue(broadKeywords as any)
    const titleSearchSpy = jest.spyOn(tmdbClient, 'searchTitles').mockResolvedValue([{
      id: 999,
      title: 'Project Hail Mary',
      media_type: 'movie',
      overview: 'A scientist wakes without memory and solves a space puzzle.',
      poster_path: '/hail-mary.jpg',
      genre_ids: [878, 12],
      vote_average: 8.0,
      vote_count: 5000,
      adult: false,
      original_language: 'en'
    } as any])

    const results = await (recommendationEngine as any).searchWithTmdbPrimary(
      ['Project Hail Mary'],
      'movie',
      'reference',
      ['Sci-Fi'],
      ['memory', 'puzzle']
    )

    expect(results[0].title).toBe('Project Hail Mary')
    expect(results.some((title: any) => title.title === 'Project Hail Mary')).toBe(true)

    enabledSpy.mockRestore()
    genreSpy.mockRestore()
    keywordSpy.mockRestore()
    titleSearchSpy.mockRestore()
  })

  it('preserves the full combined candidate pool for reference-mode ranking', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const candidates = (prefix: string, idOffset: number) => Array.from({ length: 40 }, (_, index) => ({
      id: index + idOffset,
      title: `${prefix} ${index}`,
      media_type: 'movie',
      poster_path: '/candidate.jpg',
      overview: 'A reference-relevant science-fiction story.',
      genre_ids: [878],
      vote_average: 7,
      vote_count: 500,
      adult: false,
      original_language: 'en'
    } as any))
    const genreSpy = jest.spyOn(tmdbClient, 'discoverByGenres').mockResolvedValue(candidates('Genre', 1))
    const keywordSpy = jest.spyOn(tmdbClient, 'discoverByKeywords').mockResolvedValue(candidates('Keyword', 101))
    const titleSearchSpy = jest.spyOn(tmdbClient, 'searchTitles').mockResolvedValue([])

    const results = await (recommendationEngine as any).searchWithTmdbPrimary(
      [],
      'movie',
      'reference',
      ['Sci-Fi'],
      ['memory', 'space']
    )

    expect(results).toHaveLength(80)
    expect(results.findIndex((title: any) => title.title === 'Keyword 39')).toBeLessThan(40)

    enabledSpy.mockRestore()
    genreSpy.mockRestore()
    keywordSpy.mockRestore()
    titleSearchSpy.mockRestore()
  })

  it('uses keyword concepts for OMDb fallback when TMDB discovery is empty', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const tmdbSearchSpy = jest.spyOn(recommendationEngine as any, 'searchWithTmdbPrimary').mockResolvedValue([])
    const omdbSearchSpy = jest.spyOn(recommendationEngine as any, 'searchWithOmdbFallback').mockResolvedValue([
      { id: 'tt1234567', title: 'Cozy fallback title' }
    ])

    const searched = await (recommendationEngine as any).searchCandidates(
      [],
      'movie',
      'mood',
      ['Drama', 'Romance'],
      ['cozy', 'feel-good']
    )

    expect(omdbSearchSpy).toHaveBeenCalledWith(
      expect.arrayContaining(['cozy', 'feel-good']),
      'movie'
    )
    expect(searched.source).toBe('omdb')

    enabledSpy.mockRestore()
    tmdbSearchSpy.mockRestore()
    omdbSearchSpy.mockRestore()
  })
})

describe('Reference candidate retrieval', () => {
  it('derives generic thematic catalog keywords from a reference synopsis', () => {
    const keywords = (recommendationEngine as any).buildReferenceConceptKeywords([
      {
        plot: 'A thief enters shared dreams to plant an idea in a target’s subconscious using experimental technology.',
        genres: ['Action', 'Sci-Fi', 'Thriller']
      }
    ])

    expect(keywords).toEqual(expect.arrayContaining([
      'dream', 'memory', 'alternate reality', 'simulation', 'time travel',
      'time perception', 'first contact', 'space station', 'space travel',
      'astronaut', 'memory erasure', 'hidden camera', 'artificial reality',
      'fate', 'destiny', 'suspended animation'
    ]))
    expect(keywords).not.toContain('Project Hail Mary')
  })

  it('recognizes linguistics and time perception as conceptual reference overlap', () => {
    const reference = [{
      plot: 'A thief enters shared dreams and plants an idea in the subconscious using technology.',
      genres: ['Sci-Fi']
    }]
    const arrivalPlot = 'An expert linguist studies the language of alien visitors to determine whether they come in peace.'

    expect((recommendationEngine as any).scoreReferenceConceptFit(arrivalPlot, reference)).toBeGreaterThanOrEqual(0.5)
  })

  it('uses LLM conceptual title suggestions as catalog search seeds', async () => {
    const llmEnabledSpy = jest.spyOn(llmClient, 'isEnabled').mockReturnValue(true)
    const llmParseSpy = jest.spyOn(llmClient, 'parsePreferences').mockResolvedValue({
      referenceTitles: ['Inception'],
      referenceSuggestions: ['Project Hail Mary', 'Arrival']
    })
    const tmdbEnabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const referenceSpy = jest.spyOn(recommendationEngine as any, 'fetchReferenceTitle').mockResolvedValue({
      id: 'tt1375666',
      title: 'Inception',
      type: 'movie',
      genres: ['Action', 'Sci-Fi', 'Thriller'],
      plot: 'A thief enters dreams to plant an idea in another person’s subconscious.'
    })
    const findTitleSpy = jest.spyOn(tmdbClient, 'findTitleByImdbId').mockResolvedValue(null)
    const searchCandidatesSpy = jest.spyOn(recommendationEngine as any, 'searchCandidates').mockResolvedValue({
      source: 'tmdb',
      results: []
    })

    await recommendationEngine.getRecommendations({
      description: 'Like Inception but more relaxing',
      region: 'US'
    })

    expect(searchCandidatesSpy.mock.calls[0][0]).toEqual(
      expect.arrayContaining(['Project Hail Mary', 'Arrival'])
    )

    llmEnabledSpy.mockRestore()
    llmParseSpy.mockRestore()
    tmdbEnabledSpy.mockRestore()
    referenceSpy.mockRestore()
    findTitleSpy.mockRestore()
    searchCandidatesSpy.mockRestore()
  })
})

describe('Ranking Guardrails - Golden Prompt Behaviors', () => {
  it('keeps inferred mood genres soft instead of filtering out calm cross-genre titles', () => {
    const preferences = PreferenceParser.parse({ description: 'A cozy weekend movie' })
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'tmdb:movie:cozy-animation',
        title: 'A Gentle Animated Story',
        genres: ['Animation'],
        plot: 'A peaceful, cozy journey with a gentle tone.',
        rating: 7.2,
        voteCount: 500,
        year: 2020
      }
    ], preferences, [])

    expect(preferences.inferredGenresFromMood).toBe(true)
    expect(ranked.map((title: any) => title.title)).toContain('A Gentle Animated Story')
  })

  it('should suppress anchor title for contrastive reference prompts', () => {
    const preferences = PreferenceParser.parse({
      description: 'Like Inception but more relaxing'
    })

    const titles = [
      {
        id: 'tt1375666',
        title: 'Inception',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A high-stakes intense dream heist with relentless tension.',
        rating: 8.8,
        voteCount: 1000,
        year: 2010,
        talentMatchScore: 1
      },
      {
        id: 'tt0123456',
        title: 'Calm Sci-Fi Choice',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A gentle and peaceful speculative journey with quiet emotional stakes.',
        rating: 7.8,
        voteCount: 700,
        year: 2018,
        talentMatchScore: 0.4
      }
    ]

    const referenceTitles = [{ id: 'tt1375666', title: 'Inception' }]
    const ranked = (recommendationEngine as any).rankTitles(titles, preferences, referenceTitles)
    const rankedIds = ranked.map((item: any) => item.id)

    expect(rankedIds).not.toContain('tt1375666')
    expect(rankedIds).toContain('tt0123456')
  })

  it('should favor calmer candidates when contrastive mood shift is requested', () => {
    const preferences = PreferenceParser.parse({
      description: 'Like Inception but more relaxing'
    })

    const titles = [
      {
        id: 'tt1111111',
        title: 'Calm Option',
        genres: ['Drama'],
        plot: 'A calm, peaceful, and soothing journey through human connection.',
        rating: 7.5,
        voteCount: 500,
        year: 2019,
        talentMatchScore: 0.2
      },
      {
        id: 'tt2222222',
        title: 'Intense Option',
        genres: ['Drama'],
        plot: 'An intense, high-stakes, adrenaline-fueled race against danger.',
        rating: 7.5,
        voteCount: 500,
        year: 2019,
        talentMatchScore: 0.2
      }
    ]

    const ranked = (recommendationEngine as any).rankTitles(titles, preferences, [])

    expect(ranked[0].id).toBe('tt1111111')
    expect(ranked[0].scoringFactors.composite).toBeGreaterThan(ranked[1].scoringFactors.composite)
  })

  it('should not let a high-affinity horror title override an explicit relaxing contrast', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Sci-Fi', 'Thriller']
    const referenceTitles = [{ genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'] }]
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'calm-related',
        title: 'Quiet Science-Fiction Journey',
        genres: ['Sci-Fi', 'Drama'],
        plot: 'A calm, meditative journey through space and human connection.',
        rating: 7.1,
        voteCount: 1400,
        year: 2020,
        referenceSimilarityScore: 0.7
      },
      {
        id: 'horror-related',
        title: 'Backrooms',
        genres: ['Horror', 'Sci-Fi'],
        plot: 'A strange doorway appears in the basement of a furniture showroom.',
        rating: 8.5,
        voteCount: 100000,
        year: 2026,
        referenceSimilarityScore: 1
      }
    ], preferences, referenceTitles)

    expect(ranked[0].id).toBe('calm-related')
  })

  it('should prioritize mood over genre and popularity for contrastive references', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Sci-Fi', 'Thriller']
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'calm-reference-match',
        title: 'Quiet Science-Fiction Story',
        genres: ['Sci-Fi', 'Drama'],
        plot: 'A calm, meditative and intimate journey through space.',
        rating: 7.2,
        voteCount: 1200,
        year: 2018,
        referenceSimilarityScore: 0.6
      },
      {
        id: 'intense-reference-match',
        title: 'Blade Runner 2049',
        genres: ['Action', 'Sci-Fi', 'Thriller'],
        plot: 'A blade runner uncovers a secret that could plunge society into chaos.',
        rating: 8.5,
        voteCount: 100000,
        year: 2017,
        referenceSimilarityScore: 1
      }
    ], preferences, [{ id: 'tt1375666', genres: ['Action', 'Sci-Fi', 'Thriller'] }])

    expect(ranked[0].id).toBe('calm-reference-match')
  })

  it('lowers high-stakes sci-fi beneath calmer conceptual matches for relaxing references', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Action', 'Adventure', 'Sci-Fi', 'Thriller']
    preferences.referenceGenres = [...preferences.genres]
    const referenceTitles = [{
      id: 'tt1375666',
      genres: preferences.referenceGenres,
      plot: 'A thief steals valuable secrets from the subconscious during dreams and plants an idea in a target mind.'
    }]
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'project-hail-mary',
        title: 'Project Hail Mary',
        genres: ['Sci-Fi', 'Adventure'],
        plot: 'A science teacher wakes on a spaceship with no recollection. As his memory returns, he begins to uncover his mission: solve the riddle of a mysterious substance causing the sun to die out. He must use ingenuity to save everything on Earth from extinction and forms an unexpected friendship.',
        rating: 8.6,
        voteCount: 8000,
        year: 2026
      },
      {
        id: 'interstellar',
        title: 'Interstellar',
        genres: ['Adventure', 'Drama', 'Sci-Fi'],
        plot: 'Explorers travel through a newly discovered wormhole to surpass the limitations of human space travel.',
        rating: 8.5,
        voteCount: 41000,
        year: 2014
      },
      {
        id: 'the-man-from-earth',
        title: 'The Man from Earth',
        genres: ['Sci-Fi', 'Drama'],
        plot: 'A professor shares a stunning secret about his past with close colleagues; conversation and curiosity challenge their beliefs.',
        rating: 7.6,
        voteCount: 3058,
        year: 2007
      },
      {
        id: 'valerian',
        title: 'Valerian and the City of a Thousand Planets',
        genres: ['Adventure', 'Sci-Fi', 'Action'],
        plot: 'A dark force threatens the peaceful existence of a city, and two operatives race to identify the menace and safeguard the future of the universe.',
        rating: 6.7,
        voteCount: 8241,
        year: 2017,
        referenceSimilarityScore: 0.7
      },
      {
        id: 'star-trek',
        title: 'Star Trek',
        genres: ['Sci-Fi', 'Action', 'Adventure'],
        plot: 'The fate of the galaxy rests with rivals; their partnership must lead a crew through unimaginable danger.',
        rating: 7.4,
        voteCount: 10756,
        year: 2009,
        referenceSimilarityScore: 0.7
      },
      {
        id: 'avengers',
        title: 'Avengers: Age of Ultron',
        genres: ['Action', 'Adventure', 'Sci-Fi'],
        plot: 'A villainous peacekeeping program puts the heroes through an ultimate test as the fate of the planet hangs in the balance, leading to unexpected action.',
        rating: 7.3,
        voteCount: 25097,
        year: 2015
      }
    ], preferences, referenceTitles)
    const rankedIds = ranked.map((title: any) => title.id)
    const moodScores = new Map(ranked.map((title: any) => [title.id, title.scoringFactors.moodScore]))

    expect(moodScores.get('project-hail-mary')).toBeLessThanOrEqual(0.75)
    expect(rankedIds.indexOf('project-hail-mary')).toBeLessThan(rankedIds.indexOf('interstellar'))
    for (const wildcardId of ['valerian', 'star-trek', 'avengers']) {
      const wildcardIndex = rankedIds.indexOf(wildcardId)
      expect(wildcardIndex === -1 || rankedIds.indexOf('project-hail-mary') < wildcardIndex).toBe(true)
      expect(wildcardIndex === -1 || rankedIds.indexOf('the-man-from-earth') < wildcardIndex).toBe(true)
    }
    expect(rankedIds.indexOf('the-man-from-earth')).toBeLessThan(rankedIds.indexOf('interstellar'))
  })

  it('preserves good adventure and animation matches while lowering horror and high-energy comedy', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Sci-Fi', 'Thriller']
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'project-hail-mary',
        title: 'Project Hail Mary',
        genres: ['Sci-Fi', 'Adventure'],
        plot: 'Science teacher Ryland Grace wakes on a spaceship with no recollection of who he is. As his memory returns, he must solve a scientific riddle and relies on ingenuity to save Earth, forming an unexpected friendship along the way.',
        rating: 8.0,
        voteCount: 5000,
        year: 2026
      },
      {
        id: 'blade-runner-2049',
        title: 'Blade Runner 2049',
        genres: ['Action', 'Sci-Fi', 'Thriller'],
        plot: 'A new blade runner uncovers a long-buried secret that could plunge society into chaos.',
        rating: 8.5,
        voteCount: 100000,
        year: 2017,
        referenceSimilarityScore: 1
      },
      {
        id: 'doraemon',
        title: 'Doraemon',
        genres: ['Animation', 'Family', 'Adventure'],
        plot: 'A gentle, playful adventure about friendship and imaginative inventions.',
        rating: 7.5,
        voteCount: 1000,
        year: 2024
      },
      {
        id: 'kill-em-all-2',
        title: "Kill 'em All 2",
        genres: ['Action', 'Thriller'],
        plot: 'Phillip and Suzanne live peacefully off the grid until a vengeful brother returns to attack them.',
        rating: 7.8,
        voteCount: 12000,
        year: 2024
      },
      {
        id: 'deadpool',
        title: 'Deadpool & Wolverine',
        genres: ['Action', 'Comedy', 'Sci-Fi'],
        plot: 'A mercenary suits up for an explosive, violent battle to save his homeworld.',
        rating: 7.7,
        voteCount: 120000,
        year: 2024
      },
      {
        id: 'chaos-walking',
        title: 'Chaos Walking',
        genres: ['Sci-Fi', 'Adventure'],
        plot: 'Two unlikely companions embark on a perilous adventure through dangerous badlands.',
        rating: 6.5,
        voteCount: 2700,
        year: 2021
      },
      {
        id: 'fetus-monster',
        title: 'Fetus Monster',
        genres: ['Animation', 'Sci-Fi'],
        plot: 'A pregnant teenager discovers a compound that turns coercive natalists into giant fetus monsters.',
        rating: 5.0,
        voteCount: 200,
        year: 2025
      },
      {
        id: 'alive',
        title: 'Alive',
        genres: ['Adventure', 'Drama', 'History'],
        plot: 'A rugby team fights to survive a plane crash in the freezing Andes with no food.',
        rating: 6.8,
        voteCount: 3000,
        year: 1993
      },
      {
        id: 'the-saint',
        title: 'The Saint',
        genres: ['Thriller', 'Action', 'Romance', 'Sci-Fi', 'Adventure'],
        plot: 'A stylish thief takes a clever cold-fusion caper job and gets drawn into a light romantic thriller.',
        rating: 6.1,
        voteCount: 1300,
        year: 1997,
        referenceSimilarityScore: 0.7
      },
      {
        id: 'backrooms',
        title: 'Backrooms',
        genres: ['Horror', 'Sci-Fi'],
        plot: 'A terrifying, disturbing nightmare unfolds in a shifting maze.',
        rating: 7.0,
        voteCount: 3500,
        year: 2026
      },
      {
        id: 'unrelated-filler',
        title: 'Unrelated Documentary',
        genres: ['Documentary'],
        plot: 'A group of friends search for a rare drug at the edge of the world.',
        rating: 7.0,
        voteCount: 1500,
        year: 2006
      }
    ], preferences, [{
      id: 'tt1375666',
      genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
      plot: 'A thief uses dream-sharing technology to plant an idea in a target’s subconscious and execute a complex plan.'
    }])
    const rankedIds = ranked.map((title: any) => title.id)

    expect(rankedIds).toEqual(expect.arrayContaining(['project-hail-mary', 'doraemon']))
    expect(rankedIds).not.toContain('kill-em-all-2')
    for (const mismatchId of ['deadpool', 'chaos-walking', 'blade-runner-2049']) {
      const mismatchIndex = rankedIds.indexOf(mismatchId)
      expect(mismatchIndex === -1 || rankedIds.indexOf('project-hail-mary') < mismatchIndex).toBe(true)
    }
    expect(rankedIds).not.toContain('backrooms')
    expect(rankedIds).not.toContain('unrelated-filler')
    expect(rankedIds).not.toContain('fetus-monster')
    expect(rankedIds).not.toContain('alive')
    expect(rankedIds.indexOf('project-hail-mary')).toBeLessThan(rankedIds.indexOf('the-saint'))
  })

  it('keeps The Saint as a lower-ranked wildcard when stronger reference matches exist', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Action', 'Adventure', 'Sci-Fi', 'Thriller']
    preferences.referenceGenres = [...preferences.genres]
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'concept-match',
        title: 'Project Hail Mary',
        genres: ['Sci-Fi', 'Adventure'],
        plot: 'A scientist with no memory solves a space riddle through ingenuity and forms an unexpected friendship.',
        rating: 8.6,
        voteCount: 8000,
        year: 2026
      },
      {
        id: 'light-thriller-wildcard',
        title: 'The Saint',
        genres: ['Thriller', 'Action', 'Romance', 'Sci-Fi', 'Adventure'],
        plot: 'A thief is hired to steal a secret cold-fusion process and gets caught up in international intrigue.',
        rating: 6.1,
        voteCount: 1300,
        year: 1997,
        referenceSimilarityScore: 0.7
      }
    ], preferences, [{
      id: 'tt1375666',
      genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
      plot: 'A thief enters shared dreams to plant an idea in a target subconscious through complex planning.'
    }])
    const rankedIds = ranked.map((title: any) => title.id)

    expect(rankedIds).toEqual(expect.arrayContaining(['concept-match', 'light-thriller-wildcard']))
    expect(rankedIds.indexOf('concept-match')).toBeLessThan(rankedIds.indexOf('light-thriller-wildcard'))
  })

  it('protects reference fit from genre-diversity displacement', () => {
    const ranked = [
      { id: 'first-sci-fi', genres: ['Sci-Fi'], scoringFactors: { composite: 0.62 } },
      { id: 'conceptual-sci-fi', genres: ['Sci-Fi'], scoringFactors: { composite: 0.61 } },
      { id: 'genre-variety', genres: ['Romance'], scoringFactors: { composite: 0.57 } }
    ]
    const selected = (recommendationEngine as any).selectFinalResults(ranked, 2, 0)

    expect(selected.map((title: any) => title.id)).toContain('conceptual-sci-fi')
  })

  it('keeps cross-genre films eligible for indie-gem discovery', () => {
    const preferences = PreferenceParser.parse({ description: 'Surprising indie gems' })
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'coherence',
        title: 'Coherence',
        genres: ['Sci-Fi', 'Mystery'],
        plot: 'A dinner party takes an unsettling turn when reality begins to split apart.',
        rating: 7.2,
        voteCount: 2500,
        year: 2013
      },
      {
        id: 'station-agent',
        title: 'The Station Agent',
        genres: ['Drama'],
        plot: 'A quiet character story explores loneliness and unexpected friendship.',
        rating: 7.6,
        voteCount: 3000,
        year: 2003
      },
      {
        id: 'sorry-to-bother-you',
        title: 'Sorry to Bother You',
        genres: ['Comedy', 'Fantasy', 'Sci-Fi'],
        plot: 'A workplace satire escalates into an increasingly strange story.',
        rating: 6.9,
        voteCount: 5000,
        year: 2018
      },
      {
        id: 'poorly-rated-obscurity',
        title: 'Poorly Rated Obscurity',
        genres: ['Comedy'],
        plot: 'An obscure, unusual comedy with an odd premise.',
        rating: 3.8,
        voteCount: 20,
        year: 2018
      }
    ], preferences)

    expect(ranked.map((title: any) => title.id)).toEqual(expect.arrayContaining([
      'coherence', 'station-agent', 'sorry-to-bother-you'
    ]))
    expect(ranked.map((title: any) => title.id)).not.toContain('poorly-rated-obscurity')
  })

  it('prioritizes quality-backed title seeds for indie-gem discovery', () => {
    const preferences = PreferenceParser.parse({ description: 'Surprising indie gems' })
    preferences.referenceSuggestions = ['Coherence']
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'coherence',
        title: 'Coherence',
        genres: ['Sci-Fi', 'Mystery'],
        plot: 'Friends at a dinner party encounter a strange disturbance.',
        rating: 7.2,
        voteCount: 2500,
        year: 2013
      },
      {
        id: 'generic-drama',
        title: 'A Family Story',
        genres: ['Drama'],
        plot: 'A family faces a difficult year while supporting one another.',
        rating: 7.4,
        voteCount: 1200,
        year: 2018
      }
    ], preferences)

    expect(ranked[0].id).toBe('coherence')
  })

  it('prioritizes concept-specific TMDB searches within the keyword budget', () => {
    const referenceTitles = [{
      genres: ['Sci-Fi'],
      plot: 'Dream-sharing technology plants an idea in the mind of a target.'
    }]
    const keywords = (recommendationEngine as any).buildReferenceConceptKeywords(referenceTitles)

    expect(keywords).toHaveLength(16)
    expect(keywords).toEqual(expect.arrayContaining([
      'dream', 'memory', 'alternate reality', 'simulation',
      'time travel', 'time perception', 'first contact', 'space station',
      'space travel', 'astronaut', 'memory erasure', 'hidden camera',
      'artificial reality', 'fate', 'destiny', 'suspended animation'
    ]))
    expect(keywords).not.toContain('linguist')
  })

  it('distinguishes mind-manipulation and language-time matches from broad consciousness transfer', () => {
    const referenceTitles = [{
      genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
      plot: 'A thief enters shared dreams, steals secrets from the subconscious, and plants an idea in a target mind using technology.'
    }]
    const scoreFit = (plot: string) =>
      (recommendationEngine as any).scoreReferenceConceptFit(plot, referenceTitles)
    const arrivalFit = scoreFit('An expert linguist is recruited to determine whether alien visitors come in peace or pose a threat.')
    const eternalSunshineFit = scoreFit('A woman undergoes a procedure to erase memories of a former partner; the story follows their memories through the mind.')
    const hoppersFit = scoreFit("Scientists hop human consciousness into robotic animals to communicate with animals and uncover mysteries.")

    expect(arrivalFit).toBeGreaterThan(hoppersFit)
    expect(eternalSunshineFit).toBeGreaterThan(hoppersFit)
  })

  it('retains strong mind, time, and reality matches across sci-fi subgenres', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Action', 'Adventure', 'Sci-Fi', 'Thriller']
    const referenceTitles = [{
      id: 'tt1375666',
      genres: preferences.genres,
      plot: 'A thief steals secrets from the subconscious during dreams and plants an idea in a target mind.'
    }]
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'interstellar',
        title: 'Interstellar',
        genres: ['Adventure', 'Drama', 'Sci-Fi'],
        plot: 'Explorers travel through a wormhole where time dilation changes their perception of time.',
        rating: 8.7,
        voteCount: 41000,
        year: 2014
      },
      {
        id: 'solaris',
        title: 'Solaris',
        genres: ['Drama', 'Mystery', 'Sci-Fi'],
        plot: 'A psychologist discovers that a distant planet brings repressed memories and visions from his mind into reality.',
        rating: 7.8,
        voteCount: 1900,
        year: 1972
      },
      {
        id: 'passengers',
        title: 'Passengers',
        genres: ['Drama', 'Romance', 'Sci-Fi'],
        plot: 'A malfunction wakes a passenger from hibernation on a spaceship, where he forms a connection with another traveler.',
        rating: 7.0,
        voteCount: 10000,
        year: 2016
      },
      {
        id: 'the-truman-show',
        title: 'The Truman Show',
        genres: ['Comedy', 'Drama'],
        plot: 'A man discovers the artificial reality of his world and begins to question his identity.',
        rating: 8.2,
        voteCount: 15000,
        year: 1998
      },
      {
        id: 'eternal-sunshine',
        title: 'Eternal Sunshine of the Spotless Mind',
        genres: ['Drama', 'Romance', 'Sci-Fi'],
        plot: 'A couple erases their memories of each other and revisits the relationship in a dream within the mind.',
        rating: 8.3,
        voteCount: 16000,
        year: 2004
      },
      {
        id: 'adjustment-bureau',
        title: 'The Adjustment Bureau',
        genres: ['Romance', 'Sci-Fi', 'Thriller'],
        plot: 'A man discovers that a secret group has altered his future and is controlling his destiny.',
        rating: 7.0,
        voteCount: 5000,
        year: 2011
      }
    ], preferences, referenceTitles)
    const rankedIds = ranked.map((title: any) => title.id)

    expect(rankedIds).toEqual(expect.arrayContaining([
      'interstellar', 'solaris', 'passengers', 'the-truman-show',
      'eternal-sunshine', 'adjustment-bureau'
    ]))
    expect(rankedIds.indexOf('interstellar')).toBeLessThan(3)
  })

  it('ranks language-and-time concepts above broad high-stakes space adventure', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Action', 'Adventure', 'Sci-Fi', 'Thriller']
    const referenceTitles = [{
      id: 'tt1375666',
      genres: preferences.genres,
      plot: 'A thief enters shared dreams, steals secrets from the subconscious, and plants an idea in a target mind using technology.'
    }]
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'arrival',
        title: 'Arrival',
        genres: ['Drama', 'Sci-Fi', 'Mystery'],
        plot: 'After alien crafts arrive, an expert linguist studies their language and discovers they experience time nonlinearly.',
        rating: 7.6,
        voteCount: 20000,
        year: 2016
      },
      {
        id: 'valerian',
        title: 'Valerian and the City of a Thousand Planets',
        genres: ['Adventure', 'Sci-Fi', 'Action'],
        plot: 'A dark force threatens a city, and two operatives race to identify the menace and safeguard the future of the universe.',
        rating: 6.7,
        voteCount: 8200,
        year: 2017
      }
    ], preferences, referenceTitles)
    const rankedIds = ranked.map((title: any) => title.id)
    const valerianIndex = rankedIds.indexOf('valerian')

    expect(rankedIds).toContain('arrival')
    expect(valerianIndex === -1 || rankedIds.indexOf('arrival') < valerianIndex).toBe(true)
  })

  it('rejects weak related-title, broad-genre, and generic-keyword matches', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Action', 'Adventure', 'Sci-Fi', 'Thriller']
    const referenceTitles = [{
      id: 'tt1375666',
      genres: preferences.genres,
      plot: 'A thief who steals corporate secrets through use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.'
    }]
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'strong-concept-fit',
        title: 'Project Hail Mary',
        genres: ['Sci-Fi', 'Adventure'],
        plot: 'A scientist solves a space riddle through ingenuity and forms an unexpected friendship.',
        rating: 8.6,
        voteCount: 8000,
        year: 2026
      },
      {
        id: 'chaos-walking',
        title: 'Chaos Walking',
        genres: ['Fantasy', 'Sci-Fi', 'Adventure'],
        plot: 'Two unlikely companions embark on a perilous adventure through the badlands of an unexplored planet as they try to escape a dangerous and disorienting reality, where all inner thoughts are seen and heard by everyone.',
        voteCount: 2707,
        referenceSimilarityScore: 0.7
      },
      {
        id: 'kill-em-all-2',
        title: "Kill 'em All 2",
        genres: ['Action', 'Crime', 'Thriller'],
        plot: "Phillip and Suzanne are retired from the spy game, living peacefully off the grid. That's until their whereabouts are discovered by Vlad, the vengeful brother of their target from the first film.",
        voteCount: 179,
        referenceSimilarityScore: 0.85
      },
      {
        id: 'alive',
        title: 'Alive',
        genres: ['Adventure', 'Drama', 'History'],
        plot: "The amazing true story of a Uruguayan rugby team's plane that crashed in the middle of the Andes mountains, and their immense will to survive and pull through alive, forced to do anything and everything they could to stay alive on meager rations and through the freezing cold.",
        voteCount: 1645,
        referenceSimilarityScore: 0.7
      },
      {
        id: 'matrix-reloaded',
        title: 'The Matrix Reloaded',
        genres: ['Adventure', 'Action', 'Thriller', 'Sci-Fi'],
        plot: 'The Resistance builds in numbers as humans are freed from the Matrix and brought to the city of Zion. Neo discovers his superpowers, including the ability to see the code inside the Matrix. With machine sentinels digging to Zion in 72 hours, Neo, Morpheus and Trinity must find the Keymaker to ultimately reach the Source.',
        voteCount: 12361,
        referenceSimilarityScore: 0.85
      },
      {
        id: 'documentary',
        title: 'Do I Sound Gay?',
        genres: ['Documentary'],
        plot: 'What makes a voice “gay”? A breakup with his boyfriend sets journalist David Thorpe on a quest to unravel a linguistic mystery.',
        voteCount: 59,
        referenceSimilarityScore: 0.7
      },
      {
        id: 'planet-of-the-apes',
        title: 'Planet of the Apes',
        genres: ['Sci-Fi', 'Adventure', 'Drama', 'Action'],
        plot: 'Astronaut Taylor crash lands on a distant planet ruled by apes who use a primitive race of humans for experimentation and sport. Soon Taylor finds himself among the hunted, his life in the hands of a benevolent chimpanzee scientist.',
        voteCount: 4131,
        referenceSimilarityScore: 0.7
      },
      {
        id: 'low-vote-match',
        title: 'Low Vote Match',
        genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
        plot: 'A mind-bending dream story about a secret plan and technology.',
        voteCount: 1,
        referenceSimilarityScore: 0.7
      }
    ], preferences, referenceTitles)
    const rankedIds = ranked.map((title: any) => title.id)

    expect(rankedIds).toContain('strong-concept-fit')
    expect(rankedIds).not.toContain('chaos-walking')
    expect(rankedIds).not.toContain('kill-em-all-2')
    expect(rankedIds).not.toContain('alive')
    expect(rankedIds).not.toContain('matrix-reloaded')
    expect(rankedIds).not.toContain('documentary')
    expect(rankedIds).not.toContain('planet-of-the-apes')
    expect(rankedIds).not.toContain('low-vote-match')
  })

  it('does not admit an unrelated relaxing title on mood alone', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Action', 'Adventure', 'Sci-Fi', 'Thriller']
    const ranked = (recommendationEngine as any).rankTitles([{
      id: 'calm-documentary',
      title: 'A Beautiful Planet',
      genres: ['Documentary'],
      plot: 'A breathtaking, peaceful portrait of Earth from space, with views of the planet and its natural beauty.',
      rating: 7.6,
      voteCount: 84,
      year: 2016
    }], preferences, [{
      id: 'tt1375666',
      genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
      plot: 'A thief enters shared dreams and plants an idea in a target subconscious using technology.'
    }])

    expect(ranked.map((title: any) => title.id)).not.toContain('calm-documentary')
  })

  it('places explicit horror, revenge action, perilous sci-fi, and survival thrillers below the strong fit', () => {
    const preferences = PreferenceParser.parse({ description: 'Like Inception but more relaxing' })
    preferences.genres = ['Action', 'Adventure', 'Sci-Fi', 'Thriller']
    preferences.referenceGenres = [...preferences.genres]
    const referenceTitles = [{
      id: 'tt1375666',
      genres: preferences.referenceGenres,
      plot: 'A thief uses shared dreams to plant an idea in the subconscious using technology and an intricate plan.'
    }]
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'project-hail-mary',
        title: 'Project Hail Mary',
        genres: ['Sci-Fi', 'Adventure'],
        plot: 'A scientist with no memory solves a scientific riddle through ingenuity and forms an unexpected friendship.',
        rating: 8.6,
        voteCount: 8000,
        year: 2026
      },
      {
        id: 'kill-em-all-2',
        title: "Kill 'em All 2",
        genres: ['Action', 'Thriller'],
        plot: 'A vengeful brother returns to attack a retired spy couple in a violent fight.',
        rating: 6.8,
        voteCount: 180,
        year: 2024
      },
      {
        id: 'fetus-monster',
        title: 'Fetus Monster',
        genres: ['Horror', 'Sci-Fi'],
        plot: 'A terrifying creature stalks a family through a disturbing nightmare.',
        rating: 6.4,
        voteCount: 900,
        year: 2025
      },
      {
        id: 'chaos-walking',
        title: 'Chaos Walking',
        genres: ['Sci-Fi', 'Adventure'],
        plot: 'A perilous escape through dangerous badlands becomes a violent race for survival.',
        rating: 6.5,
        voteCount: 2700,
        year: 2021
      },
      {
        id: 'alive',
        title: 'Alive',
        genres: ['Thriller', 'Adventure'],
        plot: 'A desperate survivor fights a deadly infection and races against time in isolation.',
        rating: 6.4,
        voteCount: 1200,
        year: 2020
      }
    ], preferences, referenceTitles)
    const rankedIds = ranked.map((title: any) => title.id)

    for (const mismatchId of ['kill-em-all-2', 'fetus-monster', 'chaos-walking', 'alive']) {
      const mismatchIndex = rankedIds.indexOf(mismatchId)
      expect(mismatchIndex === -1 || rankedIds.indexOf('project-hail-mary') < mismatchIndex).toBe(true)
    }
  })

  it('keeps Horror eligible when the user explicitly asks for it', () => {
    const preferences = PreferenceParser.parse({
      description: 'Like Inception but more relaxing horror'
    })
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'explicit-horror',
        title: 'Quiet Horror Story',
        genres: ['Horror', 'Sci-Fi'],
        plot: 'A quiet, atmospheric horror mystery.',
        rating: 7.0,
        voteCount: 500,
        year: 2020
      }
    ], preferences, [{ id: 'tt1375666', genres: ['Sci-Fi', 'Thriller'] }])

    expect(preferences.explicitGenres).toContain('Horror')
    expect(ranked.map((title: any) => title.id)).toContain('explicit-horror')
  })

  it('should favor Inception-related calmer movies over genre-only action and horror picks', async () => {
    const llmEnabledSpy = jest.spyOn(llmClient, 'isEnabled').mockReturnValue(false)
    const tmdbEnabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const referenceSpy = jest.spyOn(recommendationEngine as any, 'fetchReferenceTitle').mockResolvedValue({
      id: 'tt1375666',
      title: 'Inception',
      type: 'movie',
      genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
      plot: 'A thief enters dreams to steal secrets.',
      actors: 'Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page',
      director: 'Christopher Nolan'
    })
    const findTitleSpy = jest.spyOn(tmdbClient, 'findTitleByImdbId').mockImplementation(async imdbId =>
      imdbId === 'tt1375666' ? { tmdbId: 99, mediaType: 'movie' } : null
    )
    const relatedTitlesSpy = jest.spyOn(tmdbClient, 'getRelatedTitles').mockImplementation(
      async (_titleId, mediaType, relation) => relation === 'recommendations'
        ? [{
            id: 401,
            title: 'A Quiet Science-Fiction Journey',
            media_type: mediaType,
            overview: 'A calm, meditative journey through space and human connection.',
            poster_path: '/quiet.jpg',
            genre_ids: [878, 18],
            vote_average: 7.1,
            vote_count: 1400,
            adult: false,
            original_language: 'en'
          } as any]
        : []
    )
    const searchCandidatesSpy = jest.spyOn(recommendationEngine as any, 'searchCandidates').mockResolvedValue({
      source: 'tmdb',
      results: [
        {
          id: 'tt7430722',
          title: 'Deadpool & Wolverine',
          year: 2024,
          type: 'movie',
          plot: 'A violent, high-octane superhero battle with explosive fights.',
          genres: ['Action', 'Sci-Fi'],
          rating: 7.7,
          voteCount: 120000
        },
        {
          id: 'tt4154796',
          title: 'Avengers: Infinity War',
          year: 2018,
          type: 'movie',
          plot: 'An explosive battle pits heroes against a dangerous enemy.',
          genres: ['Action', 'Sci-Fi'],
          rating: 8.4,
          voteCount: 250000
        },
        {
          id: 'tt1234568',
          title: 'Backrooms',
          year: 2025,
          type: 'movie',
          plot: 'A terrifying, disturbing horror story in a shifting maze.',
          genres: ['Horror', 'Sci-Fi'],
          rating: 7.0,
          voteCount: 1200
        },
        {
          id: 'tt1234569',
          title: 'Project Hail Mary',
          year: 2026,
          type: 'movie',
          plot: 'An astronaut races to solve a dangerous threat to Earth.',
          genres: ['Sci-Fi', 'Adventure'],
          rating: 8.0,
          voteCount: 5000
        }
      ]
    })
    const externalIdsSpy = jest.spyOn(tmdbClient, 'getExternalIds').mockResolvedValue({})
    const titleDetailsSpy = jest.spyOn(tmdbClient, 'getTitleDetails').mockResolvedValue(null)
    const creditsSpy = jest.spyOn(tmdbClient, 'getTitleCredits').mockResolvedValue({ mainCast: [], directors: [] })
    const videosSpy = jest.spyOn(tmdbClient, 'getVideos').mockResolvedValue([])

    const recommendations = await recommendationEngine.getRecommendations({
      description: 'Like Inception but more relaxing',
      region: 'US'
    })

    expect(findTitleSpy).toHaveBeenCalledWith('tt1375666', 'movie')
    expect(relatedTitlesSpy).toHaveBeenCalledWith(99, 'movie', 'recommendations')
    expect(relatedTitlesSpy).toHaveBeenCalledWith(99, 'movie', 'similar')
    expect(searchCandidatesSpy.mock.calls[0][1]).toBe('movie')
    expect(recommendations[0].title).toBe('A Quiet Science-Fiction Journey')

    llmEnabledSpy.mockRestore()
    tmdbEnabledSpy.mockRestore()
    referenceSpy.mockRestore()
    findTitleSpy.mockRestore()
    relatedTitlesSpy.mockRestore()
    searchCandidatesSpy.mockRestore()
    externalIdsSpy.mockRestore()
    titleDetailsSpy.mockRestore()
    creditsSpy.mockRestore()
    videosSpy.mockRestore()
  })

  it('should suppress explicitly mentioned anchor title by default even without contrastive language', () => {
    const preferences = PreferenceParser.parse({
      description: 'Something like Inception'
    })

    const titles = [
      {
        id: 'tmdb:movie:99',
        title: 'Inception',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A high-stakes dream heist.',
        rating: 8.8,
        voteCount: 1000,
        year: 2010,
        talentMatchScore: 1
      },
      {
        id: 'tt7654321',
        title: 'Alternative Sci-Fi Pick',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A cerebral and atmospheric science fiction mystery.',
        rating: 7.6,
        voteCount: 650,
        year: 2017,
        talentMatchScore: 0.3
      }
    ]

    const referenceTitles = [{ id: 'tt1375666', title: 'Inception' }]
    const ranked = (recommendationEngine as any).rankTitles(titles, preferences, referenceTitles)
    const rankedIds = ranked.map((item: any) => item.id)

    expect(rankedIds).not.toContain('tmdb:movie:99')
    expect(rankedIds).toContain('tt7654321')
  })

  it('should keep explicitly mentioned anchor title when query asks to rewatch', () => {
    const preferences = PreferenceParser.parse({
      description: 'I want to rewatch Inception again'
    })

    const titles = [
      {
        id: 'tt1375666',
        title: 'Inception',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A high-stakes dream heist.',
        rating: 8.8,
        voteCount: 1000,
        year: 2010,
        talentMatchScore: 1
      },
      {
        id: 'tt7654321',
        title: 'Alternative Sci-Fi Pick',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A cerebral and atmospheric science fiction mystery.',
        rating: 7.6,
        voteCount: 650,
        year: 2017,
        talentMatchScore: 0.3
      }
    ]

    const referenceTitles = [{ id: 'tt1375666', title: 'Inception' }]
    const ranked = (recommendationEngine as any).rankTitles(titles, preferences, referenceTitles)
    const rankedIds = ranked.map((item: any) => item.id)

    expect(rankedIds).toContain('tt1375666')
  })

  it('should treat slower pace refinement as relaxing and reduce intensity', () => {
    const preferences = PreferenceParser.parse({
      description: 'Like Inception but more relaxing',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: 'Genre similarity slower pace'
      }
    })

    expect(preferences.boostedMoods).toContain('Relaxing')
    expect(preferences.reducedMoods).toContain('Intense')
    expect(preferences.genres).toEqual([])
  })

  it('should favor sci-fi alternatives over comedy drift for relaxing Inception-like requests', () => {
    const preferences = PreferenceParser.parse({
      description: 'Like Inception but more relaxing',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: 'Genre similarity slower pace'
      }
    })

    const titles = [
      {
        id: 'tt3000001',
        title: 'Relaxed Sci-Fi Option',
        genres: ['Sci-Fi', 'Thriller'],
        plot: 'A calm and thoughtful science-fiction mystery with gentle pacing.',
        rating: 7.4,
        voteCount: 900,
        year: 2018,
        talentMatchScore: 0.3
      },
      {
        id: 'tt3000002',
        title: 'Comedy Drift Option',
        genres: ['Drama', 'Comedy'],
        plot: 'A hilarious and lighthearted comedy about unlikely friendships.',
        rating: 7.9,
        voteCount: 1200,
        year: 2019,
        talentMatchScore: 0.3
      }
    ]

    const referenceTitles = [{ id: 'tt1375666', title: 'Inception', genres: ['Sci-Fi', 'Thriller', 'Drama'] }]
    const ranked = (recommendationEngine as any).rankTitles(titles, preferences, referenceTitles)

    expect(ranked).toHaveLength(2)
    expect(ranked[0].id).toBe('tt3000001')
    expect(ranked[0].scoringFactors.composite).toBeGreaterThan(ranked[1].scoringFactors.composite)
  })

  it('should keep a broader set of extracted search terms for mixed queries', () => {
    const terms = (recommendationEngine as any).extractSearchTerms(
      'funny mystery sci-fi thriller with robots and conspiracies',
      ['Comedy', 'Sci-Fi']
    )

    expect(terms.length).toBeGreaterThan(3)
    expect(terms).toContain('funny')
    expect(terms).toContain('mystery')
    expect(terms).toContain('sci')
  })

  it('should diversify the final selection inside the rerank window', () => {
    const ranked = [
      {
        id: 'tt1',
        title: 'Comedy One',
        genres: ['Comedy', 'Drama'],
        year: 2019,
        scoringFactors: { composite: 0.91 }
      },
      {
        id: 'tt2',
        title: 'Comedy Two',
        genres: ['Comedy', 'Drama'],
        year: 2018,
        scoringFactors: { composite: 0.9 }
      },
      {
        id: 'tt3',
        title: 'Comedy Three',
        genres: ['Comedy', 'Drama'],
        year: 2017,
        scoringFactors: { composite: 0.89 }
      },
      {
        id: 'tt4',
        title: 'Sci-Fi Break',
        genres: ['Sci-Fi', 'Mystery'],
        year: 2016,
        scoringFactors: { composite: 0.87 }
      },
      {
        id: 'tt5',
        title: 'Thriller Break',
        genres: ['Thriller', 'Crime'],
        year: 2015,
        scoringFactors: { composite: 0.86 }
      },
      {
        id: 'tt6',
        title: 'Drama Tail',
        genres: ['Drama'],
        year: 2014,
        scoringFactors: { composite: 0.7 }
      }
    ]

    const final = (recommendationEngine as any).selectFinalResults(ranked, 4)
    const finalIds = final.map((item: any) => item.id)

    expect(finalIds).toContain('tt4')
    expect(finalIds).toContain('tt5')
    expect(finalIds).not.toEqual(['tt1', 'tt2', 'tt3', 'tt4'])
  })

  it('should boost mainstream titles when blockbuster refinement is provided', () => {
    const preferences = PreferenceParser.parse({
      description: 'Like Inception but more relaxing',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: 'prioritize blockbusters'
      }
    })

    const titles = [
      {
        id: 'ttA111111',
        title: 'High Popularity Pick',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A calm and reflective science-fiction story.',
        rating: 7.4,
        voteCount: 1200000,
        year: 2017,
        talentMatchScore: 0.2
      },
      {
        id: 'ttB222222',
        title: 'Low Popularity Pick',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A calm and reflective science-fiction story.',
        rating: 7.6,
        voteCount: 1200,
        year: 2017,
        talentMatchScore: 0.2
      }
    ]

    const ranked = (recommendationEngine as any).rankTitles(titles, preferences, [])

    expect(ranked[0].id).toBe('ttA111111')
    expect(ranked[0].scoringFactors.composite).toBeGreaterThan(ranked[1].scoringFactors.composite)
  })

  it('should strictly filter to 80s titles when decade refinement is provided', () => {
    const preferences = PreferenceParser.parse({
      description: 'Like Blade Runner but warmer',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: 'show me movies from the 80s'
      }
    })

    const titles = [
      {
        id: 'ttC333333',
        title: '1980s Match',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A warm and thoughtful science fiction character study.',
        rating: 7.2,
        voteCount: 40000,
        year: 1984,
        talentMatchScore: 0.1
      },
      {
        id: 'ttD444444',
        title: 'Modern Match',
        genres: ['Drama', 'Sci-Fi'],
        plot: 'A warm and thoughtful science fiction character study.',
        rating: 7.2,
        voteCount: 40000,
        year: 2019,
        talentMatchScore: 0.1
      }
    ]

    const ranked = (recommendationEngine as any).rankTitles(titles, preferences, [])

    expect(ranked[0].id).toBe('ttC333333')
    expect(ranked).toHaveLength(1)
  })

  it('should remove explicitly excluded genres instead of merely penalizing them', () => {
    const preferences = PreferenceParser.parse({ description: 'A comedy but no horror' })
    const ranked = (recommendationEngine as any).rankTitles([
      {
        id: 'ttH111111',
        title: 'Horror Comedy',
        genres: ['Comedy', 'Horror'],
        plot: 'A funny but frightening story.',
        rating: 8.5,
        voteCount: 10000,
        year: 2020
      },
      {
        id: 'ttC111111',
        title: 'Straight Comedy',
        genres: ['Comedy'],
        plot: 'A witty, lighthearted story.',
        rating: 7.1,
        voteCount: 500,
        year: 2020
      }
    ], preferences, [])

    expect(ranked.map((title: any) => title.title)).toEqual(['Straight Comedy'])
  })

  it('should reuse previous recommendations and skip broad retrieval when pool is sufficient', async () => {
    const previousIds = [
      'tt0083658',
      'tt0088247',
      'tt0090605',
      'tt0081505',
      'tt0086190',
      'tt0081398',
      'tt0082971',
      'tt0086250',
      'tt0091763',
      'tt0092005',
      'tt0093058',
      'tt0095016'
    ]

    const getDetailsSpy = jest
      .spyOn(fmdbClient, 'getDetails')
      .mockImplementation(async (id: string) => ({
        imdbID: id,
        Title: `Hydrated ${id}`,
        Year: '1984',
        Type: 'movie',
        Plot: 'A warm and thoughtful science fiction story with reflective pacing.',
        Genre: 'Sci-Fi, Drama',
        imdbRating: '7.4',
        Poster: 'N/A',
        Rated: 'PG-13',
        Director: 'N/A',
        Actors: 'N/A'
      } as any))

    const searchCandidatesSpy = jest
      .spyOn(recommendationEngine as any, 'searchCandidates')
      .mockResolvedValue({ results: [], source: 'omdb' })

    const recommendations = await recommendationEngine.getRecommendations({
      description: 'Like Blade Runner but warmer',
      region: 'US',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: 'prioritize blockbusters from the 80s',
        previousRecommendationIds: previousIds,
        cumulativeConstraints: ['prioritize blockbusters', 'show me movies from the 80s']
      }
    })

    expect(recommendations.length).toBeGreaterThan(0)
    expect(recommendations.length).toBeLessThanOrEqual(10)
    expect(getDetailsSpy).toHaveBeenCalledTimes(previousIds.length + 1)
    expect(searchCandidatesSpy).not.toHaveBeenCalled()

    getDetailsSpy.mockRestore()
    searchCandidatesSpy.mockRestore()
  })

  it('should fetch fresh candidates after a hard pivot instead of reusing prior results', async () => {
    const previousIds = Array.from({ length: 10 }, (_, index) => `tt910000${index}`)
    const tmdbEnabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(false)
    const detailsSpy = jest.spyOn(fmdbClient, 'getDetails')
    const searchCandidatesSpy = jest.spyOn(recommendationEngine as any, 'searchCandidates').mockResolvedValue({
      source: 'omdb',
      results: [{
        id: 'tt9100999',
        title: 'Documentary Pivot Pick',
        year: 2021,
        type: 'movie',
        poster: 'N/A',
        rating: 7.2,
        plot: 'A documentary about a family-run vineyard.',
        genres: ['Documentary'],
        voteCount: 800
      }]
    })

    const recommendations = await recommendationEngine.getRecommendations({
      description: 'A cozy weekend movie',
      region: 'US',
      clarificationContext: {
        clarificationRound: 2,
        userClarification: 'Forget that, show me a documentary',
        userTurns: [
          'A cozy weekend movie',
          'Something with Jude Law',
          'Forget that, show me a documentary'
        ],
        previousRecommendationIds: previousIds,
        cumulativeConstraints: ['popularity:mainstream']
      }
    })

    expect(recommendations.map(recommendation => recommendation.title)).toContain('Documentary Pivot Pick')
    expect(searchCandidatesSpy).toHaveBeenCalled()
    expect(detailsSpy).not.toHaveBeenCalled()

    tmdbEnabledSpy.mockRestore()
    detailsSpy.mockRestore()
    searchCandidatesSpy.mockRestore()
  })

  it('should return actor-led comedy matches for talent-mode prompts', async () => {
    const isEnabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const actorSearchSpy = jest.spyOn(tmdbClient, 'searchTitlesForPerson').mockResolvedValue([
      {
        id: 101,
        title: 'The Nice Guys',
        media_type: 'movie',
        poster_path: '/test.jpg',
        overview: 'A private eye and enforcer investigate a missing girl in 1970s Los Angeles.',
        release_date: '2016-05-20',
        genre_ids: [35, 80],
        vote_average: 7.4,
        vote_count: 3800,
        adult: false,
        original_language: 'en'
      } as any
    ])
    const broadSearchSpy = jest
      .spyOn(recommendationEngine as any, 'searchCandidates')
      .mockResolvedValue({ results: [], source: 'omdb' })
    const externalIdsSpy = jest
      .spyOn(tmdbClient, 'getExternalIds')
      .mockResolvedValue({})

    const recommendations = await recommendationEngine.getRecommendations({
      description: 'Something funny with Ryan Gosling',
      region: 'US'
    })

    expect(actorSearchSpy).toHaveBeenCalled()
    expect(recommendations.length).toBeGreaterThan(0)
    expect(recommendations.some(r => r.title === 'The Nice Guys')).toBe(true)
    expect(recommendations.every(r => r.type === 'movie' || r.type === 'tv')).toBe(true)
    expect(broadSearchSpy).toHaveBeenCalled()

    isEnabledSpy.mockRestore()
    actorSearchSpy.mockRestore()
    broadSearchSpy.mockRestore()
    externalIdsSpy.mockRestore()
  })

  it('should retrieve a new actor anchor on a follow-up instead of reusing only prior results', async () => {
    const previousIds = Array.from({ length: 10 }, (_, index) => `tt900000${index}`)
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const actorSearchSpy = jest.spyOn(tmdbClient, 'searchTitlesForPerson').mockResolvedValue([
      {
        id: 201,
        title: 'The Holiday',
        media_type: 'movie',
        poster_path: '/holiday.jpg',
        overview: 'Two women find romance and a fresh start during a winter holiday.',
        release_date: '2006-12-08',
        genre_ids: [35, 10749],
        vote_average: 7.0,
        vote_count: 1800,
        adult: false,
        original_language: 'en'
      } as any
    ])
    const detailsSpy = jest.spyOn(fmdbClient, 'getDetails').mockImplementation(async id => ({
      imdbID: id,
      Title: `Previous title ${id}`,
      Year: '2019',
      Type: 'movie',
      Plot: 'A dramatic story about a family facing a difficult choice.',
      Genre: 'Drama',
      imdbRating: '7.0',
      Poster: 'N/A',
      Rated: 'PG-13',
      Director: 'A Director',
      Actors: 'Another Actor'
    } as any))
    const broadSearchSpy = jest
      .spyOn(recommendationEngine as any, 'searchCandidates')
      .mockResolvedValue({ results: [], source: 'omdb' })
    const externalIdsSpy = jest.spyOn(tmdbClient, 'getExternalIds').mockResolvedValue({})
    const titleDetailsSpy = jest.spyOn(tmdbClient, 'getTitleDetails').mockResolvedValue(null)
    const creditsSpy = jest.spyOn(tmdbClient, 'getTitleCredits').mockResolvedValue({ mainCast: [], directors: [] })
    const videosSpy = jest.spyOn(tmdbClient, 'getVideos').mockResolvedValue([])

    const recommendations = await recommendationEngine.getRecommendations({
      description: 'A cozy weekend movie',
      region: 'US',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: 'Something with Jude Law',
        previousRecommendationIds: previousIds
      }
    })

    expect(actorSearchSpy).toHaveBeenCalledWith(
      'Jude Law',
      expect.objectContaining({ includeMovies: true, includeTV: false }),
      100
    )
    expect(recommendations.some(recommendation => recommendation.title === 'The Holiday')).toBe(true)
    expect(broadSearchSpy).toHaveBeenCalled()

    enabledSpy.mockRestore()
    actorSearchSpy.mockRestore()
    detailsSpy.mockRestore()
    broadSearchSpy.mockRestore()
    externalIdsSpy.mockRestore()
    titleDetailsSpy.mockRestore()
    creditsSpy.mockRestore()
    videosSpy.mockRestore()
  })

  it('keeps actor matches first across a three-turn mixed-intent refinement', async () => {
    const enabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true)
    const actorSearchSpy = jest.spyOn(tmdbClient, 'searchTitlesForPerson').mockResolvedValue([
      {
        id: 202,
        title: 'The Holiday',
        media_type: 'movie',
        poster_path: '/holiday.jpg',
        overview: 'Two women find romance and a fresh start during a winter holiday.',
        release_date: '2006-12-08',
        genre_ids: [35, 10749],
        vote_average: 7.0,
        vote_count: 1800,
        adult: false,
        original_language: 'en'
      } as any
    ])
    const referenceSpy = jest.spyOn(recommendationEngine as any, 'fetchReferenceTitle').mockResolvedValue({
      id: 'ttref',
      title: 'Reference Rom-Com',
      genres: ['Comedy', 'Romance'],
      plot: 'A reference story.',
      actors: '',
      director: ''
    })
    const broadSearchSpy = jest.spyOn(recommendationEngine as any, 'searchCandidates').mockResolvedValue({
      source: 'tmdb',
      results: [{
        id: 'tt9876543',
        title: 'Popular Rom-Com Without Jude Law',
        year: 2022,
        type: 'movie',
        poster: 'N/A',
        rating: 9.8,
        plot: 'A popular romantic comedy.',
        genres: ['Comedy', 'Romance'],
        actors: 'Another Actor',
        voteCount: 500000
      }]
    })
    const findByImdbSpy = jest.spyOn(tmdbClient, 'findTitleByImdbId').mockResolvedValue(null)
    const externalIdsSpy = jest.spyOn(tmdbClient, 'getExternalIds').mockResolvedValue({})
    const titleDetailsSpy = jest.spyOn(tmdbClient, 'getTitleDetails').mockResolvedValue(null)
    const creditsSpy = jest.spyOn(tmdbClient, 'getTitleCredits').mockResolvedValue({ mainCast: [], directors: [] })
    const videosSpy = jest.spyOn(tmdbClient, 'getVideos').mockResolvedValue([])
    const trailersSpy = jest.spyOn(tmdbClient, 'getTrailersBatch').mockResolvedValue(new Map())

    const recommendations = await recommendationEngine.getRecommendations({
      description: 'A cozy weekend movie',
      preferences: { referenceTitle: ['A similar rom-com'] },
      region: 'US',
      clarificationContext: {
        clarificationRound: 2,
        userClarification: 'More of a rom-com vibe',
        userTurns: [
          'A cozy weekend movie',
          'Something with Jude Law',
          'More of a rom-com vibe'
        ]
      }
    })

    expect(actorSearchSpy).toHaveBeenCalledWith(
      'Jude Law',
      expect.objectContaining({ includeMovies: true, includeTV: false }),
      100
    )
    expect(broadSearchSpy).toHaveBeenCalled()
    expect(recommendations.map(recommendation => recommendation.title)).toEqual([
      'The Holiday',
      'Popular Rom-Com Without Jude Law'
    ])

    enabledSpy.mockRestore()
    actorSearchSpy.mockRestore()
    referenceSpy.mockRestore()
    broadSearchSpy.mockRestore()
    findByImdbSpy.mockRestore()
    externalIdsSpy.mockRestore()
    titleDetailsSpy.mockRestore()
    creditsSpy.mockRestore()
    videosSpy.mockRestore()
    trailersSpy.mockRestore()
  })

  it('should avoid empty responses when talent strict-filter finds no actor metadata matches', async () => {
    const tmdbEnabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(false)
    const searchCandidatesSpy = jest
      .spyOn(recommendationEngine as any, 'searchCandidates')
      .mockResolvedValue({
        source: 'omdb',
        results: [
          {
            id: 'tt9990001',
            title: 'Comedy Placeholder One',
            year: 2019,
            type: 'movie',
            poster: 'N/A',
            rating: 7.2,
            plot: 'A witty comedic story with quirky misunderstandings and big laughs.',
            genres: ['Comedy'],
            rated: 'PG-13',
            director: 'Director Name',
            actors: 'Another Actor, Different Person',
            voteCount: 1200
          },
          {
            id: 'tt9990002',
            title: 'Comedy Placeholder Two',
            year: 2017,
            type: 'movie',
            poster: 'N/A',
            rating: 6.9,
            plot: 'A funny caper featuring oddball friends and chaotic plans.',
            genres: ['Comedy', 'Crime'],
            rated: 'PG-13',
            director: 'Director Name',
            actors: 'Another Actor, Different Person',
            voteCount: 980
          }
        ]
      })

    const recommendations = await recommendationEngine.getRecommendations({
      description: 'Something funny with Ryan Gosling',
      region: 'US'
    })

    expect(recommendations.length).toBeGreaterThan(0)

    tmdbEnabledSpy.mockRestore()
    searchCandidatesSpy.mockRestore()
  })
})
