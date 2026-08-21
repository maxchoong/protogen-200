/**
 * Free Movie Database (FM-DB) Client
 * Documentation: https://imdb.iamidiotareyoutoo.com/docs/index.html
 * No API key required - free and open API
 */
const FMDB_BASE_URL = 'http://www.omdbapi.com';
const FMDB_API_KEY = 'trilogy'; // Free public key for testing
const FMDB_SEARCH_TTL_MS = 60 * 60 * 1000;
const FMDB_DETAILS_TTL_MS = 12 * 60 * 60 * 1000;
const FMDB_FAILURE_TTL_MS = 2 * 60 * 1000;
export class FMDBClient {
    constructor() {
        this.searchCache = new Map();
        this.detailsCache = new Map();
        console.log('✅ FM-DB Client initialized (no API key required)');
    }
    /**
     * Search for movies/TV shows by title
     * Endpoint: /?s={title}&type={movie|series}
     */
    async searchByTitle(query, type) {
        const cacheKey = `${query.trim().toLowerCase()}:${type || 'all'}`;
        const cached = this.getCachedValue(this.searchCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        try {
            console.log(`[FM-DB] Searching for: "${query}" (type: ${type || 'all'})`);
            const params = new URLSearchParams({
                s: query,
                apikey: FMDB_API_KEY
            });
            if (type) {
                params.append('type', type);
            }
            const response = await fetch(`${FMDB_BASE_URL}/?${params}`, {
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) {
                console.error(`[FM-DB] HTTP error: ${response.status}`);
                this.setCachedValue(this.searchCache, cacheKey, [], FMDB_FAILURE_TTL_MS);
                return [];
            }
            const data = await response.json();
            if (data.Response === 'False') {
                console.log(`[FM-DB] No results: ${data.Error}`);
                this.setCachedValue(this.searchCache, cacheKey, [], FMDB_SEARCH_TTL_MS);
                return [];
            }
            const results = data.Search || [];
            this.setCachedValue(this.searchCache, cacheKey, results, FMDB_SEARCH_TTL_MS);
            return results;
        }
        catch (error) {
            console.error('[FM-DB] Search error:', error);
            this.setCachedValue(this.searchCache, cacheKey, [], FMDB_FAILURE_TTL_MS);
            return [];
        }
    }
    /**
     * Get detailed information about a specific title
     * Endpoint: /?i={imdbID}
     */
    async getDetails(imdbID) {
        const cacheKey = imdbID.trim();
        const cached = this.getCachedValue(this.detailsCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        try {
            console.log(`[FM-DB] Fetching details for ID: ${imdbID}`);
            const params = new URLSearchParams({
                i: imdbID,
                plot: 'full',
                apikey: FMDB_API_KEY
            });
            const response = await fetch(`${FMDB_BASE_URL}/?${params}`, {
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) {
                this.setCachedValue(this.detailsCache, cacheKey, null, FMDB_FAILURE_TTL_MS);
                return null;
            }
            const data = (await response.json());
            if (data.Response === 'False') {
                console.log(`[FM-DB] Details not found: ${data.Error || 'Unknown error'}`);
                this.setCachedValue(this.detailsCache, cacheKey, null, FMDB_DETAILS_TTL_MS);
                return null;
            }
            const details = data;
            this.setCachedValue(this.detailsCache, cacheKey, details, FMDB_DETAILS_TTL_MS);
            return details;
        }
        catch (error) {
            console.error('[FM-DB] Details error:', error);
            this.setCachedValue(this.detailsCache, cacheKey, null, FMDB_FAILURE_TTL_MS);
            return null;
        }
    }
    /**
     * Search and enrich results with full details
     * This provides complete info including plot, rating, genre
     */
    async searchWithDetails(query, type, limit = 10) {
        try {
            // First, search for titles
            const searchResults = await this.searchByTitle(query, type);
            if (searchResults.length === 0) {
                return [];
            }
            // Fetch details for each result (up to limit)
            const detailsPromises = searchResults
                .slice(0, limit)
                .map(result => this.getDetails(result.imdbID));
            const detailedResults = await Promise.all(detailsPromises);
            // Filter out null results and return
            return detailedResults.filter((r) => r !== null);
        }
        catch (error) {
            console.error('[FM-DB] Search with details error:', error);
            return [];
        }
    }
    /**
     * Helper: Convert FM-DB format to internal format
     */
    convertToInternal(fmdbMovie) {
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
        };
    }
    getCachedValue(cache, key) {
        const entry = cache.get(key);
        if (!entry) {
            return undefined;
        }
        if (Date.now() > entry.expiresAt) {
            cache.delete(key);
            return undefined;
        }
        return entry.value;
    }
    setCachedValue(cache, key, value, ttlMs) {
        cache.set(key, {
            value,
            expiresAt: Date.now() + ttlMs
        });
    }
}
// Singleton instance
export const fmdbClient = new FMDBClient();
