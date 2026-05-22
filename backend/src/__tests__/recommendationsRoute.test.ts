import request from 'supertest'
import { app } from '../index'
import { recommendationEngine } from '../engine/recommendationEngine'

describe('POST /recommendations route guardrails', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should request clarification when recommendation quality is weak', async () => {
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
    expect(response.body.recommendations).toBeUndefined()
    expect(response.body.requiresClarification).toBeDefined()
    expect(response.body.requiresClarification.questions.length).toBeGreaterThan(0)
    expect(response.body.requiresClarification.context).toContain('one more detail')
    expect(response.body.requiresClarification.questions[0].options).not.toContain('Mood/tone')
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
})
