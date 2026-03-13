import { fmdbClient } from '../clients/fmdb.js'
import { llmClient } from '../clients/llm.js'
import { streamingClient } from '../clients/streaming.js'
import { tmdbClient } from '../clients/tmdb.js'
import { ContentSafetyFilter } from '../filters/contentSafety.js'
import { PreferenceParser, ParsedPreferences, RecommendationRequest } from './preferenceParser.js'
import { TalentMatcher } from './talentMatcher.js'
import { RankingScorer, ScoringFactors } from './rankingScorer.js'

export interface StreamingAvailability {
  platform: string
  type: string
  link?: string
}

export interface Recommendation {
  id: string
  title: string
  year: string
  type: 'movie' | 'tv'
  synopsis: string
  posterUrl: string
  trailerUrl?: string
  availability?: StreamingAvailability[]
  whyThis?: string
  score: number
  // Phase 2: Talent matching score
  talentMatchScore?: number
  // Phase 3: Detailed scoring factors
  scoringFactors?: ScoringFactors
}

/**
 * Core recommendation engine using FM-DB API
 */
export class RecommendationEngine {
  // Cache for reference titles (Phase 2.2)
  private referenceTitlesCache: Map<string, any> = new Map()
  /**
   * Generate recommendations based on user request
   */
  async getRecommendations(
    request: RecommendationRequest,
    limit: number = 10
  ): Promise<Recommendation[]> {
    console.log(`[Engine] Processing request: "${request.description.substring(0, 50)}..."`)

    // Parse preferences with rule-based parser
    const preferences = PreferenceParser.parse(request)
    console.log(`[Engine] Rule-based parsing: ${PreferenceParser.explain(preferences)}`)

    // === PHASE 2.2: Fetch and cache reference titles ===
    const referenceTitles: any[] = []
    if (preferences.referenceTitle && preferences.referenceTitle.length > 0) {
      console.log(`[Engine] Fetching reference titles: ${preferences.referenceTitle.join(', ')}`)
      const refTitlePromises = preferences.referenceTitle.map(refTitle =>
        this.fetchReferenceTitle(refTitle)
      )
      const refResults = await Promise.all(refTitlePromises)
      const validRefs = refResults.filter((r): r is any => r !== null)
      referenceTitles.push(...validRefs)
      console.log(`[Engine] Resolved ${referenceTitles.length} reference titles`)
    }

    // Enhance with LLM if available
    if (llmClient.isEnabled() && request.description) {
      try {
        const llmPrefs = await llmClient.parsePreferences(request.description)
        if (llmPrefs) {
          // Merge LLM preferences with rule-based ones
          if (llmPrefs.genres.length > 0) {
            preferences.genres = [...new Set([...preferences.genres, ...llmPrefs.genres])]
          }
          if (llmPrefs.mood.length > 0) {
            preferences.mood = [...new Set([...preferences.mood, ...llmPrefs.mood])]
          }
          if (llmPrefs.keywords.length > 0) {
            // Use LLM keywords for search
            console.log(`[Engine] LLM enhanced: +${llmPrefs.keywords.length} keywords`)
          }
          console.log(`[Engine] Enhanced preferences: ${PreferenceParser.explain(preferences)}`)
        }
      } catch (error) {
        console.warn('[Engine] LLM parsing failed, using rule-based only')
      }
    }

    // Store description in preferences for hard filter inference
    preferences.description = request.description

    // Extract search terms from query and genres
    const searchTerms = this.extractSearchTerms(request.description, preferences.genres)
    console.log(`[Engine] Search terms: ${searchTerms.join(', ')}`)

    // Determine type filter
    const typeFilter = preferences.contentType === 'tv' ? 'series' : 
                      preferences.contentType === 'movie' ? 'movie' : 
                      undefined

    // Search FM-DB for each term
    const searchPromises = searchTerms.map(term =>
      fmdbClient.searchWithDetails(term, typeFilter, 5)
    )

    const allResults = await Promise.all(searchPromises)
    const flatResults = allResults.flat()

    console.log(`[Engine] Found ${flatResults.length} raw results from FM-DB`)

    // Convert to internal format
    const candidates = flatResults.map(r => fmdbClient.convertToInternal(r))

    // Remove duplicates by ID
    const uniqueCandidates = Array.from(
      new Map(candidates.map(c => [c.id, c])).values()
    )

    console.log(`[Engine] ${uniqueCandidates.length} unique candidates`)

    // Apply safety filters
    const safe = this.filterContent(uniqueCandidates)
    console.log(`[Engine] ${safe.length} titles passed safety filters`)

    // === PHASE 2.2 (continued): Add talent match scores for ranking ===
    // Calculate talent scores for each candidate based on reference titles
    const titlesWithTalentScores = safe.map(title => ({
      ...title,
      talentMatchScore: referenceTitles.length > 0
        ? TalentMatcher.findTalentMatch(title, referenceTitles).combinedScore
        : 0
    }))

    // Rank and limit
    const ranked = this.rankTitles(titlesWithTalentScores, preferences)
    const final = ranked.slice(0, limit)

    console.log(`[Engine] Returning ${final.length} recommendations`)

    // Generate LLM explanations in batch if available
    let llmExplanations = new Map<string, string>()
    if (llmClient.isEnabled() && final.length > 0) {
      try {
        // === PHASE 4 ENHANCEMENT: Provide scoring context for better explanations ===
        const titlesForLLM = final.map(item => ({
          title: item.title,
          genre: (item.genres || []).join(', '),
          plot: item.plot || '',
          rating: item.rating,
          // Pass scoring factors for context
          ...(item.scoringFactors && {
            genreScore: item.scoringFactors.genreScore,
            moodScore: item.scoringFactors.moodScore,
            talentScore: item.scoringFactors.talentScore
          }),
          talentMatchScore: item.talentMatchScore,
          // Pass user context
          referenceTitles: preferences.referenceTitle,
          excludedGenres: preferences.excludedGenres
        }))
        
        llmExplanations = await llmClient.generateWhyThisBatch(
          request.description,
          titlesForLLM
        )
        
        if (llmExplanations.size > 0) {
          console.log(`[Engine] Generated ${llmExplanations.size} LLM explanations with enhanced context`)
        }
      } catch (error) {
        console.warn('[Engine] LLM explanation generation failed, using fallback')
      }
    }

    // Fetch streaming availability in batch
    let availabilityData = new Map<string, StreamingAvailability[]>()
    if (final.length > 0) {
      try {
        const imdbIds = final.map(item => item.id)
        const country = (request.region || 'US').toLowerCase()
        availabilityData = await streamingClient.getAvailabilityBatch(imdbIds, country)
      } catch (error) {
        console.warn('[Engine] Streaming availability fetch failed')
      }
    }

    // Fetch trailers in batch
    let trailerData = new Map<string, string>()
    if (final.length > 0) {
      try {
        const items = final.map(item => ({
          imdbId: item.id,
          type: (item.type === 'series' ? 'tv' : 'movie') as 'movie' | 'tv'
        }))
        trailerData =await tmdbClient.getTrailersBatch(items)
      } catch (error) {
        console.warn('[Engine] Trailer fetch failed')
      }
    }

    // Convert to recommendation objects with all enhancements
    return final.map(title => 
      this.titleToRecommendation(
        title, 
        preferences, 
        request.description, 
        llmExplanations,
        availabilityData,
        trailerData,
        referenceTitles
      )
    )
  }

