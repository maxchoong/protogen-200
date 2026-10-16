/**
 * Structured request ("spec") produced by the LLM for each conversation turn.
 *
 * The LLM sees the previous spec plus the latest user message and returns the
 * full updated spec and the kind of change. This module validates that output
 * against known vocabularies and works out what changed, so the rest of the
 * engine never trusts raw model output. See memory-bank/design-conversational-engine.md.
 */
import { LANGUAGE_CODES, demonymForCountry, joinOriginNames, type OriginConstraint } from './regionTaxonomy.js'

export type SpecOperation = 'new' | 'refine' | 'add' | 'remove' | 'replace' | 'pivot'
export type SpecFormat = 'movie' | 'tv' | 'both'
export type SpecCreatorRole = 'director' | 'writer' | 'producer' | 'creator'

export interface RequestSpec {
  // Hard constraints: titles that don't match are filtered out.
  countries: string[]
  languages: string[]
  years?: { min?: number; max?: number }
  releasedWithinDays?: number
  dateRange?: { from?: string; to?: string }
  format: SpecFormat
  excludeGenres: string[]
  maxCertification?: string
  // Soft preferences: used for retrieval and ranking.
  genres: string[]
  tones: string[]
  themes: string[]
  references: string[]
  referenceSuggestions: string[]
  actors: string[]
  creators: { name: string; role: SpecCreatorRole; allowOtherRoles: boolean }[]
  popularity?: 'mainstream' | 'niche'
}

export interface SpecTurn {
  operation: SpecOperation
  spec: RequestSpec
}

export interface SpecChange {
  field: keyof RequestSpec
  kind: 'added' | 'removed' | 'changed'
  before?: unknown
  after?: unknown
}

export const SPEC_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
  'History', 'Horror', 'Indie', 'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western'
] as const

export const SPEC_TONES = [
  'Happy', 'Sad', 'Intense', 'Relaxing', 'Funny', 'Thoughtful', 'Dark', 'Romantic', 'Suspenseful', 'Surprising'
] as const

const OPERATIONS: SpecOperation[] = ['new', 'refine', 'add', 'remove', 'replace', 'pivot']
const CERTIFICATIONS = ['G', 'PG', 'PG-13', 'R', 'NC-17']
const GENRE_ALIASES: Record<string, string> = {
  'science fiction': 'Sci-Fi', 'science-fiction': 'Sci-Fi', scifi: 'Sci-Fi', 'sci fi': 'Sci-Fi',
  musical: 'Music', animated: 'Animation', anime: 'Animation', historical: 'History', romantic: 'Romance',
  'sci-fi & fantasy': 'Sci-Fi', 'action & adventure': 'Action', 'war & politics': 'War', kids: 'Family'
}
const MAX_LIST = 8

let regionNames: Intl.DisplayNames | undefined
let languageNames: Intl.DisplayNames | undefined
const displayNames = (type: 'region' | 'language') => {
  try {
    if (type === 'region') return (regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' }))
    return (languageNames ??= new Intl.DisplayNames(['en'], { type: 'language' }))
  } catch {
    return undefined
  }
}

const KNOWN_LANGUAGE_CODES = new Set(Object.values(LANGUAGE_CODES))

export function countryName(code: string): string {
  return displayNames('region')?.of(code) || code
}

export function languageName(code: string): string {
  const fromTable = Object.entries(LANGUAGE_CODES).find(([, value]) => value === code)?.[0]
  if (fromTable) return fromTable.replace(/\b\w/g, char => char.toUpperCase())
  return displayNames('language')?.of(code) || code
}

const isValidCountry = (code: string) => {
  const name = displayNames('region')?.of(code)
  return !!name && name !== code && !/unknown/i.test(name)
}

const isValidLanguage = (code: string) => {
  if (KNOWN_LANGUAGE_CODES.has(code)) return true
  const name = displayNames('language')?.of(code)
  return !!name && name !== code
}

const strings = (value: unknown, limit = MAX_LIST): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value
        .filter((entry): entry is string => typeof entry === 'string')
        .map(entry => entry.trim())
        .filter(Boolean))).slice(0, limit)
    : []

