import { config } from '../config.js';
/**
 * TMDB Genre mappings - Maps UI genre names to TMDB genre IDs
 */
const GENRE_MAP = {
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
};
const TMDB_DETAILS_TTL_MS = 12 * 60 * 60 * 1000;
const TMDB_CREDITS_TTL_MS = 12 * 60 * 60 * 1000;
const TMDB_VIDEOS_TTL_MS = 24 * 60 * 60 * 1000;
const TMDB_EXTERNAL_IDS_TTL_MS = 24 * 60 * 60 * 1000;
const TMDB_FIND_BY_IMDB_TTL_MS = 24 * 60 * 60 * 1000;
const TMDB_PERSON_LOOKUP_TTL_MS = 12 * 60 * 60 * 1000;
const TMDB_PERSON_CREDITS_TTL_MS = 12 * 60 * 60 * 1000;
const TMDB_TRAILER_BY_IMDB_TTL_MS = 24 * 60 * 60 * 1000;
const TMDB_FAILURE_TTL_MS = 2 * 60 * 1000;
export class TMDBClient {
    constructor() {
        this.titleDetailsCache = new Map();
        this.videosCache = new Map();
        this.externalIdsCache = new Map();
        this.titleCreditsCache = new Map();
        this.findByImdbCache = new Map();
        this.personIdCache = new Map();
        this.personCreditsCache = new Map();
        this.trailerByImdbCache = new Map();
        this.apiKey = config.tmdb.apiKey;
        this.readAccessToken = config.tmdb.readAccessToken;
        this.baseUrl = config.tmdb.baseUrl;
    }
    isEnabled() {
        return this.apiKey !== 'demo-key' || Boolean(this.readAccessToken);
    }
    applyAuth(params) {
        if (!this.readAccessToken) {
            params.set('api_key', this.apiKey);
        }
        return params;
    }
    buildAuthHeaders() {
        if (!this.readAccessToken) {
            return {};
        }
        return {
            Authorization: `Bearer ${this.readAccessToken}`
        };
    }
    /**
     * Fetches titles based on search query
     */
    async searchTitles(query, options = {}) {
        // If no valid auth is configured, return empty.
        if (!this.isEnabled()) {
            console.log('[TMDB]', `Would search: "${query}"`);
            return [];
        }
        try {
            const params = this.applyAuth(new URLSearchParams({
                query: query,
                include_adult: String(!options.excludeAdult),
                region: config.tmdb.region
            }));
            const response = await fetch(`${this.baseUrl}/search/multi?${params}`, {
                signal: AbortSignal.timeout(5000),
                headers: this.buildAuthHeaders()
            });
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status}`);
            }
            const data = await response.json();
            return this.filterTitles(data.results, options);
        }
        catch (error) {
            console.error('[TMDB] Search error:', error);
            return [];
        }
    }
    /**
     * Discovers titles by genre and filters
     */
    async discoverByGenres(genres, options = {}) {
        // If no valid auth is configured, return empty.
        if (!this.isEnabled()) {
            console.log('[TMDB]', `Would discover genres: ${genres.join(', ')}`);
            return [];
        }
        try {
            const genreIds = genres
                .map(g => GENRE_MAP[g])
                .filter(Boolean)
                .join(',');
            if (!genreIds) {
                return [];
            }
            const moviePromise = this.discoverMovies(genreIds, options);
            const tvPromise = this.discoverTV(genreIds, options);
            const [movies, tv] = await Promise.all([moviePromise, tvPromise]);
            return [...movies, ...tv];
        }
        catch (error) {
            console.error('[TMDB] Discover error:', error);
            return [];
        }
    }
    /**
     * Gets trending titles
     */
    async getTrending(timeWindow = 'week') {
        // If no valid auth is configured, return empty.
        if (!this.isEnabled()) {
            console.log('[TMDB]', `Would fetch trending (${timeWindow})`);
            return [];
        }
        try {
            const params = this.applyAuth(new URLSearchParams({
                include_adult: 'false'
            }));
            const response = await fetch(`${this.baseUrl}/trending/all/${timeWindow}?${params}`, {
                signal: AbortSignal.timeout(5000),
                headers: this.buildAuthHeaders()
            });
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status}`);
            }
            const data = await response.json();
            return this.filterTitles(data.results);
        }
        catch (error) {
            console.error('[TMDB] Trending error:', error);
            return [];
        }
    }
    async discoverPopularByYear(year, options = {}, page = 1) {
        if (!this.isEnabled()) {
            return [];
        }
        const includeMovies = options.includeMovies ?? true;
        const includeTV = options.includeTV ?? true;
        const includeAdult = String(!options.excludeAdult);
        try {
            const [movieResults, tvResults] = await Promise.all([
                includeMovies
                    ? this.fetchDiscoverByYear('movie', year, includeAdult, page)
                    : Promise.resolve([]),
                includeTV
                    ? this.fetchDiscoverByYear('tv', year, includeAdult, page)
                    : Promise.resolve([])
            ]);
            const combined = [...movieResults, ...tvResults];
            return this.filterTitles(combined, {
                includeMovies,
                includeTV,
                excludeAdult: options.excludeAdult ?? true
            });
        }
        catch (error) {
            console.error('[TMDB] Discover by year error:', error);
            return [];
        }
    }
    /**
     * Gets detailed info about a specific title
     */
    async getTitleDetails(titleId, mediaType) {
        // If no valid auth is configured, return null.
        if (!this.isEnabled()) {
            return null;
        }
        const cacheKey = `${mediaType}:${titleId}`;
        const cached = this.getCachedValue(this.titleDetailsCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const params = this.applyAuth(new URLSearchParams());
            const response = await fetch(`${this.baseUrl}/${mediaType}/${titleId}?${params}`, {
                signal: AbortSignal.timeout(5000),
                headers: this.buildAuthHeaders()
            });
            if (!response.ok) {
                this.setCachedValue(this.titleDetailsCache, cacheKey, null, TMDB_FAILURE_TTL_MS);
                throw new Error(`TMDB API error: ${response.status}`);
            }
            const data = await response.json();
            const normalized = this.normalizeTMDBResponse(data, mediaType);
            this.setCachedValue(this.titleDetailsCache, cacheKey, normalized, TMDB_DETAILS_TTL_MS);
            return normalized;
        }
        catch (error) {
            console.error('[TMDB] Details error:', error);
            this.setCachedValue(this.titleDetailsCache, cacheKey, null, TMDB_FAILURE_TTL_MS);
            return null;
        }
    }
    /**
     * Gets videos (trailers) for a title
     */
    async getVideos(titleId, mediaType) {
        // If no valid auth is configured, return empty.
        if (!this.isEnabled()) {
            return [];
        }
        const cacheKey = `${mediaType}:${titleId}`;
        const cached = this.getCachedValue(this.videosCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const params = this.applyAuth(new URLSearchParams({
                language: 'en-US'
            }));
            const response = await fetch(`${this.baseUrl}/${mediaType}/${titleId}/videos?${params}`, {
                signal: AbortSignal.timeout(5000),
                headers: this.buildAuthHeaders()
            });
            if (!response.ok) {
                this.setCachedValue(this.videosCache, cacheKey, [], TMDB_FAILURE_TTL_MS);
                return [];
            }
            const data = await response.json();
            const trailers = data.results.filter(v => v.type === 'Trailer');
            this.setCachedValue(this.videosCache, cacheKey, trailers, TMDB_VIDEOS_TTL_MS);
            return trailers;
        }
        catch (error) {
            console.error('[TMDB] Videos error:', error);
            this.setCachedValue(this.videosCache, cacheKey, [], TMDB_FAILURE_TTL_MS);
            return [];
        }
    }
    async getExternalIds(titleId, mediaType) {
        if (!this.isEnabled()) {
            return {};
        }
        const cacheKey = `${mediaType}:${titleId}`;
        const cached = this.getCachedValue(this.externalIdsCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const params = this.applyAuth(new URLSearchParams());
            const response = await fetch(`${this.baseUrl}/${mediaType}/${titleId}/external_ids?${params}`, {
                signal: AbortSignal.timeout(5000),
                headers: this.buildAuthHeaders()
            });
            if (!response.ok) {
                this.setCachedValue(this.externalIdsCache, cacheKey, {}, TMDB_FAILURE_TTL_MS);
                return {};
            }
            const data = await response.json();
            const externalIds = {
                imdbId: data.imdb_id || undefined
            };
            this.setCachedValue(this.externalIdsCache, cacheKey, externalIds, TMDB_EXTERNAL_IDS_TTL_MS);
            return externalIds;
        }
        catch (error) {
            console.error('[TMDB] External IDs error:', error);
            this.setCachedValue(this.externalIdsCache, cacheKey, {}, TMDB_FAILURE_TTL_MS);
            return {};
        }
    }
    async getTitleCredits(titleId, mediaType) {
        if (!this.isEnabled()) {
            return { mainCast: [], directors: [] };
        }
        const cacheKey = `${mediaType}:${titleId}`;
        const cached = this.getCachedValue(this.titleCreditsCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const params = this.applyAuth(new URLSearchParams());
            const response = await fetch(`${this.baseUrl}/${mediaType}/${titleId}/credits?${params}`, {
                signal: AbortSignal.timeout(5000),
                headers: this.buildAuthHeaders()
            });
            if (!response.ok) {
                const emptyCredits = { mainCast: [], directors: [] };
                this.setCachedValue(this.titleCreditsCache, cacheKey, emptyCredits, TMDB_FAILURE_TTL_MS);
                return { mainCast: [], directors: [] };
            }
            const data = await response.json();
            const cast = (data.cast || [])
                .filter(member => !!member.name)
                .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
                .map(member => member.name.trim())
                .filter(name => name.length > 0);
            const directors = (data.crew || [])
                .filter(member => {
                if (!member.name) {
                    return false;
                }
                const job = (member.job || '').toLowerCase();
                const department = (member.department || '').toLowerCase();
                return (job === 'director' ||
                    job === 'series director' ||
                    job === 'creator' ||
                    department === 'directing');
            })
                .map(member => member.name.trim())
                .filter(name => name.length > 0);
            const credits = {
                mainCast: Array.from(new Set(cast)).slice(0, 5),
                directors: Array.from(new Set(directors)).slice(0, 2)
            };
            this.setCachedValue(this.titleCreditsCache, cacheKey, credits, TMDB_CREDITS_TTL_MS);
            return credits;
        }
        catch (error) {
            console.error('[TMDB] Credits error:', error);
            this.setCachedValue(this.titleCreditsCache, cacheKey, { mainCast: [], directors: [] }, TMDB_FAILURE_TTL_MS);
            return { mainCast: [], directors: [] };
        }
    }
    async findTitleByImdbId(imdbId, typeHint) {
        if (!this.isEnabled()) {
            return null;
        }
        const cacheKey = `${imdbId}:${typeHint || 'any'}`;
        const cached = this.getCachedValue(this.findByImdbCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        try {
            const params = this.applyAuth(new URLSearchParams({
                external_source: 'imdb_id'
            }));
            const response = await fetch(`${this.baseUrl}/find/${imdbId}?${params}`, {
                signal: AbortSignal.timeout(8000),
                headers: this.buildAuthHeaders()
            });
            if (!response.ok) {
                this.setCachedValue(this.findByImdbCache, cacheKey, null, TMDB_FAILURE_TTL_MS);
                return null;
            }
            const data = await response.json();
            const movieResult = data.movie_results?.[0];
            const tvResult = data.tv_results?.[0];
            if (typeHint === 'movie' && movieResult) {
                const match = { tmdbId: movieResult.id, mediaType: 'movie' };
                this.setCachedValue(this.findByImdbCache, cacheKey, match, TMDB_FIND_BY_IMDB_TTL_MS);
                return match;
            }
            if (typeHint === 'tv' && tvResult) {
                const match = { tmdbId: tvResult.id, mediaType: 'tv' };
                this.setCachedValue(this.findByImdbCache, cacheKey, match, TMDB_FIND_BY_IMDB_TTL_MS);
                return match;
            }
            if (movieResult) {
                const match = { tmdbId: movieResult.id, mediaType: 'movie' };
                this.setCachedValue(this.findByImdbCache, cacheKey, match, TMDB_FIND_BY_IMDB_TTL_MS);
                return match;
            }
            if (tvResult) {
                const match = { tmdbId: tvResult.id, mediaType: 'tv' };
                this.setCachedValue(this.findByImdbCache, cacheKey, match, TMDB_FIND_BY_IMDB_TTL_MS);
                return match;
            }
            this.setCachedValue(this.findByImdbCache, cacheKey, null, TMDB_FIND_BY_IMDB_TTL_MS);
            return null;
        }
        catch (error) {
            console.error('[TMDB] Find by IMDb error:', error);
            this.setCachedValue(this.findByImdbCache, cacheKey, null, TMDB_FAILURE_TTL_MS);
            return null;
        }
    }
    /**
     * Finds titles associated with an actor/person name.
     * Uses person search + cast credits to support talent-mode recommendations.
     */
    async searchTitlesForPerson(personName, options = {}, limit = 30) {
        if (!this.isEnabled()) {
            return [];
        }
        try {
            const personId = await this.searchPersonId(personName);
            if (!personId) {
                return [];
            }
            const normalized = await this.getPersonCredits(personId);
            const filtered = this.filterTitles(normalized, {
                includeMovies: options.includeMovies ?? true,
                includeTV: options.includeTV ?? true,
                excludeAdult: options.excludeAdult ?? true
            });
            const deduped = Array.from(new Map(filtered.map(item => [`${item.media_type}:${item.id}`, item])).values());
            return deduped
                .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
                .slice(0, limit);
        }
        catch (error) {
            console.error('[TMDB] Person filmography search error:', error);
            return [];
        }
    }
    mapGenreIdsToNames(genreIds) {
        if (!genreIds || genreIds.length === 0) {
            return [];
        }
        const reverseGenreMap = new Map();
        for (const [name, id] of Object.entries(GENRE_MAP)) {
            reverseGenreMap.set(id, name);
        }
        return Array.from(new Set(genreIds
            .map(id => reverseGenreMap.get(id))
            .filter((name) => Boolean(name))));
    }
    /**
     * Get trailer URL by IMDb ID
     */
    async getTrailerByImdbId(imdbId, type = 'movie') {
        if (!this.isEnabled()) {
            return undefined;
        }
        const cacheKey = `${imdbId}:${type}`;
        const cached = this.getCachedValue(this.trailerByImdbCache, cacheKey);
        if (cached !== undefined) {
            return cached || undefined;
        }
        try {
            console.log(`[TMDB] Fetching trailer for ${imdbId} (${type})`);
            const match = await this.findTitleByImdbId(imdbId, type);
            if (!match) {
                console.log(`[TMDB] No ${type} found for ${imdbId}`);
                return undefined;
            }
            const tmdbId = match.tmdbId;
            const mediaType = match.mediaType;
            // Get videos for this title
            const videos = await this.getVideos(tmdbId, mediaType);
            if (videos.length > 0) {
                const url = `https://www.youtube.com/watch?v=${videos[0].key}`;
                console.log(`[TMDB] Found trailer: ${url}`);
                this.setCachedValue(this.trailerByImdbCache, cacheKey, url, TMDB_TRAILER_BY_IMDB_TTL_MS);
                return url;
            }
            console.log(`[TMDB] No trailer found`);
            this.setCachedValue(this.trailerByImdbCache, cacheKey, null, TMDB_FAILURE_TTL_MS);
            return undefined;
        }
        catch (error) {
            console.error('[TMDB] Error fetching trailer:', error);
            this.setCachedValue(this.trailerByImdbCache, cacheKey, null, TMDB_FAILURE_TTL_MS);
            return undefined;
        }
    }
    /**
     * Batch get trailers for multiple titles by IMDb ID
     */
    async getTrailersBatch(items) {
        const trailers = new Map();
        // Process sequentially to respect rate limits
        for (const item of items) {
            const trailer = await this.getTrailerByImdbId(item.imdbId, item.type);
            if (trailer) {
                trailers.set(item.imdbId, trailer);
            }
            // Small delay to avoid hitting rate limits
            if (items.length > 5) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        return trailers;
    }
    // ===== Private methods =====
    async searchPersonId(personName) {
        const cacheKey = personName.trim().toLowerCase();
        const cached = this.getCachedValue(this.personIdCache, cacheKey);
        if (cached !== undefined) {
            return cached || undefined;
        }
        const params = this.applyAuth(new URLSearchParams({
            query: personName,
            include_adult: 'false'
        }));
        const response = await fetch(`${this.baseUrl}/search/person?${params}`, {
            signal: AbortSignal.timeout(5000),
            headers: this.buildAuthHeaders()
        });
        if (!response.ok) {
            this.setCachedValue(this.personIdCache, cacheKey, null, TMDB_FAILURE_TTL_MS);
            return undefined;
        }
        const data = await response.json();
        const results = data.results || [];
        if (results.length === 0) {
            this.setCachedValue(this.personIdCache, cacheKey, null, TMDB_PERSON_LOOKUP_TTL_MS);
            return undefined;
        }
        const ranked = [...results].sort((a, b) => {
            const aActing = a.known_for_department === 'Acting' ? 1 : 0;
            const bActing = b.known_for_department === 'Acting' ? 1 : 0;
            return bActing - aActing;
        });
        const personId = ranked[0].id;
        this.setCachedValue(this.personIdCache, cacheKey, personId, TMDB_PERSON_LOOKUP_TTL_MS);
        return personId;
    }
    async getPersonCredits(personId) {
        const cacheKey = String(personId);
        const cached = this.getCachedValue(this.personCreditsCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }
        const params = this.applyAuth(new URLSearchParams());
        const response = await fetch(`${this.baseUrl}/person/${personId}/combined_credits?${params}`, {
            signal: AbortSignal.timeout(5000),
            headers: this.buildAuthHeaders()
        });
        if (!response.ok) {
            this.setCachedValue(this.personCreditsCache, cacheKey, [], TMDB_FAILURE_TTL_MS);
            throw new Error(`TMDB credits API error: ${response.status}`);
        }
        const data = await response.json();
        const castCredits = data.cast || [];
        const normalized = castCredits
            .map((credit) => {
            const mediaType = credit.media_type === 'tv' ? 'tv' : credit.media_type === 'movie' ? 'movie' : undefined;
            if (!mediaType) {
                return null;
            }
            return {
                id: credit.id,
                title: credit.title || credit.name || '',
                name: credit.name,
                poster_path: credit.poster_path,
                overview: credit.overview || '',
                release_date: credit.release_date,
                first_air_date: credit.first_air_date,
                media_type: mediaType,
                genre_ids: credit.genre_ids || [],
                vote_average: credit.vote_average || 0,
                vote_count: credit.vote_count || 0,
                adult: credit.adult || false,
                original_language: credit.original_language || 'en'
            };
        })
            .filter((item) => item !== null);
        this.setCachedValue(this.personCreditsCache, cacheKey, normalized, TMDB_PERSON_CREDITS_TTL_MS);
        return normalized;
    }
    async discoverMovies(genreIds, options) {
        if (!options.includeMovies)
            return [];
        const params = this.applyAuth(new URLSearchParams({
            with_genres: genreIds,
            include_adult: String(!options.excludeAdult),
            sort_by: 'popularity.desc',
            page: '1'
        }));
        const response = await fetch(`${this.baseUrl}/discover/movie?${params}`, {
            signal: AbortSignal.timeout(5000),
            headers: this.buildAuthHeaders()
        });
        if (!response.ok)
            return [];
        const data = await response.json();
        return this.filterTitles(data.results, options);
    }
    async discoverTV(genreIds, options) {
        if (!options.includeTV)
            return [];
        const params = this.applyAuth(new URLSearchParams({
            with_genres: genreIds,
            include_adult: String(!options.excludeAdult),
            sort_by: 'popularity.desc',
            page: '1'
        }));
        const response = await fetch(`${this.baseUrl}/discover/tv?${params}`, {
            signal: AbortSignal.timeout(5000),
            headers: this.buildAuthHeaders()
        });
        if (!response.ok)
            return [];
        const data = await response.json();
        return this.filterTitles(data.results, options);
    }
    async fetchDiscoverByYear(mediaType, year, includeAdult, page) {
        const params = this.applyAuth(new URLSearchParams({
            include_adult: includeAdult,
            sort_by: 'popularity.desc',
            page: String(Math.max(1, page)),
            ...(mediaType === 'movie'
                ? { primary_release_year: String(year) }
                : { first_air_date_year: String(year) })
        }));
        const response = await fetch(`${this.baseUrl}/discover/${mediaType}?${params}`, {
            signal: AbortSignal.timeout(5000),
            headers: this.buildAuthHeaders()
        });
        if (!response.ok) {
            return [];
        }
        const data = await response.json();
        const normalizedMediaType = mediaType === 'tv' ? 'tv' : 'movie';
        return (data.results || []).map(item => ({
            ...item,
            media_type: item.media_type || normalizedMediaType
        }));
    }
    filterTitles(titles, options = {}) {
        const includeMovies = options.includeMovies ?? true;
        const includeTV = options.includeTV ?? true;
        return titles.filter(title => {
            // Filter by type
            if (title.media_type === 'movie' && !includeMovies)
                return false;
            if (title.media_type === 'tv' && !includeTV)
                return false;
            // Filter by adult content
            if (options.excludeAdult && title.adult)
                return false;
            // Must have overview and poster
            if (!title.overview || !title.poster_path)
                return false;
            return true;
        });
    }
    normalizeTMDBResponse(data, mediaType) {
        const genreIds = Array.isArray(data.genre_ids)
            ? data.genre_ids
            : Array.isArray(data.genres)
                ? data.genres
                    .map((genre) => genre.id)
                    .filter((id) => typeof id === 'number')
                : [];
        const runtime = typeof data.runtime === 'number'
            ? data.runtime
            : Array.isArray(data.episode_run_time) && data.episode_run_time.length > 0
                ? Number(data.episode_run_time[0]) || undefined
                : undefined;
        return {
            id: data.id,
            title: data.title || data.name,
            name: data.name,
            poster_path: data.poster_path,
            overview: data.overview,
            release_date: data.release_date,
            first_air_date: data.first_air_date,
            media_type: mediaType,
            genre_ids: genreIds,
            runtime,
            vote_average: data.vote_average || 0,
            vote_count: data.vote_count || 0,
            adult: data.adult || false,
            original_language: data.original_language || 'en'
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
export const tmdbClient = new TMDBClient();
