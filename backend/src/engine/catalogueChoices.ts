import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { recommendationEngine, type Recommendation } from './recommendationEngine.js'
import type { RecommendationRequest } from './preferenceParser.js'
import { diffSpecs, SPEC_GENRES, validateSpec, type RequestSpec, type SpecTurn } from './requestSpec.js'
import { throwIfTurnStopped } from './turnDeadline.js'

export interface CatalogueQuestion {
  id: string
  question: string
  type: 'select' | 'text'
  options?: string[]
  optionTokens?: Record<string, string>
}

export interface CatalogueClarification {
  context: string
  questions: CatalogueQuestion[]
}

const MIN_MATCHES = 3
const MAX_GENRE_CHECKS = 5
const PREVIEW_TTL_MS = 60_000
const TOKEN_TTL_MS = 60 * 60_000
const MAX_CACHE_ENTRIES = 50
export const CATALOGUE_CHOICE_WINDOW_MS = 1500
const signingKey = randomBytes(32)
const previewCache = new Map<string, { expires: number; titles: Recommendation[] }>()
const sign = (body: string) => createHmac('sha256', signingKey).update(body).digest()

function previewWindow(): () => boolean {
  const deadline = performance.now() + CATALOGUE_CHOICE_WINDOW_MS
  return () => {
    if (performance.now() < deadline) return true
    console.warn('[Catalogue] Choice-check scheduling window exhausted; skipping remaining unchecked paths')
    return false
  }
}

function scope(request: RecommendationRequest, selecting = false): string {
  const turns = request.clarificationContext?.userTurns || [request.description]
  return sign(JSON.stringify({
    description: request.description, region: (request.region || 'GB').trim().toUpperCase(),
    preferences: {
      genres: request.preferences?.genres, mood: request.preferences?.mood,
      contentType: request.preferences?.contentType, maxRating: request.preferences?.maxRating
    },
    turns: selecting ? turns.slice(0, -1) : turns
  })).toString('base64url')
}

function choiceToken(request: RecommendationRequest, base: RequestSpec, spec: RequestSpec, operation: SpecTurn['operation'], label: string): string {
  const body = Buffer.from(JSON.stringify({ base, spec, operation, label, scope: scope(request), expires: Date.now() + TOKEN_TTL_MS })).toString('base64url')
  return `${body}.${sign(body).toString('base64url')}`
}

/** Tokens encode an offered change, not arbitrary client instructions or a new LLM guess. */
export function resolveCatalogueChoice(token: unknown, previous: RequestSpec | undefined, label: string, request: RecommendationRequest): SpecTurn | undefined {
  if (typeof token !== 'string' || token.length > 24_000 || !previous) {
    console.warn('[Catalogue] Rejected selection without a valid token or saved request')
    return undefined
  }
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra) {
    console.warn('[Catalogue] Rejected malformed selection token')
    return undefined
  }
  const provided = Buffer.from(signature, 'base64url')
  const expected = sign(body)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    console.warn('[Catalogue] Rejected invalid or restarted-process selection token')
    return undefined
  }
  // Only bodies issued by this process reach JSON parsing.
  const choice: { base: RequestSpec; spec: RequestSpec; operation: SpecTurn['operation']; label: string; scope: string; expires: number } =
    JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  const turns = request.clarificationContext?.userTurns
  if (choice.expires <= Date.now() || choice.label !== label || choice.scope !== scope(request, true) ||
      !turns || turns[turns.length - 1] !== label || diffSpecs(choice.base, previous).length > 0) {
    console.warn('[Catalogue] Rejected expired or stale-scope selection')
    return undefined
  }
  return { operation: choice.operation, spec: validateSpec(choice.spec) }
}

async function preview(request: RecommendationRequest, limit = 10): Promise<Recommendation[]> {
  throwIfTurnStopped()
  const key = JSON.stringify({ request, limit })
  const cached = previewCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.titles
  const titles = await recommendationEngine.previewRecommendations(request, limit)
  throwIfTurnStopped()
  if (previewCache.size >= MAX_CACHE_ENTRIES) previewCache.delete(previewCache.keys().next().value!)
  previewCache.set(key, { titles, expires: Date.now() + PREVIEW_TTL_MS })
  return titles
}

function scopedRequest(request: RecommendationRequest, spec: RequestSpec, operation: SpecTurn['operation'], label: string): RecommendationRequest {
  return {
    ...request, spec, previousSpec: request.spec, specOperation: operation,
    clarificationContext: {
      ...request.clarificationContext,
      clarificationRound: (request.clarificationContext?.clarificationRound ?? 0) + 1,
      userClarification: label,
      userTurns: [...(request.clarificationContext?.userTurns || [request.description]), label],
      // Validate new searches, not the accidental reuse of old result IDs.
      previousRecommendationIds: []
    }
  }
}

