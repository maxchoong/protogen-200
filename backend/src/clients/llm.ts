import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// GitHub Models configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const GITHUB_MODEL = process.env.GITHUB_MODEL || 'gpt-4o-mini'
const GITHUB_API_BASE = 'https://models.inference.ai.azure.com'
const LLM_TIMEOUT_MS = 15000
const MAX_RETRIES = 2

interface ParsedPreferences {
  genres: string[]
  mood: string[]
  contentType: 'movie' | 'tv' | 'both'
  maxRating: string
  keywords: string[]
  tone?: string
}

interface LLMCache {
  [key: string]: {
    value: any
    timestamp: number
    ttl: number
  }
}

/**
 * GitHub Models LLM Client for Film Advisor
 * Handles preference parsing, explanation generation, and synopsis creation
 * Uses free GitHub Models tier (150 requests/day)
 */
export class LLMClient {
  private client: OpenAI | null = null
  private cache: LLMCache = {}
  private enabled: boolean = false

  constructor() {
    if (GITHUB_TOKEN && GITHUB_TOKEN !== '') {
      try {
        this.client = new OpenAI({
          apiKey: GITHUB_TOKEN,
          baseURL: GITHUB_API_BASE,
          timeout: LLM_TIMEOUT_MS,
          maxRetries: MAX_RETRIES
        })
        this.enabled = true
        console.log(`✅ GitHub Models LLM Client initialized (${GITHUB_MODEL})`)
        console.log(`📊 Free tier: 150 requests/day`)
      } catch (error) {
        console.error('❌ Failed to initialize GitHub Models client:', error)
        this.enabled = false
      }
    } else {
      console.log('⚠️  GITHUB_TOKEN not set. LLM features will use fallbacks.')
      console.log('💡 Get a token at: https://github.com/settings/tokens?type=beta')
      this.enabled = false
    }
  }

  /**
   * Check if LLM is available
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Parse user's natural language description into structured preferences
   * Enhances rule-based parsing with LLM understanding
   */
  async parsePreferences(description: string): Promise<ParsedPreferences | null> {
    if (!this.enabled || !description.trim()) {
      return null
    }

    const cacheKey = `parse:${description.substring(0, 100)}`
    const cached = this.getCache(cacheKey)
    if (cached) {
      console.log('[LLM] Using cached preference parsing')
      return cached
    }

    try {
      console.log('[LLM] Parsing preferences with GPT-4o-mini...')

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a film recommendation assistant. Parse the user's request into structured preferences.
Return ONLY valid JSON with this exact structure:
{
  "genres": ["Action", "Comedy", etc.],
  "mood": ["happy", "intense", "thoughtful", etc.],
  "contentType": "movie" | "tv" | "both",
  "maxRating": "G" | "PG" | "PG-13" | "R",
  "keywords": ["word1", "word2"],
  "tone": "lighthearted" | "dark" | "realistic" | etc
}

Common genres: Action, Adventure, Comedy, Drama, Horror, Romance, Sci-Fi, Thriller, Fantasy, Mystery
Common moods: happy, sad, intense, relaxing, funny, thoughtful, scary, uplifting`
        },
        {
          role: 'user',
          content: description
        }
      ]

      const response = await this.client!.chat.completions.create({
        model: GITHUB_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        console.warn('[LLM] No content in response')
        return null
      }

      const parsed = JSON.parse(content) as ParsedPreferences
      
      // Validate and set defaults
      const result: ParsedPreferences = {
        genres: Array.isArray(parsed.genres) ? parsed.genres : [],
        mood: Array.isArray(parsed.mood) ? parsed.mood : [],
        contentType: ['movie', 'tv', 'both'].includes(parsed.contentType) ? parsed.contentType : 'both',
        maxRating: parsed.maxRating || 'R',
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        tone: parsed.tone
      }

      this.setCache(cacheKey, result, 3600000) // Cache 1 hour
      console.log(`[LLM] Parsed: ${result.genres.length} genres, ${result.keywords.length} keywords`)
      
      return result
    } catch (error: any) {
      console.error('[LLM] Preference parsing error:', error.message)
      return null
    }
  }

  /**
   * Generate "Why this?" explanation for a recommendation
   */
  async generateWhyThis(
    userDescription: string,
    title: string,
    genre: string,
    plot: string,
    rating?: number
  ): Promise<string | null> {
    if (!this.enabled) {
      return null
    }

    const cacheKey = `why:${title}:${userDescription.substring(0, 50)}`
    const cached = this.getCache(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a film recommendation assistant. Explain concisely (1-2 sentences) why this title matches the user's request.
Focus on: genre match, mood alignment, themes, similar qualities.
Be enthusiastic but concise. No spoilers.`
        },
        {
          role: 'user',
          content: `User wants: "${userDescription}"

Title: ${title}
Genre: ${genre}
Plot: ${plot}
${rating ? `Rating: ${rating}/10` : ''}

Why recommend this?`
        }
      ]

