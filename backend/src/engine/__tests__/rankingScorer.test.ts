/**
 * PHASE 6: Unit Tests for RankingScorer
 * Tests multi-factor composite scoring logic
 */

import { RankingScorer } from '../rankingScorer'
import { ParsedPreferences } from '../preferenceParser'

describe('RankingScorer - Phase 3 Tests', () => {
  const defaultPrefs: ParsedPreferences = {
    genres: ['Comedy', 'Drama'],
    mood: ['Funny', 'Thoughtful'],
    contentType: 'both',
    maxRating: 'R',
    moodStrength: new Map([
      ['Funny', 0.9],
      ['Thoughtful', 0.8]
    ])
  }

  describe('genreMatchScore', () => {
    it('should score perfect genre match as 1.0', () => {
      const itemGenres = ['Comedy', 'Drama']
      const preferredGenres = ['Comedy', 'Drama']

      const score = RankingScorer.genreMatchScore(itemGenres, preferredGenres)
      expect(score).toBe(1.0)
    })

    it('should score partial genre match', () => {
      const itemGenres = ['Comedy', 'Drama', 'Thriller']
      const preferredGenres = ['Comedy', 'Drama']

      const score = RankingScorer.genreMatchScore(itemGenres, preferredGenres)
      expect(score).toBe(1.0) // Both preferred genres present
    })

    it('should score single genre match', () => {
      const itemGenres = ['Comedy', 'Action']
      const preferredGenres = ['Comedy', 'Drama']

      const score = RankingScorer.genreMatchScore(itemGenres, preferredGenres)
      expect(score).toBeGreaterThan(0.4)
      expect(score).toBeLessThan(1.0)
    })

    it('should score reference matches against the full anchor genre profile', () => {
      const factors = RankingScorer.calculateCompositeScore({
        genres: ['Sci-Fi'],
        plot: 'A speculative story.'
      }, {
        genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
        explicitGenres: [],
        referenceGenres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
        mood: [],
        contentType: 'movie',
        maxRating: 'R'
      })

      expect(factors.genreScore).toBe(0.25)
    })

    it('should treat one of several reference genres as a partial match', () => {
      const score = RankingScorer.genreMatchScore(['Sci-Fi'], ['Sci-Fi', 'Thriller'])

      expect(score).toBe(0.5)
    })

    it('should score no genre match as 0', () => {
      const itemGenres = ['Action', 'Sci-Fi']
      const preferredGenres = ['Comedy', 'Drama']

      const score = RankingScorer.genreMatchScore(itemGenres, preferredGenres)
      expect(score).toBe(0)
    })

    it('should handle empty genres', () => {
      expect(RankingScorer.genreMatchScore([], ['Comedy'])).toBe(0)
      expect(RankingScorer.genreMatchScore(['Comedy'], [])).toBe(0)
    })
  })

  describe('moodMatchScore', () => {
    it('should detect mood keywords in plot', () => {
      const plot = 'A hilarious and thoughtful comedy about life'
      const moods = ['Funny', 'Thoughtful']
      const moodStrength = new Map([['Funny', 0.9], ['Thoughtful', 0.8]])

      const score = RankingScorer.moodMatchScore(plot, moods, moodStrength)
      expect(score).toBeGreaterThan(0.5)
    })

    it('should weight by mood confidence', () => {
      const plot = 'A philosophical thought-provoking film'
      const moods = ['Thoughtful']
      const highConfidence = new Map([['Thoughtful', 1.0]])
      const lowConfidence = new Map([['Thoughtful', 0.3]])

      const scoreHigh = RankingScorer.moodMatchScore(plot, moods, highConfidence)
      const scoreLow = RankingScorer.moodMatchScore(plot, moods, lowConfidence)

      expect(scoreHigh).toBeGreaterThan(scoreLow)
    })

    it('should return 0 for no mood matches', () => {
      const plot = 'An action-packed adventure'
      const moods = ['Funny', 'Thoughtful']
      const moodStrength = new Map([['Funny', 0.9], ['Thoughtful', 0.8]])

      const score = RankingScorer.moodMatchScore(plot, moods, moodStrength)
      expect(score).toBe(0)
    })

    it('should discount relaxing language contradicted by a violent premise', () => {
      const moods = ['Relaxing']
      const strength = new Map([['Relaxing', 1]])
      const peacefulStory = RankingScorer.moodMatchScore(
        'A gentle, peaceful story about two friends.',
        moods,
        strength
      )
      const violentStory = RankingScorer.moodMatchScore(
        'They live peacefully until a vengeful brother returns for revenge.',
        moods,
        strength
      )

      expect(violentStory).toBeLessThan(peacefulStory)
    })

    it('should discount incidental calm words contradicted by urgent stakes', () => {
      const moods = ['Relaxing']
      const strength = new Map([['Relaxing', 1]])
      const peacefulStory = RankingScorer.moodMatchScore(
        'A gentle, peaceful story about friends sharing an easy day.',
        moods,
        strength,
        ['Relaxing'],
        [],
        true
      )
      const highStakesPlots = [
        'A scientist must solve a riddle and use unorthodox ideas to save everything on Earth from extinction.',
        'A dark force threatens the peaceful existence of the city, and the heroes race to safeguard the future of the universe.',
        'The fate of the galaxy rests with rivals whose partnership must lead the crew through unimaginable danger.'
      ]

      for (const plot of highStakesPlots) {
        expect(RankingScorer.moodMatchScore(
          plot,
          moods,
          strength,
          ['Relaxing'],
          ['Intense'],
          true
        )).toBeLessThanOrEqual(0.55)
      }
      expect(RankingScorer.moodMatchScore(
        'A scientist saves Earth from extinction while building an unexpected friendship; their humour keeps the journey hopeful.',
        moods,
        strength,
        ['Relaxing'],
        ['Intense'],
        true
      )).toBeCloseTo(0.75)
      expect(RankingScorer.moodMatchScore(
        'A perilous survival mission ends in a crash.',
        moods,
        strength,
        ['Relaxing'],
        ['Intense'],
        true
      )).toBeLessThanOrEqual(0.2)
      expect(RankingScorer.relaxingConflictMultiplier(
        'A man chooses to fight for his destiny and love.'
      )).toBe(1)
      expect(peacefulStory).toBeGreaterThan(0.8)
    })

    it('should recognize cooperative science problem-solving only for relaxing reference requests', () => {
      const plot = 'A scientist with no recollection of his mission must solve a scientific riddle with ingenuity and forms an unexpected friendship.'
      const moods = ['Relaxing']
      const strength = new Map([['Relaxing', 0.9]])

      expect(RankingScorer.moodMatchScore(plot, moods, strength)).toBe(0)
      expect(RankingScorer.moodMatchScore(plot, moods, strength, ['Relaxing'], ['Intense'], true)).toBeGreaterThan(0)
    })

    it('should handle empty plot or moods', () => {
      expect(RankingScorer.moodMatchScore('', ['Funny'], new Map())).toBe(0)
      expect(RankingScorer.moodMatchScore('Plot text', [], new Map())).toBe(0)
    })

    it('should boost and reduce moods for contrastive requests', () => {
      const plot = 'A gentle and peaceful story that stays calm.'
      const moods = ['Relaxing']
      const moodStrength = new Map([['Relaxing', 0.7]])

      const neutral = RankingScorer.moodMatchScore(plot, moods, moodStrength)
      const boosted = RankingScorer.moodMatchScore(plot, moods, moodStrength, ['Relaxing'], [])
      const reduced = RankingScorer.moodMatchScore(plot, moods, moodStrength, [], ['Relaxing'])

      expect(boosted).toBeGreaterThan(neutral)
      expect(reduced).toBeLessThan(neutral)
    })
  })

  describe('ratingScore', () => {
    it('should normalize 0-10 rating to 0-1', () => {
      expect(RankingScorer.ratingScore(10)).toBe(1.0)
      expect(RankingScorer.ratingScore(5)).toBe(0.5)
      expect(RankingScorer.ratingScore(0)).toBe(0.5) // Default for 0
    })

    it('should return 0.5 for undefined/null', () => {
      expect(RankingScorer.ratingScore(undefined)).toBe(0.5)
      expect(RankingScorer.ratingScore(null as any)).toBe(0.5)
    })

    it('should handle edge cases', () => {
      expect(RankingScorer.ratingScore(9.5)).toBe(0.95)
      expect(RankingScorer.ratingScore(1)).toBe(0.1)
    })
  })

  describe('popularityScore', () => {
    it('should use log scale for votes', () => {
      expect(RankingScorer.popularityScore(1000000)).toBeLessThanOrEqual(1.0)
      expect(RankingScorer.popularityScore(1000)).toBeGreaterThan(0)
      expect(RankingScorer.popularityScore(10)).toBeLessThan(0.3)
    })

    it('should return 0.5 for undefined/null', () => {
      expect(RankingScorer.popularityScore(undefined)).toBe(0.5)
      expect(RankingScorer.popularityScore(null as any)).toBe(0.5)
    })

    it('should handle 0 votes', () => {
      expect(RankingScorer.popularityScore(0)).toBe(0.5)
    })
  })

  describe('recencyBoost', () => {
    it('should boost recent titles', () => {
      expect(RankingScorer.recencyBoost(2025)).toBe(1.0) // 1 year old
      expect(RankingScorer.recencyBoost(2023)).toBe(0.8) // 3 years old
      expect(RankingScorer.recencyBoost(2016)).toBe(0.6) // 10 years old
      expect(RankingScorer.recencyBoost(2000)).toBe(0.4) // 26 years old
    })

    it('should return 0.5 for undefined/null', () => {
      expect(RankingScorer.recencyBoost(undefined)).toBe(0.5)
      expect(RankingScorer.recencyBoost(null as any)).toBe(0.5)
    })
  })

  describe('talentMatchScore', () => {
    it('should cap talent score at 1.0', () => {
      const score = RankingScorer.talentMatchScore(1.5)
      expect(score).toBe(1.0)
    })

    it('should return 0 for undefined', () => {
      expect(RankingScorer.talentMatchScore(undefined)).toBe(0)
    })

    it('should pass through valid scores', () => {
      expect(RankingScorer.talentMatchScore(0.5)).toBe(0.5)
      expect(RankingScorer.talentMatchScore(0)).toBe(0)
    })
  })

  describe('calculateCompositeScore', () => {
    it('should calculate weighted composite score', () => {
      const title = {
        id: 'tt123',
        title: 'Test Movie',
        genres: ['Comedy', 'Drama'],
        plot: 'A funny and thoughtful film',
        rating: 8.0,
        voteCount: 10000,
        year: 2024,
        talentMatchScore: 0.5
      }

      const factors = RankingScorer.calculateCompositeScore(title, defaultPrefs)

      expect(factors.composite).toBeGreaterThan(0)
      expect(factors.composite).toBeLessThanOrEqual(1.0)
      expect(factors.genreScore).toBeDefined()
      expect(factors.moodScore).toBeDefined()
      expect(factors.talentScore).toBeDefined()
      expect(factors.ratingScore).toBeDefined()
      expect(factors.popularityScore).toBeDefined()
      expect(factors.recencyBoost).toBeDefined()
    })

    it('should apply correct weights', () => {
      const perfectMatch = {
        id: 'tt123',
        title: 'Perfect',
        genres: ['Comedy', 'Drama'],
        plot: 'A hilarious and thought-provoking film',
        rating: 10,
        voteCount: 1000000,
        year: 2024,
        talentMatchScore: 1.0
      }

      const factors = RankingScorer.calculateCompositeScore(perfectMatch, defaultPrefs)
      // High scores on all factors should result in high composite
      expect(factors.composite).toBeGreaterThan(0.8)
    })

    it('should handle all null values gracefully', () => {
      const poorMatch = {
        id: 'tt456',
        title: 'Poor Match',
        genres: ['Action'],
        plot: 'An intense action sequence',
        rating: undefined,
        voteCount: undefined,
        year: undefined,
        talentMatchScore: 0
      }

      const factors = RankingScorer.calculateCompositeScore(poorMatch, defaultPrefs)
      expect(factors.composite).toBeGreaterThanOrEqual(0)
      expect(factors.composite).toBeLessThanOrEqual(1.0)
    })

    it('should favor lower-popularity titles when novelty intent is set', () => {
      const noveltyPrefs: ParsedPreferences = {
        ...defaultPrefs,
        noveltyIntent: true
      }

      const highPopularity = {
        id: 'ttA',
        title: 'High Popularity',
        genres: ['Comedy', 'Drama'],
        plot: 'A hilarious and thoughtful film',
        rating: 8.0,
        voteCount: 1000000,
        year: 2024,
        talentMatchScore: 0
      }

      const lowPopularity = {
        ...highPopularity,
        id: 'ttB',
        title: 'Low Popularity',
        voteCount: 200
      }

      const highFactors = RankingScorer.calculateCompositeScore(highPopularity, noveltyPrefs)
      const lowFactors = RankingScorer.calculateCompositeScore(lowPopularity, noveltyPrefs)
      const lowQualityHiddenTitle = {
        ...lowPopularity,
        id: 'ttC',
        rating: 4.5
      }
      const lowQualityFactors = RankingScorer.calculateCompositeScore(lowQualityHiddenTitle, noveltyPrefs)

      expect(lowFactors.composite).toBeGreaterThan(highFactors.composite)
      expect(highFactors.composite).toBeGreaterThan(lowQualityFactors.composite)
    })
  })

  describe('rankTitles', () => {
    it('should sort titles by composite score descending', () => {
      const titles = [
        {
          id: 'tt1',
          title: 'Good Match',
          genres: ['Comedy'],
          plot: 'Funny plot',
          rating: 8.0,
          voteCount: 50000,
          year: 2024,
          talentMatchScore: 0
        },
        {
          id: 'tt2',
          title: 'Poor Match',
          genres: ['Horror'],
          plot: 'Scary plot',
          rating: 6.0,
          voteCount: 1000,
          year: 2000,
          talentMatchScore: 0
        }
      ]

      const ranked = RankingScorer.rankTitles(titles, defaultPrefs)

      expect(ranked[0].scoringFactors.composite).toBeGreaterThanOrEqual(
        ranked[1].scoringFactors.composite
      )
    })

    it('should include scoring factors in all results', () => {
      const titles = [
        {
          id: 'tt1',
          title: 'Movie 1',
          genres: ['Comedy'],
          plot: 'Test',
          rating: 7.0,
          voteCount: 10000,
          year: 2023
        }
      ]

      const ranked = RankingScorer.rankTitles(titles, defaultPrefs)

      expect(ranked[0].scoringFactors).toBeDefined()
      expect(ranked[0].scoringFactors.composite).toBeDefined()
    })
  })

  describe('explainScore', () => {
    it('should format scoring explanation', () => {
      const title = { title: 'Test Movie' }
      const factors = {
        genreScore: 0.8,
        moodScore: 0.6,
        talentScore: 0.4,
        ratingScore: 0.9,
        popularityScore: 0.7,
        recencyBoost: 0.5,
        composite: 0.7
      }

      const explanation = RankingScorer.explainScore(title, factors)

      expect(explanation).toContain('Test Movie')
      expect(explanation).toContain('80%')
      expect(explanation).toContain('70%') // composite as percentage
    })
  })
})