function distinctCount(titles: Recommendation[]): number {
  return new Set(titles.map(title => title.id)).size
}

function question(request: RecommendationRequest, base: RequestSpec, id: string, prompt: string, choices: Array<{ label: string; spec: RequestSpec; operation: SpecTurn['operation'] }>): CatalogueQuestion {
  throwIfTurnStopped()
  return {
    id, question: prompt, type: 'select',
    options: choices.map(choice => choice.label),
    optionTokens: Object.fromEntries(choices.map(choice =>
      [choice.label, choiceToken(request, base, choice.spec, choice.operation, choice.label)]
    ))
  }
}

export async function buildCatalogueDirections(request: RecommendationRequest, limit = 10): Promise<CatalogueClarification | undefined> {
  if (!request.spec || limit < MIN_MATCHES) return undefined
  const base = request.spec
  const canStartPreview = previewWindow()
  const titles = await preview(request, 30)
  const genres = SPEC_GENRES.filter(genre =>
    genre !== 'Indie' && !base.genres.includes(genre) && !base.excludeGenres.includes(genre)
  ).map(genre => ({
    genre, count: distinctCount(titles.filter(title => title.genres?.includes(genre)))
  })).filter(item => item.count >= MIN_MATCHES)
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, MAX_GENRE_CHECKS)

  const choices: Array<{ label: string; spec: RequestSpec; operation: 'refine' }> = []
  const matchedPools = new Set<string>()
  for (const { genre } of genres) {
    if (!canStartPreview()) break
    const spec = validateSpec({ ...base, genres: [...base.genres, genre] })
    const label = `Explore ${genre}`
    const matching = await preview(scopedRequest(request, spec, 'refine', label), limit)
    // Genre relaxation and broad OR-genre matching must not count as evidence for this choice.
    const genreMatches = matching.filter(title => title.genres?.includes(genre))
    const pool = JSON.stringify([...new Set(genreMatches.map(title => title.id))].sort())
    if (distinctCount(genreMatches) >= MIN_MATCHES && !matchedPools.has(pool)) {
      choices.push({ label, spec, operation: 'refine' })
      matchedPools.add(pool)
    }
    if (choices.length === 3) break
  }
  // A single direction is not a useful choice between alternatives.
  if (choices.length < 2) return undefined
  return {
    context: "I found a few directions within your request. These choices keep your current constraints.",
    questions: [question(request, base, 'catalogue_genre_direction', 'Which would you like to explore, or would you rather describe another direction?', choices)]
  }
}

export async function buildCatalogueWidening(request: RecommendationRequest, limit = 10): Promise<CatalogueClarification> {
  if (!request.spec) throw new Error('Catalogue widening requires an active request')
  const base = request.spec
  const canStartPreview = previewWindow()
  const candidates: Array<{ label: string; spec: RequestSpec; operation: 'remove' }> = []
  const add = (label: string, changes: Partial<RequestSpec>) =>
    candidates.push({ label, spec: validateSpec({ ...base, ...changes }), operation: 'remove' })
  if (base.genres.length) add('Try any genre', { genres: [] })
  if (base.languages.length) add('Include any original language', { languages: [] })
  if (base.countries.length) add('Include titles from any country', { countries: [] })
  if (base.format !== 'both') add('Include both films and series', { format: 'both' })
  if (base.years || base.dateRange || base.releasedWithinDays) {
    add('Look beyond the requested release window', { years: undefined, dateRange: undefined, releasedWithinDays: undefined })
  }
  const choices: typeof candidates = []
  let checksIncomplete = false
  for (const candidate of candidates) {
    if (limit < MIN_MATCHES) break
    if (!canStartPreview()) {
      checksIncomplete = true
      break
    }
    const titles = await preview(scopedRequest(request, candidate.spec, 'remove', candidate.label), limit)
    const retainedGenres = candidate.spec.genres.filter(genre => genre !== 'Indie')
    const matching = retainedGenres.length
      ? titles.filter(title => retainedGenres.some(genre => title.genres?.includes(genre)))
      : titles
    if (distinctCount(matching) >= MIN_MATCHES) choices.push(candidate)
    if (choices.length === 3) break
  }
  if (!choices.length) {
    return {
      context: checksIncomplete
        ? "I couldn't finish checking wider searches in time. Your request is unchanged; please try again or describe a different direction."
        : "I couldn't confirm enough matches for that request, and I don't have a checked wider search to offer.",
      questions: [{
        id: 'catalogue_rephrase', type: 'text',
        question: 'Would you like to change a constraint or describe a different direction?'
      }]
    }
  }
  return {
    context: "I couldn't confirm enough matches as requested. I checked these wider searches; nothing changes unless you choose one." +
      (checksIncomplete ? " I didn't finish checking every alternative; only completed checks are shown." : ''),
    questions: [question(request, base, 'catalogue_widen', 'Which constraint, if any, would you like to loosen?', choices)]
  }
}
