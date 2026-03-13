/**
 * Phase 3: Multi-Factor Ranking Overhaul
 * Calculates composite scores across multiple relevance signals
 */

import { ParsedPreferences } from './preferenceParser'

export interface ScoringFactors {
  genreScore: number
  moodScore: number
  talentScore: number
  ratingScore: number
  popularityScore: number
  recencyBoost: number
  composite: number
}

export interface RankingConfig {
  weights: {
    genre: number       // 0.25
    mood: number        // 0.20
    talent: number      // 0.15
    rating: number      // 0.20
    popularity: number  // 0.15
    recency: number     // 0.05
  }
}

/**
 * Multi-factor ranking scorer
 * Combines genre, mood, talent, rating, popularity, and recency signals
 */
export class RankingScorer {
  // Default weights: genre (0.25), mood (0.20), talent (0.15), rating (0.20), popularity (0.15), recency (0.05)
  private static readonly DEFAULT_CONFIG: RankingConfig = {
    weights: {
      genre: 0.25,
      mood: 0.20,
      talent: 0.15,
      rating: 0.20,
      popularity: 0.15,
      recency: 0.05
    }
  }

  /**
   * Calculate genre match score (0-1)
   * Primary genres (exact match): 0.5 per genre
   * Secondary genres (partial match): 0.2 per genre
   * Normalized to 0-1 range
   *
   * Example:
   * - User wants: ["Comedy", "Drama"]
   * - Title is: ["Comedy", "Drama", "Crime"]
   * - Score: (0.5 + 0.5) = 1.0
   *
   * - User wants: ["Comedy"]
   * - Title is: ["Comedy", "Action"]
   * - Score: 0.5 normalized = 1.0
   */
  static genreMatchScore(itemGenres: string[], preferredGenres: string[]): number {
    if (preferredGenres.length === 0 || itemGenres.length === 0) return 0

    let score = 0

    // Count primary matches (exact matches)
    const primaryMatches = itemGenres.filter(g =>
      preferredGenres.some(pg => pg.toLowerCase() === g.toLowerCase())
    ).length

    score += primaryMatches * 0.5

    // Secondary matches could be implemented with fuzzy matching if needed
    // For now, just exact matches

    // Normalize to 0-1
    // Max possible score is min(preferredGenres.length, itemGenres.length) * 0.5
    const maxScore = Math.min(preferredGenres.length, itemGenres.length) * 0.5
    const normalized = maxScore > 0 ? Math.min(1.0, score / maxScore) : 0

    return normalized
  }

  /**
   * Calculate mood match score (0-1)
   * Scans plot text for mood keywords and scores based on:
   * 1. How many mood keywords are found
   * 2. Weighted by mood confidence from preference parsing (moodStrength map)
   *
   * Example:
   * - User mood: Funny (1.0), Dark (0.5)
   * - Plot contains: "hilarious" (Funny keyword), "gritty" (Dark keyword)
   * - Score: weighted average = (1.0 * match_quality + 0.5 * match_quality) / count
   */
  static moodMatchScore(
    plotText: string | undefined,
    preferredMoods: string[],
    moodStrength: Map<string, number> | undefined
  ): number {
    if (!plotText || plotText.length === 0 || preferredMoods.length === 0) return 0

    const plotLower = plotText.toLowerCase()

    // Mood keywords for scanning plot (expanded for better detection)
    const moodKeywords: Record<string, string[]> = {
      'Happy': ['heartwarming', 'uplifting', 'joyful', 'cheerful', 'feel-good', 'delightful', 'amusing', 'lighthearted'],
      'Sad': ['emotional', 'touching', 'tearjerker', 'melancholy', 'poignant', 'devastating', 'tragic', 'sorrowful'],
      'Intense': ['action', 'thrilling', 'suspenseful', 'gripping', 'intense', 'adrenaline', 'explosive', 'relentless'],
      'Relaxing': ['gentle', 'peaceful', 'calm', 'cozy', 'comfort', 'soothing', 'tranquil', 'laid-back'],
      'Funny': ['comedy', 'hilarious', 'humorous', 'witty', 'comedic', 'laugh', 'comedians', 'absurd', 'silly', 'humor', 'joke', 'comic'],
      'Thoughtful': ['philosophical', 'thought-provoking', 'intelligent', 'cerebral', 'profound', 'explores', 'examines', 'questions', 'reflects', 'meaning', 'struggle', 'dilemma', 'contemplative'],
      'Dark': ['dark', 'gritty', 'bleak', 'moody', 'brooding', 'noir', 'cynical', 'sinister', 'ominous'],
      'Romantic': ['love', 'romance', 'tender', 'passionate', 'intimate', 'devoted', 'affection', 'relationship'],
      'Suspenseful': ['suspense', 'tension', 'thrilling', 'edge-of-seat', 'mystery', 'twist', 'cliffhanger', 'unpredictable']
    }

    let totalScore = 0
    let matchCount = 0

    for (const mood of preferredMoods) {
      const keywords = moodKeywords[mood] || []
      if (keywords.length === 0) continue

      // Check if any keyword matches
      const matched = keywords.some(kw => plotLower.includes(kw))
      if (!matched) continue

      // Weight by mood confidence
      const confidence = moodStrength?.get(mood) ?? 0.8
      totalScore += confidence
      matchCount++
    }

    // Return average confidence of matched moods
    return matchCount > 0 ? Math.min(1.0, totalScore / matchCount) : 0
  }

