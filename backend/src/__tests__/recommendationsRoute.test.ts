import request from 'supertest'
import { app } from '../index'
import { recommendationEngine, type Recommendation } from '../engine/recommendationEngine'
import { llmClient } from '../clients/llm'

describe('POST /recommendations route guardrails', () => {
  beforeEach(() => {
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue(null)
    jest.spyOn(llmClient, 'generateResultsIntro').mockResolvedValue(null)
    jest.spyOn(recommendationEngine, 'estimateAvailableTitles').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should return weak recommendations with applied constraints', async () => {
    const mockRecommendations = [
      {
        id: 'tt1234567',
        title: 'Weak Match One',
        year: '2015',
        type: 'movie',
        synopsis: 'A loosely related title.',
        score: 6.2,
        scoringFactors: { composite: 0.32 }
      },
      {
        id: 'tt7654321',
        title: 'Weak Match Two',
        year: '2012',
        type: 'movie',
        synopsis: 'Another weakly related title.',
        score: 6.0,
        scoringFactors: { composite: 0.28 }
      }
    ]

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Like Inception but more relaxing',
        region: 'US'
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
    expect(response.body.appliedConstraints).toEqual(expect.any(Array))
    expect(response.body).not.toHaveProperty('refinementSuggestions')
  })

  it('should bypass first-turn clarification for high-confidence non-mixed intent', async () => {
    const mockRecommendations = [
      {
        id: 'tt1856101',
        title: 'Blade Runner 2049',
        year: '2017',
        type: 'movie',
        synopsis: 'A replicant hunter uncovers a buried secret.',
        score: 8.0,
        scoringFactors: { composite: 0.61 }
      },
      {
        id: 'tt0137523',
        title: 'Fight Club',
        year: '1999',
        type: 'movie',
        synopsis: 'An office worker forms an underground fight club.',
        score: 8.8,
        scoringFactors: { composite: 0.57 }
      }
    ]

    const getRecommendationsSpy = jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Like Blade Runner but warmer',
        region: 'US'
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
    expect(getRecommendationsSpy).toHaveBeenCalledTimes(1)
  })

  it('should return recommendations when quality is strong', async () => {
    const mockRecommendations = [
      {
        id: 'tt2468101',
        title: 'Strong Match One',
        year: '2019',
        type: 'movie',
        synopsis: 'A strongly relevant recommendation.',
        score: 7.9,
        scoringFactors: { composite: 0.62 }
      },
      {
        id: 'tt1357913',
        title: 'Strong Match Two',
        year: '2020',
        type: 'movie',
        synopsis: 'Another strongly relevant recommendation.',
        score: 7.8,
        scoringFactors: { composite: 0.57 }
      }
    ]

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Like Inception but more relaxing',
        region: 'US'
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
    expect(response.body.llmDiagnostics).toEqual({
      used: false,
      stages: []
    })
  })

  it('should forward iterative refinement context to recommendation engine', async () => {
    const mockRecommendations = [
      {
        id: 'tt2468101',
        title: 'Strong Match One',
        year: '2019',
        type: 'movie',
        synopsis: 'A strongly relevant recommendation.',
        score: 7.9,
        scoringFactors: { composite: 0.62 }
      },
      {
        id: 'tt1357913',
        title: 'Strong Match Two',
        year: '2020',
        type: 'movie',
        synopsis: 'Another strongly relevant recommendation.',
        score: 7.8,
        scoringFactors: { composite: 0.57 }
      }
    ]

    const getRecommendationsSpy = jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Like Inception but more relaxing',
        region: 'US',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'prioritize blockbusters',
          userTurns: ['Like Inception but more relaxing', 'prioritize blockbusters'],
          previousRecommendationIds: ['tt1375666', 'tt0816692'],
          cumulativeConstraints: ['show me movies from the 80s']
        }
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
    expect(response.body.turnOperation).toBeDefined()
    expect(response.body.turnOperation).toEqual(
      expect.objectContaining({
        continuity: expect.any(String),
        operation: expect.any(String),
        confidence: expect.any(Number)
      })
    )
    expect(getRecommendationsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Like Inception but more relaxing',
        region: 'US',
        clarificationContext: expect.objectContaining({
          clarificationRound: 1,
          userClarification: 'prioritize blockbusters',
          userTurns: ['Like Inception but more relaxing', 'prioritize blockbusters'],
          previousRecommendationIds: ['tt1375666', 'tt0816692'],
          cumulativeConstraints: ['show me movies from the 80s']
        })
      }),
      10,
      expect.objectContaining({ used: false, stages: [] }),
      expect.any(Object)
    )
  })

  it('should apply top-N refinement as recommendation limit', async () => {
    const mockRecommendations = [
      {
        id: 'tt001',
        title: 'Match One',
        year: '2018',
        type: 'movie',
        synopsis: 'A relevant title.',
        score: 7.9,
        scoringFactors: { composite: 0.68 }
      },
      {
        id: 'tt002',
        title: 'Match Two',
        year: '2019',
        type: 'movie',
        synopsis: 'A relevant title.',
        score: 7.8,
        scoringFactors: { composite: 0.66 }
      },
      {
        id: 'tt003',
        title: 'Match Three',
        year: '2020',
        type: 'movie',
        synopsis: 'A relevant title.',
        score: 7.7,
        scoringFactors: { composite: 0.64 }
      }
    ]

    const getRecommendationsSpy = jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Something funny with Ryan Gosling',
        region: 'US',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'Show me the top 3 rated titles'
        }
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(getRecommendationsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Something funny with Ryan Gosling',
        clarificationContext: expect.objectContaining({
          clarificationRound: 1,
          userClarification: 'Show me the top 3 rated titles'
        })
      }),
      3,
      expect.objectContaining({ used: false, stages: [] }),
      expect.any(Object)
    )
  })

  it('should ask the next unresolved follow-up question when a meaningful gap remains', async () => {
    const mockRecommendations = [
      {
        id: 'tt1234567',
        title: 'Weak Match One',
        year: '2015',
        type: 'movie',
        synopsis: 'A loosely related title.',
        score: 6.2,
        scoringFactors: { composite: 0.31 }
      },
      {
        id: 'tt7654321',
        title: 'Weak Match Two',
        year: '2012',
        type: 'movie',
        synopsis: 'Another weakly related title.',
        score: 6.0,
        scoringFactors: { composite: 0.29 }
      }
    ]

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Fast',
        region: 'US',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'Mood/tone',
          askedQuestionIds: ['quality_disambiguate_intent']
        }
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
  })

  it('should stop asking clarification after max turns and return best available recommendations', async () => {
    const mockRecommendations = [
      {
        id: 'tt1234567',
        title: 'Weak Match One',
        year: '2015',
        type: 'movie',
        synopsis: 'A loosely related title.',
        score: 6.2,
        scoringFactors: { composite: 0.31 }
      },
      {
        id: 'tt7654321',
        title: 'Weak Match Two',
        year: '2012',
        type: 'movie',
        synopsis: 'Another weakly related title.',
        score: 6.0,
        scoringFactors: { composite: 0.29 }
      }
    ]

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Fast',
        region: 'US',
        clarificationContext: {
          clarificationRound: 3,
          userClarification: 'Movie',
          askedQuestionIds: ['quality_disambiguate_intent', 'quality_format_focus', 'quality_era_focus']
        }
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
  })

  it('should skip generic genre follow-up for reference similarity refinements', async () => {
    const mockRecommendations = [
      {
        id: 'tt1234567',
        title: 'Weak Match One',
        year: '2015',
        type: 'movie',
        synopsis: 'A loosely related title.',
        score: 6.2,
        scoringFactors: { composite: 0.31 }
      },
      {
        id: 'tt7654321',
        title: 'Weak Match Two',
        year: '2012',
        type: 'movie',
        synopsis: 'Another weakly related title.',
        score: 6.0,
        scoringFactors: { composite: 0.29 }
      }
    ]

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Like Inception but more relaxing',
        region: 'US',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'Genre similarity',
          askedQuestionIds: ['quality_reference_axis']
        }
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
  })

  it('should not ask for genre or type when talent intent already inferred comedy', async () => {
    const mockRecommendations = [
      {
        id: 'tt3799694',
        title: 'The Nice Guys',
        year: '2016',
        type: 'movie',
        synopsis: 'A mismatched pair investigates a conspiracy in 1970s Los Angeles.',
        score: 7.4,
        scoringFactors: { composite: 0.33 }
      },
      {
        id: 'tt1951265',
        title: 'The Place Beyond the Pines',
        year: '2012',
        type: 'movie',
        synopsis: 'An outlaw motorcycle stunt rider turns to robbing banks.',
        score: 7.3,
        scoringFactors: { composite: 0.29 }
      }
    ]

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Something funny with Ryan Gosling',
        region: 'US'
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
  })

  it('should finalize when a freeform answer resolves multiple clarification dimensions', async () => {
    const mockRecommendations = [
      {
        id: 'tt2468101',
        title: 'Strong Match One',
        year: '2019',
        type: 'movie',
        synopsis: 'A strongly relevant recommendation.',
        score: 7.9,
        scoringFactors: { composite: 0.62 }
      },
      {
        id: 'tt1357913',
        title: 'Strong Match Two',
        year: '2020',
        type: 'movie',
        synopsis: 'Another strongly relevant recommendation.',
        score: 7.8,
        scoringFactors: { composite: 0.57 }
      }
    ]

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Like Inception but more relaxing',
        region: 'US',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'Genre similarity and slower pace',
          askedQuestionIds: ['quality_reference_axis']
        }
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
  })

  it('should return near-threshold reference recommendations without clarification', async () => {
    const mockRecommendations = [
      {
        id: 'tt3315342',
        title: 'Logan',
        year: '2017',
        type: 'movie',
        synopsis: 'Mutant drama with sci-fi themes.',
        score: 8.1,
        scoringFactors: { composite: 0.444 }
      },
      {
        id: 'tt0816692',
        title: 'Interstellar',
        year: '2014',
        type: 'movie',
        synopsis: 'Explorers travel through a wormhole in space.',
        score: 8.4,
        scoringFactors: { composite: 0.443 }
      },
      {
        id: 'tt0338013',
        title: 'Eternal Sunshine of the Spotless Mind',
        year: '2004',
        type: 'movie',
        synopsis: 'A surreal romance blending memory and science fiction.',
        score: 8.3,
        scoringFactors: { composite: 0.436 }
      },
      {
        id: 'tt6644200',
        title: 'A Quiet Place',
        year: '2018',
        type: 'movie',
        synopsis: 'A family survives in silence under alien threat.',
        score: 7.5,
        scoringFactors: { composite: 0.434 }
      },
      {
        id: 'tt2543164',
        title: 'Arrival',
        year: '2016',
        type: 'movie',
        synopsis: 'A linguist helps communicate with extraterrestrials.',
        score: 7.9,
        scoringFactors: { composite: 0.432 }
      },
      {
        id: 'tt1798709',
        title: 'Her',
        year: '2013',
        type: 'movie',
        synopsis: 'A gentle futuristic romance with reflective pacing.',
        score: 8.0,
        scoringFactors: { composite: 0.431 }
      }
    ]

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockResolvedValue(mockRecommendations as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Like Inception but more relaxing',
        region: 'US'
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(6)
  })

  it('explains when the genre filter was relaxed for this request only', async () => {
    const recs = Array.from({ length: 6 }, (_, index) => ({
      id: `tt80000${index}`,
      title: `Series ${index}`,
      year: '2020',
      type: 'tv',
      synopsis: 'A tense drama.',
      score: 7.5,
      scoringFactors: { composite: 0.6 }
    }))

    jest
      .spyOn(recommendationEngine, 'getRecommendations')
      .mockImplementation(async (req, _limit, _llm, rankingDiagnostics) => {
        if (rankingDiagnostics && /western/i.test(req.clarificationContext?.userClarification || '')) {
          rankingDiagnostics.genreFilterRelaxed = ['Western']
        }
        return recs as any
      })

    const send = (clarification: string) => request(app)
      .post('/recommendations')
      .send({
        description: 'Korean series',
        region: 'US',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: clarification,
          askedQuestionIds: [],
          previousRecommendationIds: [],
          cumulativeConstraints: [],
          userTurns: ['Korean series', clarification]
        }
      })

    const [relaxed, normal] = await Promise.all([send('westerns'), send('comedies')])

    expect(relaxed.body.interpretationNote).toBe(
      "I couldn't find Korean series tagged as western, so these are the closest matches from the same search."
    )
    expect(relaxed.body.retrievalDiagnostics?.genreFilterRelaxed).toEqual(['Western'])
    expect(normal.body.interpretationNote).toBeUndefined()
    expect(normal.body.retrievalDiagnostics?.genreFilterRelaxed).toBeUndefined()
  })

  it('drops clarification options that would return no results', async () => {
    jest.spyOn(llmClient, 'isEnabled').mockReturnValue(true)
    jest.spyOn(llmClient, 'generateConversationalClarification').mockResolvedValue({
      context: 'Spanish series, great choice.',
      questions: [{
        id: 'direction',
        question: 'What kind of story?',
        type: 'select',
        options: ['Gritty crime thrillers', 'Feel-good comedies', 'Other (type your own)']
      }]
    })
    jest.spyOn(recommendationEngine, 'estimateAvailableTitles').mockImplementation(async prefs =>
      prefs.genres.includes('Comedy') ? 0 : 12
    )
    const getRecommendationsSpy = jest.spyOn(recommendationEngine, 'getRecommendations')

    const response = await request(app).post('/recommendations').send({ description: 'Spanish series', region: 'US' })

    expect(response.body.requiresClarification?.questions[0].options).toEqual([
      'Gritty crime thrillers',
      'Other (type your own)'
    ])
    expect(getRecommendationsSpy).not.toHaveBeenCalled()
  })

  it('skips clarification when no offered direction has results', async () => {
    jest.spyOn(llmClient, 'isEnabled').mockReturnValue(false)
    jest.spyOn(recommendationEngine, 'estimateAvailableTitles').mockResolvedValue(0)
    const recs = Array.from({ length: 6 }, (_, index) => ({
      id: `tt81000${index}`, title: `Series ${index}`, year: '2020', type: 'tv',
      synopsis: 'A drama.', score: 7.5, scoringFactors: { composite: 0.6 }
    }))
    jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue(recs as any)

    const response = await request(app).post('/recommendations').send({ description: 'Spanish series', region: 'US' })

    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(6)
  })

  it('explains empty results and offers only validated ways to widen the search', async () => {
    jest.spyOn(llmClient, 'isEnabled').mockReturnValue(false)
    jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue([])
    jest.spyOn(recommendationEngine, 'estimateAvailableTitles').mockImplementation(async prefs =>
      prefs.originalLanguage ? 0 : 25
    )

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Korean series',
        region: 'US',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'westerns',
          askedQuestionIds: [],
          previousRecommendationIds: [],
          cumulativeConstraints: [],
          userTurns: ['Korean series', 'westerns']
        }
      })

    expect(response.body.recommendations).toEqual([])
    expect(response.body.requiresClarification.context).toBe("I couldn't find any Korean western series in the catalog.")
    expect(response.body.requiresClarification.questions[0].options).toEqual([
      'Show me western series in any language instead'
    ])
  })
})