const canonical = (values: string[], vocabulary: readonly string[], aliases: Record<string, string> = {}) =>
  Array.from(new Set(values.flatMap(value => {
    const lower = value.toLowerCase()
    const match = vocabulary.find(item => item.toLowerCase() === lower) || aliases[lower]
    return match ? [match] : []
  })))

const toYear = (value: unknown, today: Date) => {
  const year = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN
  return Number.isInteger(year) && year >= 1880 && year <= today.getUTCFullYear() + 2 ? year : undefined
}

export const toIsoDate = (value: unknown): string | undefined =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : undefined

export function emptySpec(): RequestSpec {
  return {
    countries: [], languages: [], format: 'both', excludeGenres: [], genres: [], tones: [], themes: [],
    references: [], referenceSuggestions: [], actors: [], creators: []
  }
}

/** Validates raw model output (or a client-supplied spec) into a safe RequestSpec. */
export function validateSpec(raw: unknown, today = new Date()): RequestSpec {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const spec = emptySpec()

  spec.countries = strings(input.countries).map(code => code.toUpperCase()).filter(code => /^[A-Z]{2}$/.test(code) && isValidCountry(code))
  spec.languages = strings(input.languages).map(code => code.toLowerCase()).filter(code => /^[a-z]{2}$/.test(code) && isValidLanguage(code))

  const years = input.years && typeof input.years === 'object' ? input.years as Record<string, unknown> : {}
  let min = toYear(years.min, today)
  let max = toYear(years.max, today)
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min]
  if (min !== undefined || max !== undefined) spec.years = { ...(min !== undefined && { min }), ...(max !== undefined && { max }) }

  const days = typeof input.releasedWithinDays === 'number' ? Math.round(input.releasedWithinDays) : undefined
  if (days !== undefined && days >= 1 && days <= 3650) spec.releasedWithinDays = days

  const dateRange = input.dateRange && typeof input.dateRange === 'object' ? input.dateRange as Record<string, unknown> : {}
  const from = toIsoDate(dateRange.from)
  const to = toIsoDate(dateRange.to)
  if ((from || to) && !(from && to && from > to)) spec.dateRange = { ...(from && { from }), ...(to && { to }) }

  spec.format = input.format === 'movie' || input.format === 'tv' ? input.format : 'both'
  spec.genres = canonical(strings(input.genres), SPEC_GENRES, GENRE_ALIASES)
  spec.excludeGenres = canonical(strings(input.excludeGenres), SPEC_GENRES, GENRE_ALIASES)
  spec.genres = spec.genres.filter(genre => !spec.excludeGenres.includes(genre))
  spec.tones = canonical(strings(input.tones), SPEC_TONES)
  spec.themes = strings(input.themes)
  spec.references = strings(input.references, 5)
  spec.referenceSuggestions = strings(input.referenceSuggestions, 5)
    .filter(title => !spec.references.some(reference => reference.toLowerCase() === title.toLowerCase()))
  spec.actors = strings(input.actors, 5)

  if (typeof input.maxCertification === 'string' && CERTIFICATIONS.includes(input.maxCertification.toUpperCase())) {
    spec.maxCertification = input.maxCertification.toUpperCase()
  }
  if (input.popularity === 'mainstream' || input.popularity === 'niche') spec.popularity = input.popularity

  spec.creators = Array.isArray(input.creators)
    ? input.creators.flatMap((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return []
        const creator = entry as Record<string, unknown>
        const role = String(creator.role) as SpecCreatorRole
        if (typeof creator.name !== 'string' || !creator.name.trim() || !['director', 'writer', 'producer', 'creator'].includes(role)) return []
        return [{ name: creator.name.trim(), role, allowOtherRoles: creator.allowOtherRoles === true }]
      }).slice(0, 3)
    : []
  const creatorNames = new Set(spec.creators.map(creator => creator.name.toLowerCase()))
  spec.actors = spec.actors.filter(actor => !creatorNames.has(actor.toLowerCase()))

  return spec
}

export function validateSpecTurn(raw: unknown, hasPrevious: boolean, today = new Date()): SpecTurn {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const operation = OPERATIONS.includes(input.operation as SpecOperation)
    ? input.operation as SpecOperation
    : hasPrevious ? 'refine' : 'new'
  return { operation: hasPrevious ? operation : 'new', spec: validateSpec(input.spec ?? input, today) }
}

