import { PreferenceParser, RecommendationRequest } from '../preferenceParser'

describe('Phase 5: Intent Classification & Clarification', () => {
  describe('Intent Classification', () => {
    it('should detect mood intent from mood keywords', () => {
      const request: RecommendationRequest = {
        description: 'something cozy and relaxing'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.discoveryMode).toBe('mood')
      expect(preferences.intentConfidence).toBeGreaterThanOrEqual(0.65)
      expect(preferences.mood.length).toBeGreaterThan(0)
    })

    it('should detect talent intent from actor references', () => {
      const request: RecommendationRequest = {
        description: 'with Tom Hanks'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.discoveryMode).toBe('talent')
      expect(preferences.intentConfidence).toBeGreaterThanOrEqual(0.65)
      expect(preferences.detectedActors?.length).toBeGreaterThan(0)
    })

    it('should detect reference intent from title references', () => {
      const request: RecommendationRequest = {
        description: 'like Inception'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.discoveryMode).toBe('reference')
      expect(preferences.intentConfidence).toBeGreaterThanOrEqual(0.65)
    })

    it('should output mixed mode for conflicting signals', () => {
      const request: RecommendationRequest = {
        description: 'I want comedies like Inception with Ryan Gosling'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.discoveryMode).toBe('mixed')
      expect((preferences.intentConfidence || 0) < 0.75).toBe(true)
    })
  })

  describe('Clarification Gating', () => {
    it('should not require clarification for high-confidence queries', () => {
      const request: RecommendationRequest = {
        description: 'I want a thriller'
      }
      const preferences = PreferenceParser.parse(request)
      const needsClar = PreferenceParser.needsClarification(preferences, 0)

      expect(needsClar).toBeNull()
    })

    it('should generate clarification for low-confidence queries', () => {
      const request: RecommendationRequest = {
        description: 'funny but dark with action and great acting'
      }
      const preferences = PreferenceParser.parse(request)
      const clarification = PreferenceParser.needsClarification(preferences, 0)

      expect(clarification).not.toBeNull()
      if (clarification) {
        expect(clarification.length).toBeGreaterThan(0)
      }
    })

    it('should not require clarification on round > 0', () => {
      const request: RecommendationRequest = {
        description: 'I want something fun'
      }
      const preferences = PreferenceParser.parse(request)

      // Round 0: might need clarification
      const shouldSkip = PreferenceParser.needsClarification(preferences, 1)

      expect(shouldSkip).toBeNull()
    })

    it('should generate questions with proper types', () => {
      const request: RecommendationRequest = {
        description: 'dark but funny with Tom Cruise'
      }
      const preferences = PreferenceParser.parse(request)
      const clarification = PreferenceParser.needsClarification(preferences, 0)

      if (clarification) {
        expect(clarification.length).toBeGreaterThan(0)
        clarification.forEach((q: any) => {
          expect(['select', 'text', 'boolean']).toContain(q.type)
          if (q.type === 'select') {
            expect(q.options).toBeDefined()
            expect(Array.isArray(q.options)).toBe(true)
          }
        })
      }
    })
  })

  describe('Actor Extraction', () => {
    it('should extract actors from "with X" format', () => {
      const request: RecommendationRequest = {
        description: 'with Tom Hanks and Leonardo DiCaprio'
      }
      const preferences = PreferenceParser.parse(request)
      expect(preferences.detectedActors?.length).toBeGreaterThan(0)
      expect(preferences.detectedActors?.some((a: string) => a.toLowerCase().includes('tom'))).toBe(
        true
      )
    })

    it('should extract actors from "starring X" format', () => {
      const request: RecommendationRequest = {
        description: 'starring Ryan Gosling in an action movie'
      }
      const preferences = PreferenceParser.parse(request)
      expect(preferences.detectedActors?.length).toBeGreaterThan(0)
    })

    it('should handle multiple actors in query', () => {
      const request: RecommendationRequest = {
        description: 'with Christopher Nolan directing and Tom Hardy starring'
      }
      const preferences = PreferenceParser.parse(request)
      expect(preferences.detectedActors).toBeDefined()
    })
  })

  describe('Confidence Scoring', () => {
    it('should score intent confidence for single-signal queries', () => {
      const request1: RecommendationRequest = {
        description: 'cozy movies'
      }
      const preferences1 = PreferenceParser.parse(request1)

      const request2: RecommendationRequest = {
        description: 'with Brad Pitt'
      }
      const preferences2 = PreferenceParser.parse(request2)

      expect(preferences1.intentConfidence).toBeLessThanOrEqual(1)
      expect(preferences1.intentConfidence).toBeGreaterThanOrEqual(0)
      expect(preferences2.intentConfidence).toBeLessThanOrEqual(1)
      expect(preferences2.intentConfidence).toBeGreaterThanOrEqual(0)
    })

    it('should score lower for conflicting signals', () => {
      const request: RecommendationRequest = {
        description: 'funny dark dramas with action and romance'
      }
      const preferences = PreferenceParser.parse(request)

      expect((preferences.intentConfidence || 0) < 0.75).toBe(true)
    })
  })

  describe('Golden Prompt Guardrails', () => {
    it('should keep actor plus mood queries talent-compatible', () => {
      const request: RecommendationRequest = {
        description: 'Something funny with Ryan Gosling'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.discoveryMode).toBe('talent')
      expect((preferences.intentConfidence || 0)).toBeGreaterThanOrEqual(0.75)
      expect(preferences.detectedActors?.length).toBeGreaterThan(0)
      expect(PreferenceParser.needsClarification(preferences, 0)).toBeNull()
    })

    it('should preserve reference intent for contrastive mood queries', () => {
      const request: RecommendationRequest = {
        description: 'Like Inception but more relaxing'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.discoveryMode).toBe('reference')
      expect(preferences.isContrastiveReference).toBe(true)
      expect(preferences.boostedMoods).toContain('Relaxing')
      expect(preferences.reducedMoods).toContain('Intense')
      expect((preferences.intentConfidence || 0)).toBeGreaterThanOrEqual(0.75)
      expect(PreferenceParser.needsClarification(preferences, 0)).toBeNull()
    })

    it('should classify cozy weekend requests as confident mood intent', () => {
      const request: RecommendationRequest = {
        description: 'A cozy weekend movie'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.discoveryMode).toBe('mood')
      expect(preferences.contentType).toBe('movie')
      expect(preferences.genres).not.toContain('Action')
      expect(preferences.genres).toEqual(expect.arrayContaining(['Drama', 'Romance']))
      expect((preferences.intentConfidence || 0)).toBeGreaterThanOrEqual(0.85)
      expect(PreferenceParser.needsClarification(preferences, 0)).toBeNull()
    })

    it('should treat indie novelty queries as recognized discovery intent', () => {
      const request: RecommendationRequest = {
        description: 'Surprising indie gems'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.noveltyIntent).toBe(true)
      expect(preferences.genres).toContain('Indie')
      expect((preferences.intentConfidence || 0)).toBeGreaterThanOrEqual(0.65)
      expect(PreferenceParser.needsClarification(preferences, 0)).toBeNull()
    })

    it('should infer tv content type from show-oriented wording', () => {
      const request: RecommendationRequest = {
        description: 'A cozy weekend series'
      }
      const preferences = PreferenceParser.parse(request)

      expect(preferences.contentType).toBe('tv')
    })

    it('should parse blockbuster refinement as mainstream popularity preference', () => {
      const request: RecommendationRequest = {
        description: 'Like Inception but more relaxing',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'please prioritize blockbusters'
        }
      }

      const preferences = PreferenceParser.parse(request)

      expect(preferences.popularityPreference).toBe('mainstream')
      expect(preferences.constraints).toContain('popularity:mainstream')
    })

    it('should parse decade refinement from cumulative constraints', () => {
      const request: RecommendationRequest = {
        description: 'Like Blade Runner but warmer',
        clarificationContext: {
          clarificationRound: 1,
          userClarification: 'show me movies from the 80s',
          cumulativeConstraints: ['prioritize blockbusters']
        }
      }

      const preferences = PreferenceParser.parse(request)

      expect(preferences.yearRange).toBeDefined()
      expect(preferences.yearRange?.min).toBe(1980)
      expect(preferences.yearRange?.max).toBe(1989)
      expect(preferences.constraints).toContain('decade:1980s')
      expect(preferences.constraints).toContain('popularity:mainstream')
    })
  })
})