describe('POST /recommendations structured request', () => {
  const results: Recommendation[] = [
    { id: 'tt1', title: 'Headshot', year: '2016', type: 'movie', score: 8, scoringFactors: { composite: 0.7 } },
    { id: 'tt2', title: 'Photocopier', year: '2021', type: 'movie', score: 8, scoringFactors: { composite: 0.68 } }
  ].map(item => ({
    ...item,
    type: 'movie',
    synopsis: 'A strongly relevant recommendation.',
    posterUrl: '',
    scoringFactors: {
      genreScore: 0.7, moodScore: 0.7, talentScore: 0.7,
      ratingScore: 0.7, popularityScore: 0.7, recencyBoost: 0,
      ...item.scoringFactors
    }
  }))

  beforeEach(() => {
    jest.spyOn(llmClient, 'isEnabled').mockReturnValue(true)
    jest.spyOn(llmClient, 'generateResultsIntro').mockResolvedValue(null)
    jest.spyOn(llmClient, 'generateConversationalClarification').mockResolvedValue(null)
    jest.spyOn(recommendationEngine, 'estimateAvailableTitles').mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([
    { description: 'Indonesian horror films', spec: { countries: ['ID'], format: 'movie', genres: ['Horror'] } },
    { description: 'Spanish-language crime shows', spec: { languages: ['es'], format: 'tv', genres: ['Crime'] } },
    { description: 'comedy movies but no romance', spec: { format: 'movie', genres: ['Comedy'], excludeGenres: ['Romance'] } },
    { description: 'German films about World War II', spec: { countries: ['DE'], format: 'movie', themes: ['world war ii'] } },
    { description: 'horror movies released this month', spec: { format: 'movie', genres: ['Horror'], releasedWithinDays: 31 } }
  ])('tries results before clarifying a concrete request: $description', async ({ description, spec }) => {
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({ operation: 'new', spec })
    const engineSpy = jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue(results)

    const response = await request(app).post('/recommendations').send({ description })

    expect(response.status).toBe(200)
    expect(response.body.requiresClarification).toBeUndefined()
    expect(response.body.recommendations).toHaveLength(2)
    expect(engineSpy).toHaveBeenCalledTimes(1)
    expect(llmClient.generateConversationalClarification).not.toHaveBeenCalled()
  })

  it.each([
    { description: 'Malaysian movies', spec: { countries: ['MY'], format: 'movie' } },
    { description: 'something good to watch', spec: {} }
  ])('still clarifies an undirected request: $description', async ({ description, spec }) => {
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({ operation: 'new', spec })
    const engineSpy = jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue(results)

    const response = await request(app).post('/recommendations').send({ description })

    expect(response.body.requiresClarification.questions.length).toBeGreaterThan(0)
    expect(engineSpy).not.toHaveBeenCalled()
  })

  it('offers widening when a concrete structured search has no results', async () => {
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({
      operation: 'new',
      spec: { countries: ['KR'], format: 'tv', genres: ['Western'] }
    })
    jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue([])

    const response = await request(app).post('/recommendations').send({ description: 'Korean western series' })

    expect(response.body.recommendations).toEqual([])
    expect(response.body.requiresClarification.context).toContain("I couldn't find")
    expect(response.body.spec.countries).toEqual(['KR'])
  })

  it('understands a follow-up against the previous request and returns the updated spec', async () => {
    const parseSpy = jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({
      operation: 'add',
      spec: { countries: ['MY', 'ID', 'ZZ'], format: 'movie' }
    })
    const engineSpy = jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue(results as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Malaysian movies',
        spec: { countries: ['MY'], format: 'movie' },
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'What about Indonesian films too?',
          userTurns: ['Malaysian movies', 'What about Indonesian films too?'],
          previousRecommendationIds: ['tt9']
        }
      })

    expect(response.status).toBe(200)
    expect(parseSpy).toHaveBeenCalledWith(expect.objectContaining({
      latestTurn: 'What about Indonesian films too?',
      earlierTurns: ['Malaysian movies'],
      previousSpec: expect.objectContaining({ countries: ['MY'] })
    }))
    expect(response.body.spec).toEqual(expect.objectContaining({ countries: ['MY', 'ID'], format: 'movie' }))
    expect(response.body.turnOperation).toEqual(expect.objectContaining({ operation: 'widen' }))
    expect(response.body.llmDiagnostics.stages).toContain('request understanding')
    expect(engineSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({ countries: ['MY', 'ID'] }),
        previousSpec: expect.objectContaining({ countries: ['MY'] }),
        specOperation: 'add'
      }),
      expect.any(Number), expect.anything(), expect.anything()
    )
  })

  it.each([true, false])('preserves saved state and asks rather than applying an uncertain follow-up (LLM enabled: %s)', async enabled => {
    jest.spyOn(llmClient, 'isEnabled').mockReturnValue(enabled)
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue(null)
    const engineSpy = jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue(results as any)

    const response = await request(app)
      .post('/recommendations')
      .send({
        description: 'Malaysian movies',
        spec: { countries: ['MY'], format: 'movie' },
        clarificationContext: { clarificationRound: 1, userClarification: 'only recent ones' }
      })

    expect(response.status).toBe(200)
    expect(response.body.spec).toEqual(expect.objectContaining({ countries: ['MY'] }))
    expect(response.body.requiresClarification.context).toContain('previous request unchanged')
    expect(response.body.requiresClarification.questions[0].type).toBe('text')
    expect(response.body.recommendations).toBeUndefined()
    expect(response.body.llmDiagnostics.used).toBe(false)
    expect(engineSpy).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { operation: 'refine', spec: {} },
    { operation: 'refine', spec: { genres: ['Comedy'], format: 'movie' } },
    { operation: 'refine', spec: { countries: [], genres: ['Comedy'], format: 'movie' } }
  ])('does not apply unusable understanding: %j', async raw => {
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue(raw)
    const engineSpy = jest.spyOn(recommendationEngine, 'getRecommendations')
    const response = await request(app).post('/recommendations').send({
      description: 'Malaysian movies',
      spec: { countries: ['MY'], format: 'movie' },
      clarificationContext: { clarificationRound: 1, userClarification: 'heartwarming comedies' }
    })
    expect(response.body.spec.countries).toEqual(['MY'])
    expect(response.body.requiresClarification.questions[0].id).toBe('request_update_retry')
    expect(engineSpy).not.toHaveBeenCalled()
  })

  it('allows explicit constraint removal without restoring the old country', async () => {
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({
      operation: 'remove', spec: { countries: [], format: 'movie', genres: ['Comedy'] }
    })
    const engineSpy = jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue(results)
    const response = await request(app).post('/recommendations').send({
      description: 'Malaysian comedy movies',
      spec: { countries: ['MY'], format: 'movie', genres: ['Comedy'] },
      clarificationContext: { clarificationRound: 1, userClarification: 'any country is fine' }
    })
    expect(response.body.spec.countries).toEqual([])
    expect(response.body.requiresClarification).toBeUndefined()
    expect(engineSpy).toHaveBeenCalledWith(expect.objectContaining({
      specOperation: 'remove', spec: expect.objectContaining({ countries: [] })
    }), expect.any(Number), expect.anything(), expect.anything())
  })

  it('retains first-request rule fallback when understanding is unusable', async () => {
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({})
    const engineSpy = jest.spyOn(recommendationEngine, 'getRecommendations').mockResolvedValue(results)
    const response = await request(app).post('/recommendations').send({ description: 'gritty crime thrillers' })
    expect(response.status).toBe(200)
    expect(response.body.spec).toBeUndefined()
    expect(engineSpy).toHaveBeenCalled()
  })

  it('does not describe unverifiable release dates as certain catalogue absence', async () => {
    jest.spyOn(llmClient, 'parseRequestSpec').mockResolvedValue({
      operation: 'new', spec: { format: 'movie', releasedWithinDays: 31 }
    })
    jest.spyOn(recommendationEngine, 'getRecommendations').mockImplementation(async (_req, _limit, _llm, diagnostics) => {
      if (diagnostics) diagnostics.missingReleaseDates = 4
      return []
    })
    const response = await request(app).post('/recommendations').send({ description: 'movies released this month' })
    expect(response.body.retrievalDiagnostics.missingReleaseDates).toBe(4)
    expect(response.body.requiresClarification.context).toContain("couldn't verify their release dates")
    expect(response.body.requiresClarification.context).not.toContain('in the catalog')
  })
})
