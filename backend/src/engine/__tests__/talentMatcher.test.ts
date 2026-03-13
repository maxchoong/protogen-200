/**
 * PHASE 6: Unit Tests for TalentMatcher
 * Tests cast/director similarity scoring logic
 */

import { TalentMatcher } from '../talentMatcher'

describe('TalentMatcher - Phase 2 Tests', () => {
  describe('extractTalent', () => {
    it('should extract actors and director from title', () => {
      const title = {
        title: 'Ocean\'s Eleven',
        actors: 'George Clooney, Brad Pitt, Matt Damon',
        director: 'Steven Soderbergh'
      }

      const result = TalentMatcher['extractTalent'](title)
      expect(result.actors).toContain('george clooney')
      expect(result.actors).toContain('brad pitt')
      expect(result.director).toContain('steven soderbergh')
    })

    it('should handle missing actors field', () => {
      const title = {
        title: 'Test Movie',
        director: 'Test Director'
      }

      const result = TalentMatcher['extractTalent'](title)
      expect(result.actors).toEqual([])
      expect(result.director).toContain('test director')
    })

    it('should handle N/A values', () => {
      const title = {
        title: 'Test Movie',
        actors: 'N/A',
        director: 'N/A'
      }

      const result = TalentMatcher['extractTalent'](title)
      // N/A is treated as normal strings (lowercase)
      expect(result.actors).toContain('n/a')
      expect(result.director).toContain('n/a')
    })
  })

  describe('findTalentMatch', () => {
    it('should find perfect cast match (100%)', () => {
      const candidate = {
        title: 'Ocean\'s Eleven',
        actors: 'George Clooney, Brad Pitt, Matt Damon, Andy Garcia',
        director: 'Steven Soderbergh'
      }

      const references = [
        {
          title: 'Ocean\'s Eleven',
          actors: 'George Clooney, Brad Pitt, Matt Damon, Andy Garcia',
          director: 'Steven Soderbergh'
        }
      ]

      const result = TalentMatcher.findTalentMatch(candidate, references)
      expect(result.combinedScore).toBe(1.0)
    })

    it('should find partial cast match', () => {
      const candidate = {
        title: 'Ocean\'s Twelve',
        actors: 'George Clooney, Brad Pitt, Matt Damon, Catherine Zeta-Jones',
        director: 'Steven Soderbergh'
      }

      const references = [
        {
          title: 'Ocean\'s Eleven',
          actors: 'George Clooney, Brad Pitt, Matt Damon, Andy Garcia',
          director: 'Steven Soderbergh'
        }
      ]

      const result = TalentMatcher.findTalentMatch(candidate, references)
      // 3 matching actors out of 4 reference actors = 75% match
      // Director match = 1.0
      // Combined: (0.75 * 0.7) + (1.0 * 0.3) = 0.525 + 0.3 = 0.825
      expect(result.combinedScore).toBeGreaterThan(0.7)
      expect(result.combinedScore).toBeLessThan(1.0)
    })

    it('should return 0 for no talent match', () => {
      const candidate = {
        title: 'The Matrix',
        actors: 'Keanu Reeves, Laurence Fishburne',
        director: 'Lana Wachowski, Lilly Wachowski'
      }

      const references = [
        {
          title: 'Ocean\'s Eleven',
          actors: 'George Clooney, Brad Pitt, Matt Damon',
          director: 'Steven Soderbergh'
        }
      ]

      const result = TalentMatcher.findTalentMatch(candidate, references)
      expect(result.combinedScore).toBe(0)
    })

    it('should handle empty reference array', () => {
      const candidate = {
        title: 'Ocean\'s Eleven',
        actors: 'George Clooney, Brad Pitt',
        director: 'Steven Soderbergh'
      }

      const result = TalentMatcher.findTalentMatch(candidate, [])
      expect(result.combinedScore).toBe(0)
    })

    it('should respect 70/30 weighting (actors/director)', () => {
      const candidate = {
        title: 'Test',
        actors: 'Actor A, Actor B',
        director: 'Steven Soderbergh'
      }

      const references = [
        {
          title: 'Reference',
          actors: 'Different Actor, Another Actor',
          director: 'Steven Soderbergh'
        }
      ]

      const result = TalentMatcher.findTalentMatch(candidate, references)
      // No actor match (0.0 * 0.7) + director match (1.0 * 0.3) = 0.3
      expect(result.combinedScore).toBe(0.3)
    })
  })

  describe('caching', () => {
    it('should cache talent match results', () => {
      const candidate = {
        title: 'Test Movie',
        actors: 'Actor A',
        director: 'Director A'
      }

      const references = [
        {
          title: 'Reference',
          actors: 'Actor A',
          director: 'Director A'
        }
      ]

      // First call
      const result1 = TalentMatcher.findTalentMatch(candidate, references)
      // Second call (should use cache)
      const result2 = TalentMatcher.findTalentMatch(candidate, references)

      expect(result1.combinedScore).toBe(result2.combinedScore)
    })
  })
})
