/**
 * Streaming Availability Client
 * Uses Streaming Availability API via RapidAPI
 * Documentation: https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability
 * Free tier: 100 requests/day
 */

const STREAMING_API_HOST = 'streaming-availability.p.rapidapi.com'
const STREAMING_API_KEY = process.env.RAPIDAPI_KEY || ''

interface StreamingSource {
  platform: string
  type: 'subscription' | 'rent' | 'buy' | 'free' | 'addon'
  link?: string
}

interface StreamingAvailabilityResponse {
  streamingOptions?: {
    [country: string]: Array<{
      service: {
        id: string
        name: string
      }
      type: string
      link: string
    }>
  }
}

export class StreamingClient {
  private enabled: boolean

  constructor() {
    this.enabled = !!STREAMING_API_KEY
    if (!this.enabled) {
      console.log('⚠️  RAPIDAPI_KEY not set. Streaming availability disabled.')
      console.log('   Sign up at https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability')
    } else {
      console.log('✅ Streaming Availability API initialized')
    }
  }

  /**
   * Get streaming availability for a title by IMDb ID
   */
  async getAvailability(imdbId: string, country: string = 'us'): Promise<StreamingSource[]> {
    if (!this.enabled) {
      return []
    }

    try {
      console.log(`[Streaming] Looking up availability for ${imdbId} in ${country}`)

      const params = new URLSearchParams({
        country,
        output_language: 'en',
        series_granularity: 'show'
      })

      const response = await fetch(
        `https://${STREAMING_API_HOST}/shows/${imdbId}?${params}`,
        {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': STREAMING_API_KEY,
            'X-RapidAPI-Host': STREAMING_API_HOST
          },
          signal: AbortSignal.timeout(10000)
        }
      )

      if (!response.ok) {
        console.warn(`[Streaming] HTTP error: ${response.status}`)
        return []
      }

      const data = await response.json() as StreamingAvailabilityResponse

      const streamingOptions = data.streamingOptions?.[country]
      if (!streamingOptions || streamingOptions.length === 0) {
        console.log(`[Streaming] No availability data for ${country}`)
        return []
      }

      const sources = streamingOptions.map(option => ({
        platform: option.service.name || this.formatServiceName(option.service.id),
        type: this.mapStreamingType(option.type),
        link: option.link
      }))

      const dedupedSources = Array.from(
        new Map(sources.map(source => [`${source.platform}:${source.type}:${source.link || ''}`, source])).values()
      )

      if (dedupedSources.length > 0) {
        console.log(`[Streaming] Found ${dedupedSources.length} sources`)
      }

      return dedupedSources
    } catch (error) {
      console.error('[Streaming] Error fetching availability:', error)
      return []
    }
  }

  /**
   * Batch lookup streaming availability (with caching to reduce API calls)
   */
  async getAvailabilityBatch(
    imdbIds: string[],
    country: string = 'us'
  ): Promise<Map<string, StreamingSource[]>> {
    const results = new Map<string, StreamingSource[]>()

    // Process in parallel but with some delay to respect rate limits
    for (const imdbId of imdbIds) {
      const availability = await this.getAvailability(imdbId, country)
      results.set(imdbId, availability)

      // Small delay to avoid hitting rate limits (100 req/day = ~1 req every 15 min in practice)
      // But for bursts, we allow multiple calls
      if (imdbIds.length > 5) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return results
  }

  /**
   * Format service names for display
   */
  private formatServiceName(service: string): string {
    const serviceNames: Record<string, string> = {
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
    }

    return serviceNames[service.toLowerCase()] || service
  }

  /**
   * Map streaming type from API to our format
   */
  private mapStreamingType(type: string): 'subscription' | 'rent' | 'buy' | 'free' | 'addon' {
    const lowerType = type.toLowerCase()

    if (lowerType.includes('subscription')) return 'subscription'
    if (lowerType.includes('rent')) return 'rent'
    if (lowerType.includes('buy') || lowerType.includes('purchase')) return 'buy'
    if (lowerType.includes('free') || lowerType.includes('ads')) return 'free'
    if (lowerType.includes('addon')) return 'addon'

    return 'subscription' // default
  }
}

export const streamingClient = new StreamingClient()
