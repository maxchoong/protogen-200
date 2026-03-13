/**
 * Free Movie Database (FM-DB) Client
 * Documentation: https://imdb.iamidiotareyoutoo.com/docs/index.html
 * No API key required - free and open API
 */

const FMDB_BASE_URL = 'http://www.omdbapi.com'
const FMDB_API_KEY = 'trilogy' // Free public key for testing

interface FMDBMovie {
  imdbID: string
  Title: string
  Year: string
  Type: 'movie' | 'series' | 'episode'
  Poster?: string
  imdbRating?: string
  Plot?: string
  Genre?: string
  Rated?: string
  Director?: string
  Actors?: string
}

interface FMDBSearchResponse {
  Search?: FMDBMovie[]
  totalResults?: string
  Response: 'True' | 'False'
  Error?: string
}

export class FMDBClient {
  constructor() {
    console.log('✅ FM-DB Client initialized (no API key required)')
  }

  /**
   * Search for movies/TV shows by title
   * Endpoint: /?s={title}&type={movie|series}
   */
  async searchByTitle(query: string, type?: 'movie' | 'series'): Promise<FMDBMovie[]> {
    try {
      console.log(`[FM-DB] Searching for: "${query}" (type: ${type || 'all'})`)
      
      const params = new URLSearchParams({ 
        s: query,
        apikey: FMDB_API_KEY
      })
      if (type) {
        params.append('type', type)
      }

      const response = await fetch(`${FMDB_BASE_URL}/?${params}`, {
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        console.error(`[FM-DB] HTTP error: ${response.status}`)
        return []
      }

      const data = await response.json() as FMDBSearchResponse

      if (data.Response === 'False') {
        console.log(`[FM-DB] No results: ${data.Error}`)
        return []
      }

      return data.Search || []
    } catch (error) {
      console.error('[FM-DB] Search error:', error)
      return []
    }
  }

  /**
   * Get detailed information about a specific title
   * Endpoint: /?i={imdbID}
   */
  async getDetails(imdbID: string): Promise<FMDBMovie | null> {
    try {
      console.log(`[FM-DB] Fetching details for ID: ${imdbID}`)

      const params = new URLSearchParams({ 
        i: imdbID, 
        plot: 'full',
        apikey: FMDB_API_KEY
      })
      const response = await fetch(`${FMDB_BASE_URL}/?${params}`, {
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as any

      if (data.Response === 'False') {
        console.log(`[FM-DB] Details not found: ${data.Error || 'Unknown error'}`)
        return null
      }

      return data as FMDBMovie
    } catch (error) {
      console.error('[FM-DB] Details error:', error)
      return null
    }
  }

  /**
   * Search and enrich results with full details
   * This provides complete info including plot, rating, genre
   */
  async searchWithDetails(
    query: string,
    type?: 'movie' | 'series',
    limit: number = 10
  ): Promise<FMDBMovie[]> {
    try {
      // First, search for titles
      const searchResults = await this.searchByTitle(query, type)

      if (searchResults.length === 0) {
        return []
      }

      // Fetch details for each result (up to limit)
      const detailsPromises = searchResults
        .slice(0, limit)
        .map(result => this.getDetails(result.imdbID))

      const detailedResults = await Promise.all(detailsPromises)

      // Filter out null results and return
      return detailedResults.filter((r): r is FMDBMovie => r !== null)
    } catch (error) {
      console.error('[FM-DB] Search with details error:', error)
      return []
    }
  }

  /**
   * Helper: Convert FM-DB format to internal format
   */
  convertToInternal(fmdbMovie: FMDBMovie): any {
    return {
      id: fmdbMovie.imdbID,
      title: fmdbMovie.Title,
      year: parseInt(fmdbMovie.Year) || 0,
      type: fmdbMovie.Type,
      poster: fmdbMovie.Poster !== 'N/A' ? fmdbMovie.Poster : undefined,
      rating: fmdbMovie.imdbRating ? parseFloat(fmdbMovie.imdbRating) : undefined,
      plot: fmdbMovie.Plot !== 'N/A' ? fmdbMovie.Plot : undefined,
      genres: fmdbMovie.Genre ? fmdbMovie.Genre.split(', ') : [],
      rated: fmdbMovie.Rated !== 'N/A' ? fmdbMovie.Rated : undefined,
      director: fmdbMovie.Director !== 'N/A' ? fmdbMovie.Director : undefined,
      actors: fmdbMovie.Actors !== 'N/A' ? fmdbMovie.Actors : undefined,
    }
  }
}

// Singleton instance
export const fmdbClient = new FMDBClient()