export type SpecTurnAssessment =
  | { accepted: true; turn: SpecTurn }
  | { accepted: false; reason: string }

/** Reject unusable updates before permissive normalisation can erase saved state. */
export function assessSpecTurn(raw: unknown, previous?: RequestSpec, today = new Date()): SpecTurnAssessment {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { accepted: false, reason: 'understanding is not an object' }
  }
  const input = raw as Record<string, unknown>
  if (!OPERATIONS.includes(input.operation as SpecOperation) ||
      !input.spec || typeof input.spec !== 'object' || Array.isArray(input.spec)) {
    return { accepted: false, reason: 'missing operation or request object' }
  }
  const source = input.spec as Record<string, unknown>
  const listFields = [
    'countries', 'languages', 'excludeGenres', 'genres', 'tones', 'themes',
    'references', 'referenceSuggestions', 'actors', 'creators'
  ]
  if (listFields.some(field => Object.prototype.hasOwnProperty.call(source, field) && !Array.isArray(source[field])) ||
      (source.format !== undefined && !['movie', 'tv', 'both'].includes(String(source.format)))) {
    return { accepted: false, reason: 'request fields have invalid shapes' }
  }
  if (previous && input.operation === 'new') {
    return { accepted: false, reason: 'saved request requires an explicit update or pivot' }
  }
  const turn = validateSpecTurn(raw, !!previous, today)
  const hasSignal = Object.entries(turn.spec).some(([field, value]) =>
    field === 'format' ? value !== 'both' : Array.isArray(value) ? value.length > 0 : value !== undefined
  )
  // Explicit removal/pivot may intentionally produce an unconstrained request.
  if (!hasSignal && !['remove', 'pivot'].includes(turn.operation)) {
    return { accepted: false, reason: 'request has no usable search direction' }
  }
  if (previous && turn.operation !== 'pivot' && turn.operation !== 'new') {
    for (const field of Object.keys(previous) as (keyof RequestSpec)[]) {
      const value = previous[field]
      const populated = field === 'format' ? value !== 'both'
        : Array.isArray(value) ? value.length > 0 : value !== undefined
      if (populated && !Object.prototype.hasOwnProperty.call(source, field)) {
        return { accepted: false, reason: `update omitted saved field ${field}` }
      }
    }
    if (turn.operation === 'refine' || turn.operation === 'add') {
      const next = turn.spec
      const lostList = (field: 'countries' | 'languages') => previous[field].length > 0 &&
        (next[field].length === 0 || (turn.operation === 'add'
          ? previous[field].some(value => !next[field].includes(value))
          : next[field].some(value => !previous[field].includes(value))))
      const lostBound = (before?: { min?: number; max?: number }, after?: { min?: number; max?: number }) =>
        (before?.min !== undefined && (after?.min === undefined || after.min < before.min)) ||
        (before?.max !== undefined && (after?.max === undefined || after.max > before.max))
      const beforeWindow = releaseWindow(previous, today)
      const afterWindow = releaseWindow(next, today)
      const lostWindow = beforeWindow && (
        (beforeWindow.gte && (!afterWindow?.gte || afterWindow.gte < beforeWindow.gte)) ||
        (beforeWindow.lte && (!afterWindow?.lte || afterWindow.lte > beforeWindow.lte))
      )
      if (lostList('countries') || lostList('languages') ||
          previous.excludeGenres.some(genre => !next.excludeGenres.includes(genre)) ||
          (turn.operation === 'refine' && previous.format !== 'both' && next.format !== previous.format) ||
          lostBound(previous.years, next.years) || lostWindow ||
          (previous.maxCertification && (!next.maxCertification ||
            CERTIFICATIONS.indexOf(next.maxCertification) > CERTIFICATIONS.indexOf(previous.maxCertification)))) {
        return { accepted: false, reason: 'refinement dropped or loosened a saved hard constraint' }
      }
    }
  }
  return { accepted: true, turn }
}

const sameList = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every(item => b.some(other => JSON.stringify(other) === JSON.stringify(item)))

