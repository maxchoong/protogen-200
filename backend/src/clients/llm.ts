import OpenAI from 'openai'
import { AsyncLocalStorage } from 'node:async_hooks'
import { throwIfTurnStopped, turnSignal } from '../engine/turnDeadline.js'
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions'
import type { CreatorCredit, CreatorPreference, CreatorRole, LLMPreferenceHints } from '../engine/preferenceParser.js'

const LLM_TIMEOUT_MS = 15000
export const RECOMMENDATION_LLM_WINDOW_MS = 4000
const RATE_LIMIT_COOLDOWN_MS = 60_000

export interface LLMCallFailure {
  stage: string
  reason: 'deadline' | 'rate_limit' | 'cooldown' | 'timeout' | 'provider_error'
  status?: number
  elapsedMs: number
}

export interface LLMRequestDiagnostics {
  failures?: LLMCallFailure[]
  budgetExhausted?: boolean
}

interface LLMRequestBudget {
  deadline: number
  failures: LLMCallFailure[]
  exhausted: boolean
}

interface LLMCache {
  [key: string]: {
    value: any
    timestamp: number
    ttl: number
  }
}

/**
 * OpenAI-compatible LLM Client for Film Advisor
 * Handles preference parsing, explanation generation, and synopsis creation
 */
const STOCK_PHRASE = /popcorn|happy (?:watching|viewing)|sit back|enjoy (?:exploring|watching|browsing|these|the)|verified filter/i

/** Drop clichéd sentences the model still produces; null-equivalent if nothing remains. */
export function stripStockPhrases(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text]
  return sentences.filter(sentence => !STOCK_PHRASE.test(sentence)).join('').trim()
}

/** Shared guidance for referenceSuggestions: catalogue search seeds, validated downstream. */
const REFERENCE_SEED_GUIDANCE = `When a request names a reference and asks for a tonal change, suggest up to five real, specific titles that retain conceptual or narrative appeal while fitting the new tone. Cross genres when the premise supports it (for example, a high-concept memory puzzle can point to thoughtful science fiction). Do not include the reference itself. These titles are search seeds that will be checked against the catalog, not guaranteed matches.
For an awards, prestige, or Oscar-focused request without a named reference (e.g. "Oscar winning movies", "academy award winners"), put up to five diverse, real, celebrated award-winning title seeds in referenceSuggestions across eras and genres (e.g., Parasite, Everything Everywhere All At Once, No Country for Old Men, The Silence of the Lambs, Moonlight).
For a broad novelty or indie-discovery request without a named reference, put up to five diverse, real title search seeds in referenceSuggestions. Cover unusual premise or genre shift, atmosphere, quiet character/emotional impact, visual or formal invention, and offbeat satire; include titles from different genres rather than clustering in sci-fi/thriller. For calibration, this range can include The One I Love or Coherence (odd premise), The Vast of Night (atmosphere), The Station Agent or The Rider (character impact), The Fall or A Ghost Story (visual/formal), and Sorry to Bother You (satire/genre shift). These are examples, not a fixed whitelist. Favor distinctive voice and credible quality with modest exposure; do not equate obscurity with quality or limit suggestions to plot twists. The catalog will validate each title.`

export class LLMClient {
  private client: OpenAI | null = null
  private rateLimitedUntil = 0
  private cache: LLMCache = {}
  private enabled: boolean = false
  private model: string
  private requestBudget = new AsyncLocalStorage<LLMRequestBudget>()

  constructor() {
    const apiKey = process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || ''
    const baseURL = process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1'
    this.model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini'

    if (apiKey) {
      try {
        const endpoint = new URL(baseURL)
        if (['models.inference.ai.azure.com', 'models.github.ai'].includes(endpoint.hostname)) {
          console.warn('[LLM] GitHub Models was retired on July 30, 2026. Configure a supported provider; using fallbacks.')
          return
        }
        this.client = new OpenAI({
          apiKey,
          baseURL,
          timeout: LLM_TIMEOUT_MS,
          maxRetries: 0
        })
        this.enabled = true
        console.log(`[LLM] Client configured (${this.model}); connectivity is verified on request.`)
      } catch {
        console.error('[LLM] Failed to initialize client; check LLM_BASE_URL and provider configuration.')
        this.enabled = false
      }
    } else {
      if (process.env.GITHUB_TOKEN) {
        console.warn('[LLM] GitHub Models was retired on July 30, 2026. GITHUB_TOKEN cannot enable LLM features.')
      }
      console.log('[LLM] Set OPENAI_API_KEY or LLM_API_KEY for a supported provider. Using fallbacks.')
      this.enabled = false
    }
  }

