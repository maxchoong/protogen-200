/**
 * Streaming Availability Client
 * Uses Streaming Availability API via RapidAPI
 * Documentation: https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability
 * Free tier: 100 requests/day
 */
const STREAMING_API_HOST = 'streaming-availability.p.rapidapi.com';
const STREAMING_API_KEY = process.env.RAPIDAPI_KEY || '';
const AVAILABILITY_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const AVAILABILITY_RATE_LIMIT_TTL_MS = 2 * 60 * 1000;
const AVAILABILITY_ERROR_TTL_MS = 60 * 1000;
export class StreamingClient {
    constructor() {
        this.availabilityCache = new Map();
        this.lastBatchDiagnostics = {
            enabled: false,
            country: 'us',
            status: 'disabled'
        };
        this.enabled = !!STREAMING_API_KEY;
        this.lastBatchDiagnostics.enabled = this.enabled;
        if (!this.enabled) {
            console.log('⚠️  RAPIDAPI_KEY not set. Streaming availability disabled.');
            console.log('   Sign up at https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability');
        }
        else {
            console.log('✅ Streaming Availability API initialized');
        }
    }
    isEnabled() {
        return this.enabled;
    }
    /**
     * Get streaming availability for a title by IMDb ID
     */
    async getAvailability(imdbId, country = 'us') {
        const normalizedCountry = country.toLowerCase();
        if (!this.enabled) {
            this.lastBatchDiagnostics = {
                enabled: false,
                country: normalizedCountry,
                status: 'disabled'
            };
            return [];
        }
        const cacheKey = `${imdbId}:${normalizedCountry}`;
        const cached = this.getCachedAvailability(cacheKey);
        if (cached) {
            this.lastBatchDiagnostics = {
                enabled: true,
                country: normalizedCountry,
                status: cached.status
            };
            return cached.availability;
        }
        this.lastBatchDiagnostics = {
            enabled: true,
            country: normalizedCountry,
            status: 'ok'
        };
        try {
            console.log(`[Streaming] Looking up availability for ${imdbId} in ${normalizedCountry}`);
            const params = new URLSearchParams({
                country: normalizedCountry,
                output_language: 'en',
                series_granularity: 'show'
            });
            const response = await fetch(`https://${STREAMING_API_HOST}/shows/${imdbId}?${params}`, {
                method: 'GET',
                headers: {
                    'X-RapidAPI-Key': STREAMING_API_KEY,
                    'X-RapidAPI-Host': STREAMING_API_HOST
                },
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) {
                console.warn(`[Streaming] HTTP error: ${response.status}`);
                if (response.status === 429) {
                    this.lastBatchDiagnostics.status = 'rate_limited';
                    this.setAvailabilityCache(cacheKey, [], 'rate_limited', AVAILABILITY_RATE_LIMIT_TTL_MS);
                }
                else if (this.lastBatchDiagnostics.status !== 'rate_limited') {
                    this.lastBatchDiagnostics.status = 'error';
                    this.setAvailabilityCache(cacheKey, [], 'error', AVAILABILITY_ERROR_TTL_MS);
                }
                return [];
            }
            const data = await response.json();
            const streamingOptions = data.streamingOptions?.[normalizedCountry];
            if (!streamingOptions || streamingOptions.length === 0) {
                console.log(`[Streaming] No availability data for ${normalizedCountry}`);
                this.setAvailabilityCache(cacheKey, [], 'ok', AVAILABILITY_SUCCESS_TTL_MS);
                return [];
            }
            const sources = streamingOptions.map(option => ({
                platform: option.service.name || this.formatServiceName(option.service.id),
                type: this.mapStreamingType(option.type),
                link: option.link
            }));
            const dedupedSources = Array.from(new Map(sources.map(source => [`${source.platform}:${source.type}:${source.link || ''}`, source])).values());
            if (dedupedSources.length > 0) {
                console.log(`[Streaming] Found ${dedupedSources.length} sources`);
            }
            this.setAvailabilityCache(cacheKey, dedupedSources, 'ok', AVAILABILITY_SUCCESS_TTL_MS);
            return dedupedSources;
        }
        catch (error) {
            console.error('[Streaming] Error fetching availability:', error);
            if (this.lastBatchDiagnostics.status !== 'rate_limited') {
                this.lastBatchDiagnostics.status = 'error';
            }
            this.setAvailabilityCache(cacheKey, [], this.lastBatchDiagnostics.status, AVAILABILITY_ERROR_TTL_MS);
            return [];
        }
    }
    /**
     * Batch lookup streaming availability (with caching to reduce API calls)
     */
    async getAvailabilityBatch(imdbIds, country = 'us') {
        const results = new Map();
        this.lastBatchDiagnostics = {
            enabled: this.enabled,
            country,
            status: this.enabled ? 'ok' : 'disabled'
        };
        if (!this.enabled) {
            imdbIds.forEach(id => {
                results.set(id, []);
            });
            return results;
        }
        // Process in parallel but with some delay to respect rate limits
        for (const imdbId of imdbIds) {
            const availability = await this.getAvailability(imdbId, country);
            results.set(imdbId, availability);
            // Small delay to avoid hitting rate limits (100 req/day = ~1 req every 15 min in practice)
            // But for bursts, we allow multiple calls
            if (imdbIds.length > 5) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        return results;
    }
    getLastBatchDiagnostics() {
        return { ...this.lastBatchDiagnostics };
    }
    /**
     * Format service names for display
     */
    formatServiceName(service) {
        const serviceNames = {
            netflix: 'Netflix',
            prime: 'Prime Video',
            disney: 'Disney+',
            hbo: 'Max',
            hulu: 'Hulu',
            peacock: 'Peacock',
            paramount: 'Paramount+',
            apple: 'Apple TV+',
            starz: 'Starz',
            showtime: 'Showtime',
            mubi: 'Mubi',
            britbox: 'BritBox',
            crunchyroll: 'Crunchyroll'
        };
        return serviceNames[service.toLowerCase()] || service;
    }
    /**
     * Map streaming type from API to our format
     */
    mapStreamingType(type) {
        const lowerType = type.toLowerCase();
        if (lowerType.includes('subscription'))
            return 'subscription';
        if (lowerType.includes('rent'))
            return 'rent';
        if (lowerType.includes('buy') || lowerType.includes('purchase'))
            return 'buy';
        if (lowerType.includes('free') || lowerType.includes('ads'))
            return 'free';
        if (lowerType.includes('addon'))
            return 'addon';
        return 'subscription'; // default
    }
    getCachedAvailability(cacheKey) {
        const cached = this.availabilityCache.get(cacheKey);
        if (!cached) {
            return null;
        }
        if (Date.now() > cached.expiresAt) {
            this.availabilityCache.delete(cacheKey);
            return null;
        }
        return cached;
    }
    setAvailabilityCache(cacheKey, availability, status, ttlMs) {
        this.availabilityCache.set(cacheKey, {
            expiresAt: Date.now() + ttlMs,
            status,
            availability
        });
    }
}
export const streamingClient = new StreamingClient();
