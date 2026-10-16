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

    it('scores a known count of 0 votes below any rated title', () => {
      expect(RankingScorer.popularityScore(0)).toBe(0)
      expect(RankingScorer.popularityScore(16)).toBeGreaterThan(0)
    })
  })

  describe('adjustedRating', () => {
    it('pulls ratings with few votes towards the prior', () => {
      expect(RankingScorer.adjustedRating(8.0, 4)!).toBeCloseTo(6.28, 1)
      expect(RankingScorer.adjustedRating(7.7, 17)!).toBeCloseTo(6.69, 1)
      expect(RankingScorer.adjustedRating(8.5, 40000)!).toBeCloseTo(8.5, 2)
    })

    it('uses the prior for unrated titles and keeps raw ratings when votes are unknown', () => {
      expect(RankingScorer.adjustedRating(undefined, 0)).toBe(RankingScorer.RATING_PRIOR)
      expect(RankingScorer.adjustedRating(7.2, undefined)).toBe(7.2)
    })
  })

  describe('toneGenreConflictMultiplier', () => {
    const warm: ParsedPreferences = { ...defaultPrefs, genres: ['Comedy', 'Drama'], mood: ['Happy'] }

    it('penalises horror and war titles for warm, light requests', () => {
      expect(RankingScorer.toneGenreConflictMultiplier(['Drama', 'Horror'], warm)).toBe(0.55)
      expect(RankingScorer.toneGenreConflictMultiplier(['Action', 'War'], warm)).toBe(0.8)
      expect(RankingScorer.toneGenreConflictMultiplier(['Comedy', 'Family'], warm)).toBe(1)
    })

    it('keeps genres the user asked for and darker moods unpenalised', () => {
      expect(RankingScorer.toneGenreConflictMultiplier(['Comedy', 'Horror'], { ...warm, genres: ['Comedy', 'Horror'] })).toBe(1)
      expect(RankingScorer.toneGenreConflictMultiplier(['Thriller'], { ...warm, mood: ['Happy', 'Suspenseful'] })).toBe(1)
      expect(RankingScorer.toneGenreConflictMultiplier(['Horror'], { ...defaultPrefs, mood: [] })).toBe(1)
    })

    it('ranks a warm drama above a horror drama for a heartfelt request', () => {
      const ranked = RankingScorer.rankTitles([
        { id: 'roh', title: 'Roh', genres: ['Drama', 'Horror'], rating: 6.5, voteCount: 40, year: 2020, plot: 'A family in the jungle.' },
        { id: 'mukhsin', title: 'Mukhsin', genres: ['Drama', 'Comedy'], rating: 6.9, voteCount: 16, year: 2007, plot: 'A family in a village.' }
      ], warm)
      expect(ranked[0].id).toBe('mukhsin')
    })
  })

  describe('vote-aware ranking in small catalogues', () => {
    const base = { genres: ['Comedy', 'Drama'], plot: 'A warm family story.', talentMatchScore: 0 }
    const malaysianPool = [
      { ...base, id: 'home', title: 'Home, Almost', year: 2026, rating: undefined, voteCount: 0 },
      { ...base, id: 'dance', title: 'Dance of the Damned', year: 2026, rating: 8.0, voteCount: 4 },
      { ...base, id: 'sandiwara', title: 'Sandiwara', year: 2026, rating: 6.2, voteCount: 6 },
      { ...base, id: 'mukhsin', title: 'Mukhsin', year: 2007, rating: 6.9, voteCount: 16 },
      { ...base, id: 'olabola', title: 'Ola Bola', year: 2016, rating: 7.7, voteCount: 17 },
      { ...base, id: 'paskal', title: 'Paskal', year: 2018, rating: 7.6, voteCount: 82 }
    ]

    it('ranks established titles above barely-rated new releases', () => {
      const order = RankingScorer.rankTitles(malaysianPool, defaultPrefs).map(title => title.id)
      expect(order.slice(0, 2)).toEqual(['paskal', 'olabola'])
      expect(order.indexOf('mukhsin')).toBeLessThan(order.indexOf('home'))
      expect(order[order.length - 1]).toBe('home')
    })

    it('uses pool percentiles only for small catalogues', () => {
      expect(RankingScorer.buildPoolContext(malaysianPool).relativeWeight).toBe(1)
      const bigMarket = [3000, 8000, 12000, 25000, 400000].map(voteCount => ({ voteCount }))
      expect(RankingScorer.buildPoolContext(bigMarket).relativeWeight).toBe(0)
    })

    it('keeps the recency boost when the user asks for recent releases', () => {
      const newRelease = malaysianPool[0]
      const general = RankingScorer.calculateCompositeScore(newRelease, defaultPrefs)
      const recent = RankingScorer.calculateCompositeScore(newRelease, { ...defaultPrefs, releaseWindowLabel: 'this month' })
      expect(general.recencyBoost).toBe(0.5)
      expect(recent.recencyBoost).toBe(1.0)
    })

    it('does not treat unrated titles as hidden gems', () => {
      const noveltyPrefs: ParsedPreferences = { ...defaultPrefs, noveltyIntent: true }
      const unrated = RankingScorer.calculateCompositeScore(malaysianPool[0], noveltyPrefs)
      const gem = RankingScorer.calculateCompositeScore({ ...base, id: 'gem', year: 2026, rating: 7.8, voteCount: 300 }, noveltyPrefs)
      expect(gem.composite).toBeGreaterThan(unrated.composite)
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
