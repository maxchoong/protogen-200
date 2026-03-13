import { fmdbClient } from '../clients/fmdb.js'
import { llmClient } from '../clients/llm.js'
import { streamingClient } from '../clients/streaming.js'
import { tmdbClient } from '../clients/tmdb.js'
import { ContentSafetyFilter } from '../filters/contentSafety.js'
import { PreferenceParser, ParsedPreferences, RecommendationRequest } from './preferenceParser.js'

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
}

/**
 * Core recommendation engine using FM-DB API
 */
export class RecommendationEngine {
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

    // Rank and limit
    const ranked = this.rankTitles(safe, preferences)
    const final = ranked.slice(0, limit)

    console.log(`[Engine] Returning ${final.length} recommendations`)

    // Generate LLM explanations in batch if available
    let llmExplanations = new Map<string, string>()
    if (llmClient.isEnabled() && final.length > 0) {
      try {
        const titlesForLLM = final.map(item => ({
          title: item.title,
          genre: (item.genres || []).join(', '),
          plot: item.plot || '',
          rating: item.rating
        }))
        
        llmExplanations = await llmClient.generateWhyThisBatch(
          request.description,
          titlesForLLM
        )
        
        if (llmExplanations.size > 0) {
          console.log(`[Engine] Generated ${llmExplanations.size} LLM explanations`)
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
        trailerData
      )
    )
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
   * Rank titles by relevance
   */
  private rankTitles(titles: any[], preferences: ParsedPreferences): any[] {
    return titles.sort((a, b) => {
      // Score by genre match
      const aGenreMatch = this.genreMatchScore(a.genres || [], preferences.genres)
      const bGenreMatch = this.genreMatchScore(b.genres || [], preferences.genres)

      if (aGenreMatch !== bGenreMatch) {
        return bGenreMatch - aGenreMatch
      }

      // Then by rating
      return (b.rating || 0) - (a.rating || 0)
    })
  }

  private genreMatchScore(itemGenres: string[], preferredGenres: string[]): number {
    if (preferredGenres.length === 0) return 0

    const matches = itemGenres.filter(g =>
      preferredGenres.some(pg => pg.toLowerCase() === g.toLowerCase())
    )

    return matches.length
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
    trailerData?: Map<string, string>
  ): Recommendation {
    const type = item.type === 'series' ? 'tv' : 'movie'
    const year = item.year?.toString() || 'N/A'

    // Use LLM-generated explanation if available, otherwise fallback to rule-based
    const whyThis = llmExplanations?.get(item.title) || this.generateWhyThis(item, preferences)

    // Get availability data if available
    const availability = availabilityData?.get(item.id) || undefined

    // Get trailer URL if available
    const trailerUrl = trailerData?.get(item.id) || undefined

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
      score: item.rating || 0
    }
  }

  /**
   * Generate explanation for why this title was recommended
   */
  private generateWhyThis(item: any, preferences: ParsedPreferences): string {
    const reasons: string[] = []

    // Genre match
    if (preferences.genres.length > 0) {
      const matchedGenres = (item.genres || []).filter((g: string) =>
        preferences.genres.some(pg => pg.toLowerCase() === g.toLowerCase())
      )
      if (matchedGenres.length > 0) {
        reasons.push(`Matches your ${matchedGenres.join(', ')} preference`)
      }
    }

    // Rating
    if (item.rating && item.rating >= 8.0) {
      reasons.push(`Highly rated (${item.rating}/10 on IMDb)`)
    } else if (item.rating && item.rating >= 7.0) {
      reasons.push(`Well-reviewed (${item.rating}/10)`)
    }

    // Mood matching
    if (preferences.mood.length > 0 && item.plot) {
      const plotLower = item.plot.toLowerCase()
      const moodKeywords: Record<string, string[]> = {
        happy: ['heartwarming', 'uplifting', 'joyful', 'cheerful'],
        sad: ['emotional', 'touching', 'tearjerker', 'melancholy'],
        intense: ['action', 'thriller', 'suspense', 'gripping', 'intense'],
        relaxing: ['gentle', 'peaceful', 'calm', 'cozy', 'comfort'],
        funny: ['comedy', 'hilarious', 'humorous', 'witty'],
        thoughtful: ['philosophical', 'thought-provoking', 'intelligent']
      }

      for (const mood of preferences.mood) {
        const keywords = moodKeywords[mood.toLowerCase()] || []
        if (keywords.some(kw => plotLower.includes(kw))) {
          reasons.push(`Fits your ${mood} mood`)
          break
        }
      }
    }

    return reasons.length > 0
      ? reasons.join('. ') + '.'
      : 'Popular choice based on your preferences.'
  }
}

export const recommendationEngine = new RecommendationEngine()
