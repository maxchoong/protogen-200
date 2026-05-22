import { fmdbClient } from '../clients/fmdb.js'
import { llmClient } from '../clients/llm.js'
import { streamingClient } from '../clients/streaming.js'
import { tmdbClient } from '../clients/tmdb.js'
import { ContentSafetyFilter } from '../filters/contentSafety.js'
import { PreferenceParser, ParsedPreferences, RecommendationRequest, DiscoveryMode } from './preferenceParser.js'
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
  private static readonly SEARCH_TERM_LIMIT = 6
  private static readonly BACKFILL_SEARCH_TERM_LIMIT = 3
  private static readonly MIN_CANDIDATE_POOL = 12
  private static readonly DIVERSITY_WINDOW_MULTIPLIER = 3

  // Cache for reference titles (Phase 2.2)
  private referenceTitlesCache: Map<string, any> = new Map()

  private isImdbId(id: string): boolean {
    return /^tt\d{5,}$/.test(id)
  }

  private async searchWithTmdbPrimary(
    searchTerms: string[],
    typeFilter?: 'movie' | 'series',
    discoveryMode?: DiscoveryMode,
    preferredGenres: string[] = []
  ): Promise<any[]> {
    if (!tmdbClient.isEnabled()) {
      return []
    }

    const includeMovies = typeFilter !== 'series'
    const includeTV = typeFilter !== 'movie'

    const shouldUseGenreDiscover =
      preferredGenres.length > 0 &&
      (discoveryMode === 'mood' || discoveryMode === 'reference' || discoveryMode === 'mixed')

    const tmdbResultSets: any[][] = []

    if (shouldUseGenreDiscover) {
      const discoverResults = await tmdbClient.discoverByGenres(
        preferredGenres.slice(0, 3),
        {
          includeMovies,
          includeTV,
          excludeAdult: true
        }
      )
      tmdbResultSets.push(discoverResults)
      console.log(`[Engine] TMDB genre discovery yielded ${discoverResults.length} titles`)
    }

    if (searchTerms.length > 0) {
      const tmdbSearches = await Promise.all(
        searchTerms.map(term =>
          tmdbClient.searchTitles(term, {
            includeMovies,
            includeTV,
            excludeAdult: true
          })
        )
      )
      tmdbResultSets.push(...tmdbSearches)
    }

    const deduped = Array.from(
      new Map(
        tmdbResultSets
          .flat()
          .map(item => [`${item.media_type}:${item.id}`, item])
      ).values()
    )

    const limited = deduped.slice(0, 30)

    const converted = await Promise.all(
      limited.map(async item => this.convertTmdbResult(item))
    )

    return converted.filter(item => !!item.title && !!item.plot)
  }

  private async searchWithOmdbFallback(
    searchTerms: string[],
    typeFilter?: 'movie' | 'series'
  ): Promise<any[]> {
    const searchPromises = searchTerms.map(term =>
      fmdbClient.searchWithDetails(term, typeFilter, 5)
    )

    const allResults = await Promise.all(searchPromises)
    const flatResults = allResults.flat()
    return flatResults.map(r => fmdbClient.convertToInternal(r))
  }

  private normalizeSearchTerms(searchTerms: string[], limit: number = RecommendationEngine.SEARCH_TERM_LIMIT): string[] {
    return Array.from(
      new Set(
        searchTerms
          .map(term => term.trim())
          .filter(Boolean)
      )
    ).slice(0, limit)
  }

  private convertTmdbResult(item: any, actorHints: string[] = []): any {
    const mediaType = item.media_type === 'tv' ? 'tv' : 'movie'
    const yearRaw = mediaType === 'movie' ? item.release_date : item.first_air_date
    const year = yearRaw ? parseInt(yearRaw.split('-')[0], 10) || 0 : 0
    const id = `tmdb:${mediaType}:${item.id}`

    return {
      id,
      tmdbId: item.id,
      tmdbMediaType: mediaType,
      title: item.title || item.name,
      year,
      type: mediaType === 'tv' ? 'series' : 'movie',
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
      rating: item.vote_average || undefined,
      plot: item.overview || undefined,
      genres: tmdbClient.mapGenreIdsToNames(item.genre_ids || []),
      rated: undefined,
      director: undefined,
      actors: actorHints.length > 0 ? actorHints.join(', ') : undefined,
      requestedActorHit: actorHints.length > 0,
      voteCount: item.vote_count || 0
    }
  }

  private async hydratePreviousRecommendations(
    recommendationIds: string[]
  ): Promise<any[]> {
    const imdbIds = Array.from(new Set(recommendationIds.filter(id => this.isImdbId(id))))

    if (imdbIds.length === 0) {
      return []
    }

    const detailed = await Promise.all(imdbIds.map(id => fmdbClient.getDetails(id)))
    return detailed
      .filter((item): item is any => !!item)
      .map(item => fmdbClient.convertToInternal(item))
  }

  private async searchCandidates(
    searchTerms: string[],
    typeFilter?: 'movie' | 'series',
    discoveryMode?: DiscoveryMode,
    preferredGenres: string[] = []
  ): Promise<any[]> {
    if (searchTerms.length === 0) {
      return []
    }

    if (tmdbClient.isEnabled()) {
      const results = await this.searchWithTmdbPrimary(
        searchTerms,
        typeFilter,
        discoveryMode,
        preferredGenres
      )
      console.log(`[Engine] Found ${results.length} raw results from TMDB`)
      return results
    }

    const results = await this.searchWithOmdbFallback(searchTerms, typeFilter)
    console.log(`[Engine] Found ${results.length} raw results from FM-DB`)
    return results
  }

  private buildBackfillSearchTerms(
    query: string,
    preferences: ParsedPreferences,
    existingTerms: string[]
  ): string[] {
    const extras = new Set<string>()
    const existing = new Set(existingTerms.map(term => term.toLowerCase()))

    for (const actor of preferences.detectedActors || []) {
      extras.add(actor)
    }

    for (const genre of preferences.genres || []) {
      extras.add(genre)
    }

    for (const mood of preferences.mood || []) {
      extras.add(mood)
    }

    for (const term of this.extractSearchTerms(query, preferences.genres, RecommendationEngine.SEARCH_TERM_LIMIT * 2)) {
      extras.add(term)
    }

    return this.normalizeSearchTerms(
      Array.from(extras).filter(term => !existing.has(term.toLowerCase())),
      RecommendationEngine.BACKFILL_SEARCH_TERM_LIMIT
    )
  }

  private matchesRequestedActors(title: any, requestedActors: string[]): boolean {
    if (title?.requestedActorHit) {
      return true
    }

    if (requestedActors.length === 0) {
      return false
    }

    return TalentMatcher.findTalentMatchForActors(title, requestedActors).actorOverlap > 0
  }

  private deriveReferenceGenres(referenceTitles: any[]): string[] {
    const broadGenres = new Set(['Drama', 'Comedy', 'Romance', 'Action', 'Adventure'])
    const collected = referenceTitles.flatMap(referenceTitle => referenceTitle?.genres || [])
    const unique = Array.from(new Set(collected.filter(Boolean)))
    const specific = unique.filter(genre => !broadGenres.has(genre))

    return specific.length > 0 ? specific : unique
  }

  private getDecade(year: number | undefined): number | null {
    if (!year || !Number.isFinite(year)) {
      return null
    }

    return Math.floor(year / 10) * 10
  }

  private scoreDiversityAdjustment(candidate: any, selected: any[]): number {
    if (selected.length < 2) {
      return 0
    }

    const candidateGenres = (candidate.genres || []).map((genre: string) => genre.toLowerCase())
    const selectedGenres = new Set(
      selected.flatMap((item: any) => (item.genres || []).map((genre: string) => genre.toLowerCase()))
    )

    const samePrimaryGenreCount = selected.filter((item: any) => {
      const selectedPrimaryGenre = item.genres?.[0]?.toLowerCase()
      return selectedPrimaryGenre && selectedPrimaryGenre === candidateGenres[0]
    }).length

    const overlapCount = selected.filter((item: any) => {
      const itemGenres = (item.genres || []).map((genre: string) => genre.toLowerCase())
      if (candidateGenres.length === 0 || itemGenres.length === 0) {
        return false
      }

      const overlap = candidateGenres.filter((genre: string) => itemGenres.includes(genre)).length
      return overlap > 0 && overlap === Math.min(candidateGenres.length, itemGenres.length)
    }).length

    const candidateDecade = this.getDecade(candidate.year)
    const sameDecadeCount = candidateDecade === null
      ? 0
      : selected.filter((item: any) => this.getDecade(item.year) === candidateDecade).length

    const introducesNewGenre = candidateGenres.some((genre: string) => !selectedGenres.has(genre))

    let adjustment = 0
    if (introducesNewGenre) {
      adjustment += 0.02
    }

    adjustment -= samePrimaryGenreCount * 0.035
    adjustment -= overlapCount * 0.025

    if (sameDecadeCount >= 2) {
      adjustment -= 0.015
    }

    return adjustment
  }

  private selectFinalResults(ranked: any[], limit: number): any[] {
    if (ranked.length <= limit) {
      return ranked.slice(0, limit)
    }

    const windowSize = Math.max(limit * RecommendationEngine.DIVERSITY_WINDOW_MULTIPLIER, limit)
    const candidateWindow = ranked.slice(0, windowSize)
    const remaining = [...candidateWindow]
    const selected: any[] = []

    while (selected.length < limit && remaining.length > 0) {
      let bestIndex = 0
      let bestScore = Number.NEGATIVE_INFINITY

      remaining.forEach((candidate, index) => {
        const composite = candidate.scoringFactors?.composite || 0
        const adjustedScore = composite + this.scoreDiversityAdjustment(candidate, selected)

        if (adjustedScore > bestScore) {
          bestScore = adjustedScore
          bestIndex = index
        }
      })

      selected.push(remaining.splice(bestIndex, 1)[0])
    }

    return selected
  }

  private async resolveImdbIds(titles: any[]): Promise<any[]> {
    const resolved = await Promise.all(
      titles.map(async title => {
        if (this.isImdbId(title.id) || !title.tmdbId) {
          return title
        }

        const mediaType = title.tmdbMediaType === 'tv' ? 'tv' : 'movie'
        const externalIds = await tmdbClient.getExternalIds(title.tmdbId, mediaType)
        if (!externalIds.imdbId) {
          return title
        }

        return {
          ...title,
          id: externalIds.imdbId
        }
      })
    )

    return Array.from(new Map(resolved.map(item => [item.id, item])).values())
  }

  /**
   * Generate recommendations based on user request
   */
  async getRecommendations(
    request: RecommendationRequest,
    limit: number = 10
  ): Promise<Recommendation[]> {
    console.log(`[Engine] Processing request: "${request.description.substring(0, 50)}..."`)
    if (request.clarificationContext) {
      console.log(`[Engine] Clarification round ${request.clarificationContext.clarificationRound}`)
    }

    // Parse preferences with rule-based parser
    const preferences = PreferenceParser.parse(request)
    console.log(`[Engine] Rule-based parsing: ${PreferenceParser.explain(preferences)}`)
    
    // Phase 5: Log intent classification
    if (preferences.discoveryMode && preferences.intentConfidence !== undefined) {
      console.log(`[Engine] Intent classification: mode=${preferences.discoveryMode}, confidence=${(preferences.intentConfidence * 100).toFixed(0)}%`)
      if (preferences.detectedActors && preferences.detectedActors.length > 0) {
        console.log(`[Engine] Detected actors: ${preferences.detectedActors.join(', ')}`)
      }
    }

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
      const referenceGenres = this.deriveReferenceGenres(referenceTitles)
      if (referenceGenres.length > 0) {
        preferences.genres = Array.from(new Set([...referenceGenres, ...preferences.genres]))
      }
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

    // Keep parser-combined description (base query + clarification context) for downstream ranking.

    // === PHASE 5: Mode-aware search strategy ===
    let searchTerms: string[] = []
    
    if (preferences.discoveryMode === 'talent' && preferences.detectedActors && preferences.detectedActors.length > 0) {
      // Talent mode: search by actor names + broader genre/mood terms
      searchTerms = [...preferences.detectedActors]
      // Also add genre/mood keywords for additional results
      if (preferences.genres && preferences.genres.length > 0) {
        searchTerms.push(...preferences.genres.slice(0, 2))
      }
      if (preferences.mood && preferences.mood.length > 0) {
        searchTerms.push(...preferences.mood.slice(0, 1))
      }
      console.log(`[Engine] Talent mode: searching for actors + genres`)
    } else if (preferences.discoveryMode === 'reference' && preferences.referenceTitle && preferences.referenceTitle.length > 0) {
      // Reference mode: fetches anchor metadata separately; search alternatives by genres/mood.
      searchTerms = []
      const referenceGenres = this.deriveReferenceGenres(referenceTitles)
      if (referenceGenres.length > 0) {
        searchTerms.push(...referenceGenres.slice(0, 2))
      }
      if (preferences.genres && preferences.genres.length > 0) {
        searchTerms.push(...preferences.genres.filter(genre => !searchTerms.includes(genre)).slice(0, 2))
      }
      if (preferences.mood && preferences.mood.length > 0) {
        searchTerms.push(...preferences.mood.slice(0, 2))
      }
      if (searchTerms.length === 0) {
        searchTerms = ['Drama', 'Thriller']
      }
      console.log(`[Engine] Reference mode: searching alternatives by genres/mood`)
    } else if (preferences.discoveryMode === 'mood') {
      // Mood mode: broaden genre search, include all detected genres
      searchTerms = preferences.genres && preferences.genres.length > 0
        ? [...preferences.genres]
        : ['Drama', 'Comedy']  // Safe defaults
      // Also search by mood keywords
      if (preferences.mood && preferences.mood.length > 0) {
        searchTerms.push(...preferences.mood.slice(0, 2))
      }
      console.log(`[Engine] Mood mode: broad genre + mood search`)
    } else {
      // Mixed or default: extract from description + use explicit genres
      searchTerms = this.extractSearchTerms(request.description, preferences.genres)
      console.log(`[Engine] Mixed/default mode: extracted search terms`)
    }

    searchTerms = this.normalizeSearchTerms(searchTerms)

    console.log(`[Engine] Search terms: ${searchTerms.join(', ')}`)

    // Determine type filter
    const typeFilter = preferences.contentType === 'tv' ? 'series' : 
                      preferences.contentType === 'movie' ? 'movie' : 
                      undefined

    let actorFilmographyCandidates: any[] = []
    if (preferences.discoveryMode === 'talent' && preferences.detectedActors && preferences.detectedActors.length > 0 && tmdbClient.isEnabled()) {
      const includeMovies = typeFilter !== 'series'
      const includeTV = typeFilter !== 'movie'

      const actorResultSets = await Promise.all(
        preferences.detectedActors.map(actor =>
          tmdbClient.searchTitlesForPerson(
            actor,
            {
              includeMovies,
              includeTV,
              excludeAdult: true
            },
            20
          )
        )
      )

      actorFilmographyCandidates = actorResultSets.flatMap((results, index) =>
        results.map(item => this.convertTmdbResult(item, [preferences.detectedActors![index]]))
      )

      if (actorFilmographyCandidates.length > 0) {
        console.log(`[Engine] Talent mode: retrieved ${actorFilmographyCandidates.length} actor filmography candidates from TMDB`)
      }
    }

    const previousRecommendationIds = request.clarificationContext?.previousRecommendationIds || []
    const shouldReusePreviousCandidates =
      (request.clarificationContext?.clarificationRound ?? 0) > 0 &&
      previousRecommendationIds.length > 0

    let previousCandidates: any[] = []
    if (shouldReusePreviousCandidates) {
      previousCandidates = await this.hydratePreviousRecommendations(previousRecommendationIds)
      console.log(
        `[Engine] Reuse mode: hydrated ${previousCandidates.length}/${previousRecommendationIds.length} previous recommendations`
      )
    }

    let candidates: any[] = []

    // On refinement turns, prefer re-ranking prior results before broad retrieval.
    if (shouldReusePreviousCandidates && previousCandidates.length >= limit) {
      candidates = [...previousCandidates]
      console.log('[Engine] Reuse mode: skipping broad retrieval (sufficient prior candidates)')
    } else {
      const searchedCandidates = await this.searchCandidates(
        searchTerms,
        typeFilter,
        preferences.discoveryMode,
        preferences.genres || []
      )
      candidates = [...previousCandidates, ...actorFilmographyCandidates, ...searchedCandidates]
    }

    if (candidates.length < RecommendationEngine.MIN_CANDIDATE_POOL) {
      const backfillTerms = this.buildBackfillSearchTerms(
        request.description,
        preferences,
        searchTerms
      )

      if (backfillTerms.length > 0) {
        console.log(
          `[Engine] Thin candidate pool (${candidates.length}); backfilling with: ${backfillTerms.join(', ')}`
        )

        const backfillCandidates = await this.searchCandidates(
          backfillTerms,
          typeFilter,
          preferences.discoveryMode,
          preferences.genres || []
        )
        candidates = [...candidates, ...backfillCandidates]
      }
    }

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
        : (preferences.detectedActors && preferences.detectedActors.length > 0)
          ? (title.requestedActorHit
            ? 1
            : TalentMatcher.findTalentMatchForActors(title, preferences.detectedActors).combinedScore)
          : 0
    }))

    // Rank and limit
    const ranked = this.rankTitles(titlesWithTalentScores, preferences, referenceTitles)
    const filteredRanked =
      preferences.discoveryMode === 'talent' && preferences.detectedActors && preferences.detectedActors.length > 0
        ? ranked.filter(title => this.matchesRequestedActors(title, preferences.detectedActors || []))
        : ranked
    const finalCandidates = this.selectFinalResults(filteredRanked, limit)
    const final = await this.resolveImdbIds(finalCandidates)

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
            talentScore: item.scoringFactors.talentScore,
            compositeScore: item.scoringFactors.composite
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
        const imdbIds = final.map(item => item.id).filter(id => this.isImdbId(id))
        const country = (request.region || 'US').toLowerCase()
        if (imdbIds.length > 0) {
          availabilityData = await streamingClient.getAvailabilityBatch(imdbIds, country)
        }
      } catch (error) {
        console.warn('[Engine] Streaming availability fetch failed')
      }
    }

    // Fetch trailers in batch
    let trailerData = new Map<string, string>()
    if (final.length > 0) {
      try {
        const imdbItems = final
          .filter(item => this.isImdbId(item.id))
          .map(item => ({
          imdbId: item.id,
          type: (item.type === 'series' ? 'tv' : 'movie') as 'movie' | 'tv'
        }))

        if (imdbItems.length > 0) {
          trailerData = await tmdbClient.getTrailersBatch(imdbItems)
        }

        // Fallback path for TMDB-only IDs when IMDb mapping is unavailable.
        const tmdbOnlyItems = final.filter(item => !this.isImdbId(item.id) && item.tmdbId)
        for (const item of tmdbOnlyItems) {
          const mediaType = item.tmdbMediaType === 'tv' ? 'tv' : 'movie'
          const videos = await tmdbClient.getVideos(item.tmdbId, mediaType)
          if (videos.length > 0) {
            trailerData.set(item.id, `https://www.youtube.com/watch?v=${videos[0].key}`)
          }
        }
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
  private extractSearchTerms(query: string, genres: string[], maxTerms: number = RecommendationEngine.SEARCH_TERM_LIMIT): string[] {
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

    // Keep the search fanout bounded so API cost remains predictable.
    return Array.from(terms).slice(0, maxTerms)
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
  private inferCoreGenres(query: string, parsedGenres: string[], referenceTitles: any[] = []): string[] {
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

    const referenceGenres = this.deriveReferenceGenres(referenceTitles)
    if (referenceGenres.length > 0) {
      return referenceGenres
    }

    // Otherwise, fall back to parsed genres as soft preferences
    return parsedGenres
  }

  /**
   * Rank titles by relevance (Phase 3: Multi-factor scoring)
   * Combines: genre, mood, talent, rating, popularity, recency
   * WITH hard filters for core genres and exclusions
   */
  private rankTitles(titles: any[], preferences: ParsedPreferences, referenceTitles: any[] = []): any[] {
    // === PHASE 3.1: Hard Genre Filter ===
    // Infer core genres from query and parsed preferences
    const coreGenres = this.inferCoreGenres(
      preferences.description || '',
      preferences.genres,
      referenceTitles
    )

    // Check if query is heist-specific to enable semantic filtering
    const isHeistQuery = (preferences.description || '').toLowerCase().match(/\bheist\b|\btheft\b|\brobbery\b|\bcaper\b/i)
    const heistKeywords = /\bheist\b|\btheft\b|\brobbery\b|\bcaper\b|\bsteal|\brob\b|\bloot\b|\bgem\b|\bdiamond\b|\bbank\b|\bjewel\b|\bburglary\b/i

    // Filter titles: must have at least one core genre
    let filtered = titles

    // Suppress any explicitly-mentioned anchor title by default unless user asks for a rewatch.
    const hasRewatchIntent = /(rewatch|watch again|same movie|the original|again)/i.test(
      preferences.description || ''
    )

    if (!hasRewatchIntent && referenceTitles.length > 0) {
      const referenceIds = new Set(referenceTitles.map(ref => ref.id).filter(Boolean))
      const beforeCount = filtered.length
      filtered = filtered.filter(t => !referenceIds.has(t.id))
      if (filtered.length < beforeCount) {
        console.log(
          `[Engine.Rank] Suppressed ${beforeCount - filtered.length} explicitly-mentioned anchor title(s)`
        )
      }
    }

    if (coreGenres.length > 0) {
      filtered = filtered.filter(t => {
        const titleGenres = (t.genres || []).map((g: string) => g.toLowerCase())
        const hasRequiredGenre = coreGenres.some(cg =>
          titleGenres.some((tg: string) => tg.toLowerCase() === cg.toLowerCase())
        )

        // Additional semantic filtering for heist queries
        if (isHeistQuery && hasRequiredGenre) {
          const titleLower = (t.title || '').toLowerCase()
          const plotLower = (t.plot || '').toLowerCase()
          
          // If query is about heist but title/plot lacks heist keywords, filter it out
          // (e.g., "Funny Games" is a thriller but not a heist)
          if (!heistKeywords.test(titleLower) && !heistKeywords.test(plotLower)) {
            console.log(
              `[Engine.Rank] Semantic filter: removed "${t.title}" - Crime/Thriller but no heist keywords`
            )
            return false
          }
        }

        return hasRequiredGenre
      })

      if (filtered.length < titles.length) {
        const removed = titles.length - filtered.length
        console.log(
          `[Engine.Rank] Hard genre filter: removed ${removed} titles without core genres or heist semantics [${coreGenres.join(', ')}]`
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
    // Phase 5: Apply mode-specific weights based on intent classification
    const modeConfig = preferences.discoveryMode
      ? RankingScorer.getWeightsForMode(preferences.discoveryMode)
      : undefined
    
    if (modeConfig && preferences.discoveryMode) {
      console.log(
        `[Engine.Rank] Applying ${preferences.discoveryMode} mode weights: ` +
        `genre=${(modeConfig.weights.genre * 100).toFixed(0)}%, ` +
        `mood=${(modeConfig.weights.mood * 100).toFixed(0)}%, ` +
        `talent=${(modeConfig.weights.talent * 100).toFixed(0)}%`
      )
    }

    const ranked = RankingScorer.rankTitles(filtered, preferences, modeConfig)

    // === PHASE 3.4: Apply Exclusion Penalties to Composite Scores ===
    // Reduce composite score for titles with excluded genres
    const penalizedRanked = ranked.map(r => {
      const penalty = exclusionPenalties.get(r.id) || 1.0
      const moodShiftMultiplier = this.calculateMoodShiftMultiplier(r, preferences)
      const refinementMultiplier = this.calculateRefinementMultiplier(r, preferences)
      return {
        ...r,
        scoringFactors: {
          ...r.scoringFactors,
          composite: Math.max(
            0,
            r.scoringFactors.composite * penalty * moodShiftMultiplier * refinementMultiplier
          )
        }
      }
    })

    // Re-sort after applying penalties
    return penalizedRanked.sort(
      (a, b) => b.scoringFactors.composite - a.scoringFactors.composite
    )
  }

  private calculateMoodShiftMultiplier(title: any, preferences: ParsedPreferences): number {
    if (!title?.plot) {
      return 1.0
    }

    const boosted = new Set(preferences.boostedMoods || [])
    const reduced = new Set(preferences.reducedMoods || [])

    if (boosted.has('Relaxing')) {
      reduced.add('Funny')
      reduced.add('Happy')
      reduced.add('Intense')
    }

    if (boosted.size === 0 && reduced.size === 0) {
      return 1.0
    }

    const plotLower = title.plot.toLowerCase()
    const moodKeywords: Record<string, string[]> = {
      Relaxing: ['calm', 'peaceful', 'gentle', 'cozy', 'soothing', 'quiet', 'heartwarming'],
      Intense: ['intense', 'high-stakes', 'adrenaline', 'relentless', 'frantic', 'dangerous'],
      Dark: ['dark', 'grim', 'bleak', 'brooding', 'disturbing'],
      Suspenseful: ['suspense', 'edge of your seat', 'tense', 'twist', 'mystery'],
      Funny: ['funny', 'comedic', 'hilarious', 'witty', 'laugh'],
      Happy: ['uplifting', 'feel-good', 'joyful', 'warm', 'optimistic']
    }

    let multiplier = 1.0

    for (const mood of boosted) {
      const keywords = moodKeywords[mood] || []
      if (keywords.some(kw => plotLower.includes(kw))) {
        multiplier += preferences.isContrastiveReference ? 0.22 : 0.12
      }
    }

    for (const mood of reduced) {
      const keywords = moodKeywords[mood] || []
      if (keywords.some(kw => plotLower.includes(kw))) {
        multiplier -= preferences.isContrastiveReference ? 0.3 : 0.2
      }
    }

    return Math.max(0.5, Math.min(1.3, multiplier))
  }

  private calculateRefinementMultiplier(title: any, preferences: ParsedPreferences): number {
    let multiplier = 1.0

    if (preferences.popularityPreference) {
      const popularity = RankingScorer.popularityScore(title.voteCount)

      if (preferences.popularityPreference === 'mainstream') {
        if (popularity >= 0.75) {
          multiplier += 0.2
        } else if (popularity >= 0.6) {
          multiplier += 0.1
        } else if (popularity < 0.4) {
          multiplier -= 0.12
        }
      }

      if (preferences.popularityPreference === 'niche') {
        if (popularity < 0.45) {
          multiplier += 0.15
        } else if (popularity > 0.75) {
          multiplier -= 0.18
        }
      }
    }

    if (preferences.yearRange?.min !== undefined && preferences.yearRange?.max !== undefined && title.year) {
      const year = Number(title.year)
      if (Number.isFinite(year)) {
        const inRange = year >= preferences.yearRange.min && year <= preferences.yearRange.max
        if (inRange) {
          multiplier += 0.28
        } else {
          const rangeCenter = (preferences.yearRange.min + preferences.yearRange.max) / 2
          const distance = Math.abs(year - rangeCenter)
          if (distance > 20) {
            multiplier -= 0.22
          } else if (distance > 10) {
            multiplier -= 0.1
          }
        }
      }
    }

    return Math.max(0.6, Math.min(1.4, multiplier))
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
      : 'Recommended based on overall catalog fit to your request.'
  }
}

export const recommendationEngine = new RecommendationEngine()