  /**
   * Phase 2.2: Fetch reference title details from catalog
   * Searches for the reference title and returns full details if found
   */
  private async fetchReferenceTitle(titleName: string): Promise<any | null> {
    // Check cache first
    const cached = this.referenceTitlesCache.get(titleName.toLowerCase())
    if (cached) {
      console.log(`[Engine.Ref] Cache hit: ${titleName}`)
      return cached
    }

    try {
      console.log(`[Engine.Ref] Searching for reference title: ${titleName}`)
      const results = await fmdbClient.searchByTitle(titleName, undefined)
      
      if (results.length === 0) {
        console.log(`[Engine.Ref] No results for: ${titleName}`)
        return null
      }

      // Get full details for first result (best match)
      const details = await fmdbClient.getDetails(results[0].imdbID)
      if (details) {
        const converted = fmdbClient.convertToInternal(details)
        // Cache it
        this.referenceTitlesCache.set(titleName.toLowerCase(), converted)
        console.log(`[Engine.Ref] Cached: ${titleName}`)
        return converted
      }
      
      return null
    } catch (error) {
      console.error(`[Engine.Ref] Error fetching ${titleName}:`, error)
      return null
    }
  }

  /**
   * Extract meaningful search terms from natural language query
   */
  private extractSearchTerms(query: string, genres: string[]): string[] {
    const terms = new Set<string>()

    // Remove stop words
    const stopWords = [
      'a', 'an', 'the', 'like', 'similar', 'to', 'movie', 'film', 'show',
      'series', 'tv', 'something', 'anything', 'want', 'watch', 'looking',
      'for', 'about', 'with', 'that', 'has', 'is', 'are', 'in', 'on', 'i'
    ]

    // Split into words
    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.includes(w))