  /**
   * Calculate talent match score (0-1)
   * Uses pre-calculated talent match score from Phase 2
   * Already in 0-1 range
   */
  static talentMatchScore(talentScore: number | undefined): number {
    return Math.min(1.0, talentScore || 0)
  }

  /**
   * Calculate rating score (0-1)
   * Normalize IMDb rating (0-10) to 0-1
   * Ratings below 5.0 map to low scores, 7.0+ map to high scores
   */
  static ratingScore(imdbRating: number | undefined | null): number {
    if (imdbRating === undefined || imdbRating === null || imdbRating === 0) {
      return 0.5 // neutral default
    }

    // Normalize 0-10 to 0-1
    const result = Math.min(1.0, imdbRating / 10)
    return result
  }

  /**
   * Calculate popularity score (0-1)
   * Uses vote count if available, otherwise returns neutral score
   * More votes = higher popularity
   * Assumes vote counts typically range 100 - 1,000,000+
   */
  static popularityScore(voteCount: number | undefined | null): number {
    if (voteCount === undefined || voteCount === null || voteCount === 0) return 0.5 // neutral default

    // Log scale to compress large vote counts
    // Examples:
    // 100 votes → 0.3
    // 10,000 votes → 0.7
    // 1,000,000+ votes → 1.0
    const logVotes = Math.log10(Math.max(voteCount, 1))
    const normalized = Math.min(1.0, logVotes / 6) // log10(1,000,000) = 6

    return normalized
  }

  /**
   * Calculate recency boost (0-1)
   * Recent titles get a small boost
   * Movies/shows from 2020 onwards: 1.0
   * Older titles: gradual decline
   */
  static recencyBoost(year: number | undefined | null, currentYear: number = 2026): number {
    if (year === undefined || year === null || year === 0) return 0.5 // neutral default

    const age = currentYear - year

    // Boost logic:
    // Recent (0-2 years): 1.0
    // Recent (3-5 years): 0.8
    // Older (6-10 years): 0.6
    // Old (11+ years): 0.4
    if (age <= 2) return 1.0
    if (age <= 5) return 0.8
    if (age <= 10) return 0.6
    return 0.4
  }

  /**
   * Calculate composite ranking score
   * Combines all factors with configured weights
   * Returns: { individual factor scores + composite (0-1) }
   */
  static calculateCompositeScore(title: any, preferences: ParsedPreferences, config: Partial<RankingConfig> = {}): ScoringFactors {
    const finalConfig: RankingConfig = {
      weights: { ...this.DEFAULT_CONFIG.weights, ...config.weights }
    }

    // Calculate individual factors - explicitly ensure all are numbers
    const genreScore = Number(this.genreMatchScore(title.genres || [], preferences.genres)) || 0
    const moodScore = Number(this.moodMatchScore(title.plot, preferences.mood || [], preferences.moodStrength)) || 0
    const talentScore = Number(this.talentMatchScore(title.talentMatchScore)) || 0
    const ratingScore = Number(this.ratingScore(title.rating)) || 0
    const popularityScore = Number(this.popularityScore(title.voteCount)) || 0
    const recencyBoost = Number(this.recencyBoost(title.year)) || 0

    // Calculate composite score
    const composite =
      genreScore * finalConfig.weights.genre +
      moodScore * finalConfig.weights.mood +
      talentScore * finalConfig.weights.talent +
      ratingScore * finalConfig.weights.rating +
      popularityScore * finalConfig.weights.popularity +
      recencyBoost * finalConfig.weights.recency

    return {
      genreScore: Number(genreScore) || 0,
      moodScore: Number(moodScore) || 0,
      talentScore: Number(talentScore) || 0,
      ratingScore: Number(ratingScore) || 0,
      popularityScore: Number(popularityScore) || 0,
      recencyBoost: Number(recencyBoost) || 0,
      composite: Number(Math.min(1.0, composite)) || 0
    }
  }

  /**
   * Rank titles by composite score
   * Returns sorted array (highest score first)
   */
  static rankTitles(
    titles: any[],
    preferences: ParsedPreferences,
    config: Partial<RankingConfig> = {}
  ): any[] {
    // Calculate composite scores for each title
    const titlesWithScores = titles.map(title => ({
      ...title,
      scoringFactors: this.calculateCompositeScore(title, preferences, config)
    }))

    // Sort by composite score descending
    return titlesWithScores.sort((a, b) => b.scoringFactors.composite - a.scoringFactors.composite)
  }

  /**
   * Get scoring explanation for logging/debugging
   */
  static explainScore(title: any, factors: ScoringFactors): string {
    return [
      `Title: ${title.title}`,
      `  Genre: ${(factors.genreScore * 100).toFixed(0)}%`,
      `  Mood: ${(factors.moodScore * 100).toFixed(0)}%`,
      `  Talent: ${(factors.talentScore * 100).toFixed(0)}%`,
      `  Rating: ${(factors.ratingScore * 100).toFixed(0)}%`,
      `  Popularity: ${(factors.popularityScore * 100).toFixed(0)}%`,
      `  Recency: ${(factors.recencyBoost * 100).toFixed(0)}%`,
      `  ━━━━━━━━━━━━━━━━━━━`,
      `  Composite: ${(factors.composite * 100).toFixed(0)}%`
    ].join('\n')
  }
}