  withRequestBudget<T>(callback: () => T): T {
    return this.requestBudget.run({
      deadline: performance.now() + RECOMMENDATION_LLM_WINDOW_MS, failures: [], exhausted: false
    }, callback)
  }

  getRequestDiagnostics(): LLMRequestDiagnostics {
    const budget = this.requestBudget.getStore()
    return {
      ...(budget?.failures.length ? { failures: budget.failures.map(failure => ({ ...failure })) } : {}),
      ...(budget?.exhausted ? { budgetExhausted: true } : {})
    }
  }

  private async complete(
    stage: string,
    body: ChatCompletionCreateParamsNonStreaming,
    options?: { timeout?: number }
  ): Promise<ChatCompletion> {
    throwIfTurnStopped()
    const budget = this.requestBudget.getStore()
    const started = performance.now()
    const recordFailure = (reason: LLMCallFailure['reason'], status?: number) => {
      budget?.failures.push({
        stage, reason, ...(status !== undefined ? { status } : {}),
        elapsedMs: Math.round(performance.now() - started)
      })
      if (budget && reason === 'deadline') budget.exhausted = true
      console.warn(`[LLM] ${stage}: ${reason}${status !== undefined ? ` (HTTP ${status})` : ''}`)
    }
    if (Date.now() < this.rateLimitedUntil) {
      recordFailure('cooldown')
      throw new Error('rate limited; skipping LLM call during cooldown')
    }
    const remaining = budget ? budget.deadline - started : Infinity
    if (remaining < 1) {
      recordFailure('deadline')
      throw new Error('request LLM window exhausted; skipping provider call')
    }
    const stageTimeout = options?.timeout ?? LLM_TIMEOUT_MS
    const limitedByRequest = remaining <= stageTimeout
    const timeout = Math.max(1, Math.floor(Math.min(stageTimeout, remaining)))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await this.client!.chat.completions.create(body, {
        timeout, maxRetries: 0, signal: turnSignal(controller.signal)
      })
      throwIfTurnStopped()
      // Do not accept late provider output, even if a transport ignored abort.
      if (controller.signal.aborted || performance.now() >= started + timeout) {
        throw new Error('completion arrived after its deadline')
      }
      return response
    } catch (error: unknown) {
      throwIfTurnStopped()
      const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status : undefined
      if (status === 429) {
        this.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
        console.warn(`[LLM] Rate limited; using fallbacks for ${RATE_LIMIT_COOLDOWN_MS / 1000}s`)
      }
      const deadlineReached = controller.signal.aborted || performance.now() >= started + timeout
      const timedOut = deadlineReached ||
        (error instanceof Error && error.name === 'APIConnectionTimeoutError')
      recordFailure(status === 429 ? 'rate_limit'
        : ((limitedByRequest && deadlineReached) || (budget && performance.now() >= budget.deadline)) ? 'deadline'
          : timedOut ? 'timeout' : 'provider_error', status)
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /**
  * Check if a supported LLM provider is configured (not a connectivity probe)
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Parse user's natural language description into structured preferences
   * Enhances rule-based parsing with LLM understanding
   */
  async parsePreferences(description: string): Promise<LLMPreferenceHints | null> {
    if (!this.enabled || !description.trim()) {
      return null
    }

    const cacheKey = `parse:${description.trim().toLowerCase()}`
    const cached = this.getCache(cacheKey)
    if (cached) {
      console.log('[LLM] Using cached preference parsing')
      return cached
    }

    try {
      console.log(`[LLM] Parsing preferences with ${this.model}...`)

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a film recommendation assistant. Extract only preferences clearly expressed by the user. Do not invent actors, reference titles, genres, exclusions, or constraints. The separate referenceSuggestions field may contain catalog-search ideas when a referenced title and requested change in tone make that useful.
Return ONLY valid JSON with this exact structure:
{
  "genres": [],
  "mood": [],
  "contentType": "both",
  "maxRating": "R",
  "keywords": [],
  "referenceTitles": [],
  "referenceSuggestions": [],
  "actors": [],
  "creators": [],
  "excludedGenres": [],
  "yearRange": {"min": null, "max": null}
}

Use canonical genres: Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Music, Mystery, Romance, Sci-Fi, Thriller, War, Western.
Use canonical moods: Happy, Sad, Intense, Relaxing, Funny, Thoughtful, Dark, Romantic, Suspenseful, Surprising.
Put title similarity anchors in referenceTitles, named performers in actors, and descriptive concepts useful for catalog search in keywords.
Put named directors, writers, producers, and creators in creators as {"name":"Person Name","role":"director|writer|producer|creator","allowOtherRoles":false}. Do not also put them in actors unless the user explicitly requests their acting. For an unqualified request such as "films by Person Name", use role "director" and allowOtherRoles true. Explicit "directed by", "written by", "produced by", or "created by" requests use their exact role and allowOtherRoles false. Never invent a person not named in the active conversation.
${REFERENCE_SEED_GUIDANCE}
Use null for unknown year bounds. Preserve all relevant details from the full conversation.`
        },
        {
          role: 'user',
          content: description
        }
      ]

      const response = await this.complete('preference parsing', {
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 450,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        console.warn('[LLM] No content in response')
        return null
      }

      const parsed = JSON.parse(content) as Record<string, unknown>
      
      // Validate and set defaults
      const toStringArray = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
      const yearRange = parsed.yearRange && typeof parsed.yearRange === 'object'
        ? parsed.yearRange as Record<string, unknown>
        : undefined
      const creators: CreatorPreference[] = Array.isArray(parsed.creators)
        ? parsed.creators.flatMap((entry: unknown) => {
            if (!entry || typeof entry !== 'object') return []
            const creator = entry as Record<string, unknown>
            if (typeof creator.name !== 'string' || !creator.name.trim() ||
              !['director', 'writer', 'producer', 'creator'].includes(String(creator.role))) return []
            return [{
              name: creator.name.trim(), role: creator.role as CreatorRole,
              allowOtherRoles: creator.role === 'director' && creator.allowOtherRoles === true
            }]
          })
        : []
      const result: LLMPreferenceHints = {
        genres: toStringArray(parsed.genres),
        mood: toStringArray(parsed.mood),
        contentType: ['movie', 'tv', 'both'].includes(String(parsed.contentType))
          ? parsed.contentType as 'movie' | 'tv' | 'both'
          : 'both',
        maxRating: ['G', 'PG', 'PG-13', 'R'].includes(String(parsed.maxRating))
          ? String(parsed.maxRating)
          : 'R',
        keywords: toStringArray(parsed.keywords),
        referenceTitles: toStringArray(parsed.referenceTitles),
        referenceSuggestions: toStringArray(parsed.referenceSuggestions).slice(0, 5),
        actors: toStringArray(parsed.actors),
        creators,
        excludedGenres: toStringArray(parsed.excludedGenres),
        yearRange: yearRange
          ? {
              min: typeof yearRange.min === 'number' && Number.isFinite(yearRange.min) ? yearRange.min : undefined,
              max: typeof yearRange.max === 'number' && Number.isFinite(yearRange.max) ? yearRange.max : undefined
            }
          : undefined
      }

      this.setCache(cacheKey, result, 3600000) // Cache 1 hour
      console.log(`[LLM] Parsed: ${result.genres?.length || 0} genres, ${result.keywords?.length || 0} keywords`)
      
      return result
    } catch (error: any) {
      throwIfTurnStopped()
      console.error('[LLM] Preference parsing error:', error.message)
      return null
    }
  }

  /**
   * Understand the latest turn as a full structured request, given the previous request.
   * Returns raw model JSON; callers must validate it with validateSpecTurn.
   */
  async parseRequestSpec(input: {
    latestTurn: string
    earlierTurns?: string[]
    previousSpec?: unknown
    today?: Date
  }): Promise<Record<string, unknown> | null> {
    if (!this.enabled || !input.latestTurn.trim()) return null

    const today = (input.today ?? new Date()).toISOString().slice(0, 10)
    const earlierTurns = (input.earlierTurns ?? []).filter(turn => turn.trim()).slice(-6)
    const previousSpec = input.previousSpec ? JSON.stringify(input.previousSpec) : 'none'
    const cacheKey = `spec:${today}:${previousSpec}:${earlierTurns.join('\n').toLowerCase()}:${input.latestTurn.trim().toLowerCase()}`
    const cached = this.getCache(cacheKey)
    if (cached) return cached

    const system = `You turn film and TV requests into a structured search request. Today is ${today}.
You receive the previous request (or none), earlier user messages, and the latest user message. Return the FULL updated request after the latest message, plus the kind of change.

Return ONLY JSON:
{
  "operation": "new|refine|add|remove|replace|pivot",
  "spec": {
    "countries": [], "languages": [],
    "years": {"min": null, "max": null}, "releasedWithinDays": null, "dateRange": {"from": null, "to": null},
    "format": "both", "excludeGenres": [], "maxCertification": null,
    "genres": [], "tones": [], "themes": [],
    "references": [], "referenceSuggestions": [],
    "actors": [], "creators": [], "popularity": null
  }
}

Operations:
- new: first message, or no previous request.
- refine: adds or tightens a preference while keeping the rest ("only movies", "something darker", "after 2015").
- add: widens a list while keeping the rest ("what about Indonesian films too?", "include comedies as well").
- remove: drops a constraint ("any country is fine", "not just anime").
- replace: swaps one dimension, keeping the others ("make it Korean instead", "TV shows instead").
- pivot: an unrelated new request; start from an empty request ("actually, show me Pixar films").
Keep every previous field the latest message does not change. A short answer to an assistant question (e.g. "Gritty crime thrillers and mysteries") is a refine of the previous request, never a pivot.
An additional genre or tone is not a reset. Keep previous genres alongside the new ones unless the user explicitly replaces or rejects them. A change of one dimension (country, format, genre or tone) must not clear other dimensions.
For example, previous Indonesian horror movies + "Intense, fast-paced thrillers" means refine with countries ["ID"], format "movie", genres ["Horror","Thriller"], tones ["Intense"]. Previous horror movies + "psychological thrillers" keeps Horror and adds Thriller. Previous Japanese horror movies + "make it Korean instead" replaces only countries with ["KR"], retaining Horror and movie format.
Use pivot only for a clear unrelated request or explicit restart, not a short genre or mood answer.

Fields:
- countries: ISO 3166-1 alpha-2 production countries. Nationality words mean countries ("Malaysian films" -> ["MY"], "Korean dramas" -> ["KR"]) unless the user says "-language" or "in <language>". Bollywood -> ["IN"]; Nollywood -> ["NG"]; Nordic/Scandinavian -> ["SE","DK","NO","IS","FI"]; anime -> ["JP"].
- languages: ISO 639-1 original languages, only for explicit language requests ("Spanish-language", "in Portuguese", "subtitled French").
- years: inclusive release-year bounds for decades or eras ("90s" -> 1990-1999, "more recent" -> min ${Number(today.slice(0, 4)) - 8}, "classic" -> max 1980).
- releasedWithinDays: relative recency ("this week" 7, "this month" 31, "new"/"latest"/"recent releases" 365). Do not also invent year bounds for these requests.
- dateRange: absolute ISO dates for specific months or seasons ("released in March 2026").
- format: "movie" for films/movies (including "German films about World War II"), "tv" for series/shows, otherwise keep the previous format or use "both" when no previous format exists.
- genres: only from Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Indie, Music, Mystery, Romance, Sci-Fi, Thriller, War, Western. Nordic noir -> Crime, Mystery; anime -> Animation; rom-com -> Romance, Comedy; horror-comedy -> Horror, Comedy; Bollywood implies nothing about genre.
- excludeGenres: genres the user rejects ("no horror", "not animated").
- maxCertification: G, PG, PG-13 or R, only for explicit age limits or "for kids"/"family-friendly" (PG).
- tones: only from Happy, Sad, Intense, Relaxing, Funny, Thoughtful, Dark, Romantic, Suspenseful, Surprising ("gritty" -> Dark, Intense; "cosy" -> Relaxing, Happy; "make me cry" -> Sad; "heartwarming" -> Happy).
- themes: short concrete subject keywords useful for catalogue search ("heist", "time loop", "world war ii", "small town").
- references: titles the user wants something similar to.
- actors: performers named by the user. creators: {"name","role":"director|writer|producer|creator","allowOtherRoles":bool}; "films by X" -> director with allowOtherRoles true; explicit "directed by" -> allowOtherRoles false. Never invent people.
- popularity: "mainstream" for popular/blockbuster/well-known, "niche" for hidden gems/underrated/obscure.
- referenceSuggestions: ${REFERENCE_SEED_GUIDANCE}
Only include what the user asked for. Use null or [] when unknown.`

    const user = [
      `Previous request: ${previousSpec}`,
      earlierTurns.length ? `Earlier user messages:\n${earlierTurns.map(turn => `- ${turn}`).join('\n')}` : 'Earlier user messages: none',
      `Latest user message: ${input.latestTurn.trim()}`
    ].join('\n\n')

    try {
      const response = await this.complete('request understanding', {
        model: this.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.1,
        max_tokens: 700,
        response_format: { type: 'json_object' }
      }, { timeout: 8000 })

      const content = response.choices[0]?.message?.content
      if (!content) return null
      const parsed = JSON.parse(content)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      this.setCache(cacheKey, parsed, 3600000)
      return parsed as Record<string, unknown>
    } catch (error: any) {
      throwIfTurnStopped()
      console.error('[LLM] Request understanding error:', error.message)
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
          content: `You are a film recommendation assistant. Write a brief "why this" explanation in the voice of a knowledgeable friend.
Rules:
- Use British English spelling and phrasing.
- Prefer one sentence; use two only if needed.
- Keep it natural, plain, and specific to the user's request.
- Base claims only on supplied genre, mood, theme, or rating cues.
- No spoilers.`
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

      const response = await this.complete('recommendation explanations', {
        model: this.model,
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
      throwIfTurnStopped()
      console.error('[LLM] Why-this generation error:', error.message)
      return null
    }
  }

  /**
   * Generate multiple "Why this?" explanations in a single batch call
   * Enhanced with context about matches, reference titles, and excluded preferences
   */
  async generateWhyThisBatch(
    userDescription: string,
    titles: Array<{
      title: string
      genre: string
      plot: string
      rating?: number
      // Phase 4 enhancements
      genreScore?: number
      moodScore?: number
      talentScore?: number
      compositeScore?: number
      talentMatchScore?: number
      referenceTitles?: string[]
      excludedGenres?: string[]
      creatorCredits?: CreatorCredit[]
    }>
  ): Promise<Map<string, string>> {
    if (!this.enabled || titles.length === 0) {
      return new Map()
    }

    try {
      console.log(`[LLM] Generating ${titles.length} explanations in batch...`)

      const titlesText = titles
        .map((t, i) => {
          let desc = `${i + 1}. "${t.title}" (${t.genre})`
          if (t.creatorCredits?.length) {
            desc += ` [Verified creator credits: ${t.creatorCredits.map(credit => `${credit.name}: ${credit.roles.join(', ')}`).join('; ')}]`
          }
          if (t.talentMatchScore && t.talentMatchScore > 0.5) {
            desc += ` [Talent Match: ${(t.talentMatchScore * 100).toFixed(0)}%]`
          }
          if (typeof t.genreScore === 'number') {
            desc += ` [Genre: ${t.genreScore.toFixed(2)}]`
          }
          if (typeof t.moodScore === 'number') {
            desc += ` [Mood: ${t.moodScore.toFixed(2)}]`
          }
          if (typeof t.talentScore === 'number') {
            desc += ` [Talent: ${t.talentScore.toFixed(2)}]`
          }
          if (typeof t.compositeScore === 'number') {
            desc += ` [Composite: ${t.compositeScore.toFixed(2)}]`
          }
          desc += ` - ${t.plot.substring(0, 100)}`
          return desc
        })
        .join('\n')

      const referenceContext = titles[0]?.referenceTitles?.length
        ? `Reference titles mentioned: ${titles[0].referenceTitles.join(', ')}`
        : ''

      const excludedContext = titles[0]?.excludedGenres?.length
        ? `Avoid genres: ${titles[0].excludedGenres.join(', ')}`
        : ''

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a film recommendation assistant. For each title, write a brief explanation in the voice of a knowledgeable friend only if the provided match signals support the recommendation.
Rules:
- Use British English spelling and phrasing.
- Prefer one sentence; use two only when needed.
- Keep the tone natural, specific, and conversational (not list-like).
- Do not claim similarity unless there is evidence in the supplied scores or plot cues.
- If a title appears weakly matched (for example, all scores low), return null for that item.
- Do not mention cast/director similarity unless talent score is clearly meaningful.
- Named creator-role claims require the supplied verified creator credits; a producing or writing credit is not a directing credit.
- For excluded genres, only mention avoidance when applicable.
- No spoilers.
Return valid JSON: {"1": "explanation or null", "2": "explanation or null", ...}`
        },
        {
          role: 'user',
          content: `User wants: "${userDescription}"
${referenceContext}
${excludedContext}

Titles with matching signals:
${titlesText}

Generate explanations as JSON object with numbered keys. Reference the matching signals in your explanations.`
        }
      ]

      const response = await this.complete('recommendation explanations', {
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) return new Map()

      const parsed = JSON.parse(content) as Record<string, unknown>
      const result = new Map<string, string>()

      titles.forEach((title, i) => {
        const key = (i + 1).toString()
        const candidate = parsed[key]
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          result.set(title.title, candidate)
          // Cache individual explanations
          const cacheKey = `why:${title.title}:${userDescription.substring(0, 50)}`
          this.setCache(cacheKey, candidate, 7200000)
        }
      })

      return result
    } catch (error: any) {
      throwIfTurnStopped()
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

      const response = await this.complete('synopsis generation', {
        model: this.model,
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
      throwIfTurnStopped()
      console.error('[LLM] Synopsis generation error:', error.message)
      return null
    }
  }

  /**
   * Suggest likely title seeds for actor-focused talent queries.
   * Used as a recovery path when catalog search cannot map actor names directly to filmography.
   */
  async suggestActorTitleSeeds(
    actors: string[],
    description: string,
    limit: number = 8
  ): Promise<string[]> {
    if (!this.enabled || actors.length === 0) {
      return []
    }

    const normalizedActors = actors
      .map(actor => actor.trim())
      .filter(actor => actor.length > 0)

    if (normalizedActors.length === 0) {
      return []
    }

    const cacheKey = `actor-seeds:${normalizedActors.join('|')}:${description.substring(0, 80)}`
    const cached = this.getCache(cacheKey)
    if (cached && Array.isArray(cached)) {
      return cached.slice(0, limit)
    }

    try {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You recommend movies and TV titles. Return only JSON with this shape:
{
  "titles": ["Title 1", "Title 2", "..."]
}
Rules:
- Include only real titles that likely feature the requested actor(s).
- Prioritize titles that fit the user's tone/genre request.
- No commentary, no markdown, no extra keys.`
        },
        {
          role: 'user',
          content: `Actors: ${normalizedActors.join(', ')}\nUser request: ${description}\nReturn up to ${limit} titles.`
        }
      ]

      const response = await this.complete('actor title recovery', {
        model: this.model,
        messages,
        temperature: 0.2,
        max_tokens: 220,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        return []
      }

      const parsed = JSON.parse(content) as { titles?: unknown }
      const titles = Array.isArray(parsed.titles)
        ? parsed.titles.filter((value): value is string => typeof value === 'string').map(t => t.trim()).filter(Boolean)
        : []

      const deduped = Array.from(new Set(titles)).slice(0, limit)
      this.setCache(cacheKey, deduped, 6 * 60 * 60 * 1000)
      return deduped
    } catch (error: any) {
      throwIfTurnStopped()
      console.error('[LLM] Actor title seed generation error:', error.message)
      return []
    }
  }

  /**
   * Generates a warm, conversational clarification question and options
   * when user intent has multiple interpretations or needs steering.
   */
  async generateConversationalClarification(
    userQuery: string,
    fallbackQuestions: Array<{
      id: string
      question: string
      type: 'select' | 'text' | 'boolean'
      options?: string[]
    }>
  ): Promise<{
    context: string
    questions: Array<{
      id: string
      question: string
      type: 'select' | 'text' | 'boolean'
      options?: string[]
    }>
  } | null> {
    if (!this.enabled || !fallbackQuestions.length) {
      return null
    }

    const cacheKey = `clarification:${userQuery.substring(0, 80)}`
    const cached = this.getCache(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a warm, knowledgeable film and TV advisor. The user's query is broad or has several good directions, and we need to clarify what they want.
Return JSON with this exact structure:
{
  "context": "A warm, natural 1-sentence opening acknowledging what they asked for and inviting guidance.",
  "question": "A friendly, conversational question asking which direction or vibe they prefer.",
  "options": ["Option 1", "Option 2", "Option 3"]
}

Guidelines:
- Keep the tone natural, inviting, and conversational (like a friendly film buff at a local video store or festival).
- Never use robotic system phrasing like "Go mood-first", "Go title-similarity first", or "Select priority axis".
- Frame options as natural choices matching the user's specific context (e.g. "Recent festival favorites", "Thrilling crowd-pleasers", "Classic deep-cuts").
- Provide 2 to 4 concise options.
- No markdown formatting, return pure JSON.`
        },
        {
          role: 'user',
          content: `User query: "${userQuery}"\nBaseline questions/options: ${JSON.stringify(fallbackQuestions)}`
        }
      ]

      const response = await this.complete('clarification wording', {
        model: this.model,
        messages,
        temperature: 0.5,
        max_tokens: 250,
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0]?.message?.content
      if (!content) return null

      const parsed = JSON.parse(content) as Record<string, unknown>
      const llmContext = typeof parsed.context === 'string' && parsed.context.trim()
        ? parsed.context.trim()
        : undefined
      const llmQuestion = typeof parsed.question === 'string' && parsed.question.trim()
        ? parsed.question.trim()
        : undefined
      const llmOptions = Array.isArray(parsed.options)
        ? parsed.options.filter((opt): opt is string => typeof opt === 'string' && opt.trim().length > 0)
        : undefined

      if (!llmContext && !llmQuestion && !llmOptions?.length) {
        return null
      }

      const context = llmContext ||
        'I can steer this in a few different directions. What kind of watch are you in the mood for?'
      const question = llmQuestion || fallbackQuestions[0].question
      const options = llmOptions && llmOptions.length > 0 ? llmOptions : fallbackQuestions[0].options

      const result = {
        context,
        questions: [
          {
            id: fallbackQuestions[0].id,
            question,
            type: fallbackQuestions[0].type,
            options
          }
        ]
      }

      this.setCache(cacheKey, result, 3600000)
      return result
    } catch (err) {
      throwIfTurnStopped()
      console.warn('[LLM] generateConversationalClarification failed, using fallback:', err)
      return null
    }
  }

