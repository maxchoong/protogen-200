import { config } from '../config.js'

/**
 * TMDB Genre mappings - Maps UI genre names to TMDB genre IDs
 */
const GENRE_MAP: Record<string, number> = {
  'Action': 28,
  'Comedy': 35,
  'Drama': 18,
  'Horror': 27,
  'Romance': 10749,
  'Sci-Fi': 878,
  'Thriller': 53,
  'Animation': 16,
  'Adventure': 12,
  'Crime': 80,
  'Documentary': 99,
  'Fantasy': 14,
  'Mystery': 9648,
  'Western': 37,
  'War': 10752,
  'History': 36,
  'Music': 10402,
  'Family': 10751
}

export interface TMDBTitle {
  id: number
  title: string
  name?: string
  poster_path?: string
  overview: string
  release_date?: string
  first_air_date?: string
  media_type: 'movie' | 'tv'
  genre_ids: number[]
  vote_average: number
  adult: boolean
  original_language: string
}

export interface SearchQuery {
  query?: string
  includeMovies: boolean
  includeTV: boolean
  genres: string[]
  minRating: number
  maxRating: number
  excludeAdult: boolean
  excludeUnrated: boolean
  excludeXRated: boolean
}

export class TMDBClient {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = config.tmdb.apiKey
    this.baseUrl = config.tmdb.baseUrl
  }

  /**
   * Fetches titles based on search query
   */
  async searchTitles(
    query: string,
    options: Partial<SearchQuery> = {}
  ): Promise<TMDBTitle[]> {
    // If using demo key, return empty
    if (this.apiKey === 'demo-key') {
      console.log('[TMDB]', `Would search: "${query}"`)
      return []
    }

    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        query: query,
        include_adult: String(!options.excludeAdult),
        region: config.tmdb.region
      })

      const response = await fetch(
        `${this.baseUrl}/search/multi?${params}`,
        { signal: AbortSignal.timeout(5000) }
      )

      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`)
      }

      const data = await response.json() as { results: TMDBTitle[] }
      return this.filterTitles(data.results, options)
    } catch (error) {
      console.error('[TMDB] Search error:', error)
      return []
    }
  }

  /**
   * Discovers titles by genre and filters
   */
  async discoverByGenres(
    genres: string[],
    options: Partial<SearchQuery> = {}
  ): Promise<TMDBTitle[]> {
    // If using demo key, return empty
    if (this.apiKey === 'demo-key') {
      console.log('[TMDB]', `Would discover genres: ${genres.join(', ')}`)
      return []
    }

    try {
      const genreIds = genres
        .map(g => GENRE_MAP[g])
        .filter(Boolean)
        .join(',')

      if (!genreIds) {
        return []
      }

      const moviePromise = this.discoverMovies(genreIds, options)
      const tvPromise = this.discoverTV(genreIds, options)

      const [movies, tv] = await Promise.all([moviePromise, tvPromise])
      return [...movies, ...tv]
    } catch (error) {
      console.error('[TMDB] Discover error:', error)
      return []
    }
  }

  /**
   * Gets trending titles
   */
  async getTrending(
    timeWindow: 'day' | 'week' = 'week'
  ): Promise<TMDBTitle[]> {
    // If using demo key, return empty
    if (this.apiKey === 'demo-key') {
      console.log('[TMDB]', `Would fetch trending (${timeWindow})`)
      return []
    }

    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        include_adult: 'false'
      })

      const response = await fetch(
        `${this.baseUrl}/trending/all/${timeWindow}?${params}`,
        { signal: AbortSignal.timeout(5000) }
      )

      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`)
      }

      const data = await response.json() as { results: TMDBTitle[] }
      return this.filterTitles(data.results)
    } catch (error) {
      console.error('[TMDB] Trending error:', error)
      return []
    }
  }

  /**
   * Gets detailed info about a specific title
   */
  async getTitleDetails(
    titleId: number,
    mediaType: 'movie' | 'tv'
  ): Promise<TMDBTitle | null> {
    // If using demo key, return null
    if (this.apiKey === 'demo-key') {
      return null
    }

    try {
      const params = new URLSearchParams({
        api_key: this.apiKey
      })

      const response = await fetch(
        `${this.baseUrl}/${mediaType}/${titleId}?${params}`,
        { signal: AbortSignal.timeout(5000) }
      )

      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`)
      }

      const data = await response.json()
      return this.normalizeTMDBResponse(data, mediaType)
    } catch (error) {
      console.error('[TMDB] Details error:', error)
      return null
    }
  }

  /**
   * Gets videos (trailers) for a title
   */
  async getVideos(
    titleId: number,
    mediaType: 'movie' | 'tv'
  ): Promise<{ key: string; type: string }[]> {
    // If using demo key, return empty
    if (this.apiKey === 'demo-key') {
      return []
    }

    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        language: 'en-US'
      })

      const response = await fetch(
        `${this.baseUrl}/${mediaType}/${titleId}/videos?${params}`,
        { signal: AbortSignal.timeout(5000) }
      )

      if (!response.ok) {
        return []
      }

      const data = await response.json() as { results: { key: string; type: string }[] }
      return data.results.filter(v => v.type === 'Trailer')
    } catch (error) {
      console.error('[TMDB] Videos error:', error)
      return []
    }
  }

  /**
   * Get trailer URL by IMDb ID
   */
  async getTrailerByImdbId(
    imdbId: string,
    type: 'movie' | 'tv' = 'movie'
  ): Promise<string | undefined> {
    if (this.apiKey === 'demo-key') {
      return undefined
    }

    try {
      console.log(`[TMDB] Fetching trailer for ${imdbId} (${type})`)

      // TMDB supports querying by IMDb ID using find endpoint
      const params = new URLSearchParams({
        api_key: this.apiKey,
        external_source: 'imdb_id'
      })

      const findResponse = await fetch(
        `${this.baseUrl}/find/${imdbId}?${params}`,
        { signal: AbortSignal.timeout(8000) }
      )

      if (!findResponse.ok) {
        console.warn(`[TMDB] Find request failed: ${findResponse.status}`)
        return undefined
      }

      const findData = await findResponse.json() as any
      const results = type === 'movie' ? findData.movie_results : findData.tv_results

      if (!results || results.length === 0) {
        console.log(`[TMDB] No ${type} found for ${imdbId}`)
        return undefined
      }

      const tmdbId = results[0].id

      // Get videos for this title
      const videos = await this.getVideos(tmdbId, type)

      if (videos.length > 0) {
        const url = `https://www.youtube.com/watch?v=${videos[0].key}`
        console.log(`[TMDB] Found trailer: ${url}`)
        return url
      }

      console.log(`[TMDB] No trailer found`)
      return undefined
    } catch (error) {
      console.error('[TMDB] Error fetching trailer:', error)
      return undefined
    }
  }

  /**
   * Batch get trailers for multiple titles by IMDb ID
   */
  async getTrailersBatch(
    items: Array<{ imdbId: string; type: 'movie' | 'tv' }>
  ): Promise<Map<string, string>> {
    const trailers = new Map<string, string>()

    // Process sequentially to respect rate limits
    for (const item of items) {
      const trailer = await this.getTrailerByImdbId(item.imdbId, item.type)
      if (trailer) {
        trailers.set(item.imdbId, trailer)
      }

      // Small delay to avoid hitting rate limits
      if (items.length > 5) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return trailers
  }

  // ===== Private methods =====

  private async discoverMovies(
    genreIds: string,
    options: Partial<SearchQuery>
  ): Promise<TMDBTitle[]> {
    if (!options.includeMovies) return []

    const params = new URLSearchParams({
      api_key: this.apiKey,
      with_genres: genreIds,
      include_adult: String(!options.excludeAdult),
      sort_by: 'popularity.desc',
      page: '1'
    })

    const response = await fetch(
      `${this.baseUrl}/discover/movie?${params}`,
      { signal: AbortSignal.timeout(5000) }
    )

    if (!response.ok) return []

    const data = await response.json() as { results: TMDBTitle[] }
    return this.filterTitles(data.results, options)
  }

  private async discoverTV(
    genreIds: string,
    options: Partial<SearchQuery>
  ): Promise<TMDBTitle[]> {
    if (!options.includeTV) return []

    const params = new URLSearchParams({
      api_key: this.apiKey,
      with_genres: genreIds,
      include_adult: String(!options.excludeAdult),
      sort_by: 'popularity.desc',
      page: '1'
    })

    const response = await fetch(
      `${this.baseUrl}/discover/tv?${params}`,
      { signal: AbortSignal.timeout(5000) }
    )

    if (!response.ok) return []

    const data = await response.json() as { results: TMDBTitle[] }
    return this.filterTitles(data.results, options)
  }

  private filterTitles(
    titles: TMDBTitle[],
    options: Partial<SearchQuery> = {}
  ): TMDBTitle[] {
    return titles.filter(title => {
      // Filter by type
      if (title.media_type === 'movie' && !options.includeMovies) return false
      if (title.media_type === 'tv' && !options.includeTV) return false

      // Filter by adult content
      if (options.excludeAdult && title.adult) return false

      // Must have overview and poster
      if (!title.overview || !title.poster_path) return false

      return true
    })
  }

  private normalizeTMDBResponse(
    data: any,
    mediaType: 'movie' | 'tv'
  ): TMDBTitle {
    return {
      id: data.id,
      title: data.title || data.name,
      name: data.name,
      poster_path: data.poster_path,
      overview: data.overview,
      release_date: data.release_date,
      first_air_date: data.first_air_date,
      media_type: mediaType,
      genre_ids: data.genre_ids || [],
      vote_average: data.vote_average || 0,
      adult: data.adult || false,
      original_language: data.original_language || 'en'
    }
  }
}

export const tmdbClient = new TMDBClient()