      const response = await this.client!.chat.completions.create({
        model: GITHUB_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 100
      })

      const explanation = response.choices[0]?.message?.content?.trim()
      if (explanation) {
        this.setCache(cacheKey, explanation, 7200000) // Cache 2 hours
        return explanation
      }

      return null
    } catch (error: any) {
      console.error('[LLM] Why-this generation error:', error.message)
      return null
    }
  }

  /**
   * Generate multiple "Why this?" explanations in a single batch call
   */
  async generateWhyThisBatch(
    userDescription: string,
    titles: Array<{ title: string; genre: string; plot: string; rating?: number }>
  ): Promise<Map<string, string>> {
    if (!this.enabled || titles.length === 0) {
      return new Map()
    }

    try {
      console.log(`[LLM] Generating ${titles.length} explanations in batch...`)

      const titlesText = titles
        .map((t, i) => `${i + 1}. "${t.title}" (${t.genre}) - ${t.plot.substring(0, 150)}`)
        .join('\n')

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a film recommendation assistant. For each title, write a brief 1-2 sentence explanation of why it matches the user's request.
Return valid JSON: {"1": "explanation", "2": "explanation", ...}
Be enthusiastic but concise. No spoilers.`
        },
        {
          role: 'user',
          content: `User wants: "${userDescription}"

Titles:
${titlesText}

Generate explanations as JSON object with numbered keys.`
        }
      ]

      const response = await this.client!.chat.completions.create({
        model: GITHUB_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) return new Map()

      const parsed = JSON.parse(content) as Record<string, string>
      const result = new Map<string, string>()

      titles.forEach((title, i) => {
        const key = (i + 1).toString()
        if (parsed[key]) {
          result.set(title.title, parsed[key])
          // Cache individual explanations
          const cacheKey = `why:${title.title}:${userDescription.substring(0, 50)}`
          this.setCache(cacheKey, parsed[key], 7200000)
        }
      })

      return result
    } catch (error: any) {
      console.error('[LLM] Batch explanation error:', error.message)
      return new Map()
    }
  }

  /**
   * Generate a spoiler-free synopsis from the catalog synopsis
   */
  async generateSpoilerFreeSynopsis(
    title: string,
    originalPlot: string
  ): Promise<string | null> {
    if (!this.enabled || !originalPlot) {
      return null
    }

    const cacheKey = `synopsis:${title}`
    const cached = this.getCache(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a film synopsis writer. Rewrite the given plot summary to be engaging but completely spoiler-free.
- Keep it 2-3 sentences
- Focus on premise and tone, not plot twists or outcomes
- Be enticing but vague about specifics
- Remove character names unless they're the protagonist`
        },
        {
          role: 'user',
          content: `Title: ${title}\n\nOriginal plot:\n${originalPlot}\n\nSpoiler-free synopsis:`
        }
      ]

      const response = await this.client!.chat.completions.create({
        model: GITHUB_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 150
      })

      const synopsis = response.choices[0]?.message?.content?.trim()
      if (synopsis) {
        this.setCache(cacheKey, synopsis, 86400000) // Cache 24 hours
        return synopsis
      }

      return null
    } catch (error: any) {
      console.error('[LLM] Synopsis generation error:', error.message)
      return null
    }
  }

  /**
   * Get cached value if still valid
   */
  private getCache(key: string): any | null {
    const cached = this.cache[key]
    if (!cached) return null

    const now = Date.now()
    if (now - cached.timestamp > cached.ttl) {
      delete this.cache[key]
      return null
    }

    return cached.value
  }

  /**
   * Set cached value with TTL
   */
  private setCache(key: string, value: any, ttl: number): void {
    this.cache[key] = {
      value,
      timestamp: Date.now(),
      ttl
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache = {}
    console.log('[LLM] Cache cleared')
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: Object.keys(this.cache).length,
      keys: Object.keys(this.cache)
    }
  }
}

export const llmClient = new LLMClient()