/** Field-level differences between two specs, for turn handling and reply copy. */
export function diffSpecs(previous: RequestSpec | undefined, next: RequestSpec): SpecChange[] {
  const before = previous ?? emptySpec()
  const changes: SpecChange[] = []
  for (const field of Object.keys({ ...emptySpec(), ...before, ...next }) as (keyof RequestSpec)[]) {
    const a = before[field]
    const b = next[field]
    if (Array.isArray(a) || Array.isArray(b)) {
      const listA = (a as unknown[] | undefined) ?? []
      const listB = (b as unknown[] | undefined) ?? []
      if (sameList(listA, listB)) continue
      const kind = listA.length === 0 ? 'added'
        : listB.length === 0 ? 'removed'
          : listA.every(item => listB.some(other => JSON.stringify(other) === JSON.stringify(item))) ? 'added' : 'changed'
      changes.push({ field, kind, before: listA, after: listB })
      continue
    }
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    const isEmpty = (value: unknown) => value === undefined || value === 'both'
    changes.push({ field, kind: isEmpty(a) ? 'added' : isEmpty(b) ? 'removed' : 'changed', before: a, after: b })
  }
  return changes
}

export interface OriginSummary {
  originCountry?: string
  originCountryName?: string
  originalLanguage?: string
  originalLanguageName?: string
  originChange?: 'added' | 'replaced' | 'narrowed'
  originChangeNote?: string
}

const countryItems = (codes: string[]): OriginConstraint[] =>
  codes.map(code => ({ code, name: demonymForCountry(code) || countryName(code) }))
const languageItems = (codes: string[]): OriginConstraint[] => codes.map(code => ({ code, name: languageName(code) }))

/** Origin filters in the engine's existing "|"-joined format, plus a plain-English change note. */
export function summariseOrigins(previous: RequestSpec | undefined, next: RequestSpec): OriginSummary {
  const summary: OriginSummary = {}
  if (next.countries.length) {
    summary.originCountry = next.countries.join('|')
    summary.originCountryName = joinOriginNames(countryItems(next.countries), 'or')
  }
  if (next.languages.length) {
    summary.originalLanguage = next.languages.join('|')
    summary.originalLanguageName = joinOriginNames(languageItems(next.languages), 'or')
  }

  const before = [...countryItems(previous?.countries ?? []), ...languageItems(previous?.languages ?? [])]
  const after = [...countryItems(next.countries), ...languageItems(next.languages)]
  if (before.length === 0 || after.length === 0) return summary
  const key = (item: OriginConstraint) => item.code
  const beforeKeys = new Set(before.map(key))
  const afterKeys = new Set(after.map(key))
  if (beforeKeys.size === afterKeys.size && [...beforeKeys].every(code => afterKeys.has(code))) return summary

  const added = after.filter(item => !beforeKeys.has(key(item)))
  if ([...beforeKeys].every(code => afterKeys.has(code))) {
    summary.originChange = 'added'
    summary.originChangeNote = `Added ${joinOriginNames(added)} alongside ${joinOriginNames(before)}.`
  } else if (added.length === 0) {
    summary.originChange = 'narrowed'
    summary.originChangeNote = `Narrowed to ${joinOriginNames(after)}.`
  } else {
    summary.originChange = 'replaced'
    summary.originChangeNote = `Switched to ${joinOriginNames(after)}.`
  }
  return summary
}

/** Date range for a relative or absolute release window, with a short label for copy. */
export function releaseWindow(spec: RequestSpec, today = new Date()): { gte?: string; lte?: string; label: string } | undefined {
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  if (spec.releasedWithinDays) {
    const start = new Date(today.getTime() - spec.releasedWithinDays * 86_400_000)
    const days = spec.releasedWithinDays
    const label = days <= 7 ? 'released in the last week'
      : days <= 31 ? 'released in the last month'
        : days <= 92 ? 'released in the last three months'
          : days <= 366 ? 'released in the last year'
            : `released in the last ${Math.round(days / 365)} years`
    return { gte: iso(start), lte: iso(today), label }
  }
  if (spec.dateRange) {
    const { from, to } = spec.dateRange
    const label = from && to ? `released between ${from} and ${to}` : from ? `released since ${from}` : `released before ${to}`
    return { gte: from, lte: to, label }
  }
  return undefined
}