  /**
   * One short conversational sentence introducing results (small token budget).
   */
  async generateResultsIntro(
    latestMessage: string,
    scope: string,
    titles: string[],
    change?: string
  ): Promise<string | null> {
    if (!this.enabled || titles.length === 0) {
      return null
    }

    const cacheKey = `intro:${latestMessage.substring(0, 80)}:${change || ''}:${titles.slice(0, 3).join('|')}`
    const cached = this.getCache(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await this.complete('results introduction', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: [
              'You are a friendly film advisor replying in a chat. Write 1-2 short sentences (max 35 words) introducing the results. British English.',
              'Respond to the latest message. If a change is given, open by confirming it in plain words.',
              'Say naturally where the titles come from, name at most two titles from the list, and add no facts beyond those supplied.',
              'Never say "filter", "verified" or "scope". No stock sign-offs or filler such as "grab some popcorn", "enjoy", "sit back", "happy watching", "brilliant" or "fantastic". No markdown or lists.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              `Latest message: "${latestMessage}"`,
              `Results cover: ${scope}`,
              change ? `Change this turn: ${change}` : '',
              `Titles: ${titles.slice(0, 5).join('; ')}`
            ].filter(Boolean).join('\n')
          }
        ],
        temperature: 0.6,
        max_tokens: 80
      })

      const text = stripStockPhrases(response.choices[0]?.message?.content?.trim() || '')
      if (!text) return null

      this.setCache(cacheKey, text, 3600000)
      return text
    } catch (err) {
      throwIfTurnStopped()
      console.warn('[LLM] generateResultsIntro failed, using fallback:', err)
      return null
    }
  }

  /**
   * Get cached value if still valid
   */
  private getCache(key: string): any | null {
    throwIfTurnStopped()
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
    throwIfTurnStopped()
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