    // Add meaningful words
    words.forEach(w => terms.add(w))

    // Add genres as search terms
    genres.forEach(g => terms.add(g.toLowerCase()))

    // If we have few terms, use genre or general term
    if (terms.size === 0 && genres.length > 0) {
      terms.add(genres[0].toLowerCase())
    } else if (terms.size === 0) {
      terms.add('popular')
    }

    // Limit to avoid too many API calls (max 3 searches)
    return Array.from(terms).slice(0, 3)
  }

  /**
   * Filter content for safety
   */
  private filterContent(items: any[]): any[] {
    const blockedRatings = ['NC-17', 'X', 'XXX', 'TV-MA', 'Unrated', 'Not Rated']
    
    return items.filter(item => {
      // Filter by rating
      if (item.rated && blockedRatings.includes(item.rated)) {
        console.log(`[Safety] Blocked "${item.title}" - Rating: ${item.rated}`)
        return false
      }

      // Must have basic info
      if (!item.title || !item.plot) {
        return false
      }

      return true
    })
  }

  /**
   * Infer core genres from query to enforce as hard filters
   * E.g., if query contains "heist", REQUIRE Crime/Thriller (not optional)
   */
  private inferCoreGenres(query: string, parsedGenres: string[]): string[] {
    // Check query for specific genre keywords
    const queryLower = query.toLowerCase()

    // Determine REQUIRED genres (these are mandatory, not optional)
    const requiredGenres: string[] = []

    // If query mentions "heist", require Crime or Thriller
    if (
      queryLower.includes('heist') ||
      queryLower.includes('theft') ||
      queryLower.includes('robbery') ||
      queryLower.includes('caper')
    ) {
      requiredGenres.push('Crime', 'Thriller')
    }

    // If query mentions "mystery" or "detective", require those
    if (queryLower.includes('mystery') || queryLower.includes('detective')) {
      requiredGenres.push('Mystery', 'Crime')
    }

    if (queryLower.includes('thriller')) {
      requiredGenres.push('Thriller')
    }

    if (queryLower.includes('drama')) {
      requiredGenres.push('Drama')
    }

    // If we found required genres from keywords, use those (strict enforcement)
    if (requiredGenres.length > 0) {
      return Array.from(new Set(requiredGenres))
    }

    // Otherwise, fall back to parsed genres as soft preferences
    return parsedGenres
  }

  /**
   * Rank titles by relevance (Phase 3: Multi-factor scoring)
   * Combines: genre, mood, talent, rating, popularity, recency
   * WITH hard filters for core genres and exclusions
   */
  private rankTitles(titles: any[], preferences: ParsedPreferences): any[] {
    // === PHASE 3.1: Hard Genre Filter ===
    // Infer core genres from query and parsed preferences
    const coreGenres = this.inferCoreGenres(
      preferences.description || '',
      preferences.genres
    )

    // Filter titles: must have at least one core genre
    let filtered = titles
    if (coreGenres.length > 0) {
      filtered = titles.filter(t => {
        const titleGenres = (t.genres || []).map((g: string) => g.toLowerCase())
        return coreGenres.some(cg =>
          titleGenres.some((tg: string) => tg.toLowerCase() === cg.toLowerCase())
        )
      })

      if (filtered.length < titles.length) {
        const removed = titles.length - filtered.length
        console.log(
          `[Engine.Rank] Hard genre filter: removed ${removed} titles without core genres [${coreGenres.join(', ')}]`
        )
      }
    }

    // === PHASE 3.2: Exclusion Genre Penalty ===
    // Track exclusion penalties before scoring
    const exclusionPenalties = new Map<string, number>()

    filtered.forEach(t => {
      let penalty = 1.0 // No penalty by default

      if (preferences.excludedGenres && preferences.excludedGenres.length > 0) {
        const titleGenres = (t.genres || []).map((g: string) => g.toLowerCase())
        const hasExcluded = titleGenres.some((tg: string) =>
          preferences.excludedGenres!.some(eg => eg.toLowerCase() === tg.toLowerCase())
        )

        if (hasExcluded) {
          // Heavy penalty: reduce composite score to 30% of original
          penalty = 0.3
          console.log(
            `[Engine.Rank] Exclusion penalty 0.3x: "${t.title}" has excluded genres [${(t.genres || []).join(', ')}]`
          )
        }
      }

      exclusionPenalties.set(t.id, penalty)
    })

    // === PHASE 3.3: Multi-Factor Scoring ===
    // Use multi-factor ranking scorer on hard-filtered list
    const ranked = RankingScorer.rankTitles(filtered, preferences)

    // === PHASE 3.4: Apply Exclusion Penalties to Composite Scores ===
    // Reduce composite score for titles with excluded genres
    const penalizedRanked = ranked.map(r => {
      const penalty = exclusionPenalties.get(r.id) || 1.0
      return {
        ...r,
        scoringFactors: {
          ...r.scoringFactors,
          composite: Math.max(
            0,
            r.scoringFactors.composite * penalty
          )
        }
      }
    })

    // Re-sort after applying penalties
    return penalizedRanked.sort(
      (a, b) => b.scoringFactors.composite - a.scoringFactors.composite
    )
  }

  /**
   * Convert internal format to recommendation
   */
  private titleToRecommendation(
    item: any, 
    preferences: ParsedPreferences,
    userDescription: string,
    llmExplanations?: Map<string, string>,
    availabilityData?: Map<string, StreamingAvailability[]>,
    trailerData?: Map<string, string>,
    referenceTitles?: any[]
  ): Recommendation {
    const type = item.type === 'series' ? 'tv' : 'movie'
    const year = item.year?.toString() || 'N/A'

    // Use LLM-generated explanation if available, otherwise fallback to rule-based
    const whyThis = llmExplanations?.get(item.title) || this.generateWhyThis(item, preferences)

    // Get availability data if available
    const availability = availabilityData?.get(item.id) || undefined

    // Get trailer URL if available
    const trailerUrl = trailerData?.get(item.id) || undefined

    // === PHASE 3: Extract scoring factors if available ===
    const scoringFactors = item.scoringFactors as ScoringFactors | undefined

    return {
      id: item.id,
      title: item.title,
      year,
      type,
      synopsis: item.plot || 'No synopsis available.',
      posterUrl: item.poster || 'https://via.placeholder.com/300x450?text=No+Poster',
      trailerUrl,
      availability,
      whyThis,
      score: item.rating || 0,
      // Phase 2: Include talent match score
      talentMatchScore: item.talentMatchScore || 0,
      // Phase 3: Include detailed scoring factors
      scoringFactors
    }
  }

  /**
   * Generate explanation for why this title was recommended
   */
  private generateWhyThis(item: any, preferences: ParsedPreferences): string {
    const reasons: string[] = []

    // === PHASE 4: Enhanced template fallback with scoring context ===

    // Talent matching (Phase 2 signal)
    if (item.talentMatchScore && item.talentMatchScore > 0.7) {
      reasons.push(`Features cast/director from titles you mentioned`)
    }

    // Genre match
    if (preferences.genres.length > 0) {
      const matchedGenres = (item.genres || []).filter((g: string) =>
        preferences.genres.some(pg => pg.toLowerCase() === g.toLowerCase())
      )
      if (matchedGenres.length > 0) {
        reasons.push(`Matches your ${matchedGenres.join(', ')} preference`)
      }
    }

    // Excluded genres avoided
    if (preferences.excludedGenres && preferences.excludedGenres.length > 0) {
      const hasExcluded = (item.genres || []).some((g: string) =>
        preferences.excludedGenres!.some(eg => eg.toLowerCase() === g.toLowerCase())
      )
      if (!hasExcluded) {
        // Explicitly mention that we avoided excluded genres
        const excludedList = preferences.excludedGenres.join(', ')
        reasons.push(`Avoids ${excludedList}`)
      }
    }

    // Mood matching with confidence
    if (preferences.moodStrength && preferences.moodStrength.size > 0 && item.plot) {
      const plotLower = item.plot.toLowerCase()
      const moodKeywords: Record<string, string[]> = {
        happy: ['heartwarming', 'uplifting', 'joyful', 'cheerful', 'amusing', 'lighthearted'],
        sad: ['emotional', 'touching', 'tearjerker', 'melancholy', 'poignant', 'tragic'],
        intense: ['action', 'thriller', 'suspense', 'gripping', 'intense', 'explosive', 'thrilling'],
        relaxing: ['gentle', 'peaceful', 'calm', 'cozy', 'comfort', 'soothing', 'tranquil'],
        funny: ['comedy', 'hilarious', 'humorous', 'witty', 'comedic', 'laugh', 'absurd', 'comic'],
        thoughtful: ['philosophical', 'thought-provoking', 'intelligent', 'explores', 'examines', 'contemplative'],
        dark: ['dark', 'gritty', 'bleak', 'moody', 'noir', 'cynical', 'ominous'],
        romantic: ['love', 'romance', 'tender', 'passionate', 'intimate', 'devoted'],
        suspenseful: ['suspense', 'tension', 'thrilling', 'mystery', 'twist', 'unpredictable']
      }

      for (const [mood, keywords] of Object.entries(moodKeywords)) {
        const confidence = preferences.moodStrength.get(mood) || 0
        if (keywords.some(kw => plotLower.includes(kw)) && confidence > 0.5) {
          const strength = confidence > 0.85 ? 'definitely' : 'nicely'
          reasons.push(`${strength.charAt(0).toUpperCase() + strength.slice(1)} fits your ${mood} mood`)
          break
        }
      }
    }

    // Rating
    if (item.rating && item.rating >= 8.0) {
      reasons.push(`Highly rated (${item.rating}/10 on IMDb)`)
    } else if (item.rating && item.rating >= 7.0) {
      reasons.push(`Well-reviewed (${item.rating}/10)`)
    }

    return reasons.length > 0
      ? reasons.join('. ') + '.'
      : 'Popular choice based on your preferences.'
  }
}

export const recommendationEngine = new RecommendationEngine()
