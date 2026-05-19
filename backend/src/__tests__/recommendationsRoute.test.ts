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
})
