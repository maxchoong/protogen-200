/**
 * Recommendation quality evaluation harness.
 *
 * Replays each case in eval/cases.json against POST /recommendations the same way
 * the frontend does (ConversationalHome.submitMessage), scores the final result list
 * and writes a JSON report to eval/reports/.
 *
 * Usage: npm run eval -- [--base http://localhost:3000] [--only id1,id2] [--label name] [--concurrency 3]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type Turn = string | { choose: string; text: string }

interface Expectation {
  countries?: string[]
  coverAllCountries?: boolean
  avoidCountries?: string[]
  languages?: string[]
  coverAllLanguages?: boolean
  yearMin?: number
  yearMax?: number
  format?: 'movie' | 'tv'
  excludeGenres?: string[]
  anyGenre?: string[]
  allGenres?: string[]
  allGenresShare?: number
  toneConflict?: string[]
  excludeTitles?: string[]
  cast?: string
  director?: string
  minResults?: number
  clarify?: boolean
}

interface EvalCase {
  id: string
  category: 'constraint' | 'tone' | 'reference' | 'talent' | 'clarify' | 'followup'
  turns: Turn[]
  expect: Expectation
}

interface Recommendation {
  id: string
  title: string
  year?: string
  type?: string
  genres?: string[]
  originalLanguage?: string
  originCountries?: string[]
  mainCast?: string[]
  directors?: string[]
  voteCount?: number
}

interface ApiResponse {
  success: boolean
  message?: string
  recommendations?: Recommendation[]
  requiresClarification?: { questions: { id: string; question: string; options?: string[] }[]; context: string }
  appliedConstraints?: string[]
  assistantMessage?: string
  interpretationNote?: string
  turnOperation?: { continuity?: string; operation?: string }
  spec?: unknown
}

type CheckKind = 'hard' | 'soft' | 'tone' | 'results' | 'clarify'

interface Check {
  name: string
  kind: CheckKind
  pass: boolean
  detail: string
}

interface TranscriptEntry {
  user: string
  reply: string
  outcome: 'results' | 'clarification' | 'empty' | 'error'
  options?: string[]
  latencyMs: number
  spec?: unknown
}

interface CaseResult {
  id: string
  category: EvalCase['category']
  pass: boolean
  checks: Check[]
  transcript: TranscriptEntry[]
  results: { title: string; year?: string; type?: string; genres?: string[]; countries?: string[]; language?: string; votes?: number }[]
  error?: string
}

const ROOT = dirname(fileURLToPath(import.meta.url))
const SERIES_TYPES = new Set(['series', 'tv', 'episode'])
const MIN_SHARE = 0.9
const GENRE_SHARE = 0.6
const PEOPLE_SHARE = 0.6
const TONE_WINDOW = 5
const HARD_PIVOT_CUE_PATTERN = /\b(?:instead|actually|forget that|forget this|different direction|switch gears|new direction|not that|start over)\b/i

function parseArgs() {
  const args = process.argv.slice(2)
  const value = (flag: string) => {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] : undefined
  }
  return {
    base: value('--base') || 'http://localhost:3000',
    only: value('--only')?.split(',').map(id => id.trim()).filter(Boolean),
    label: value('--label') || 'run',
    concurrency: Number(value('--concurrency') || 3)
  }
}

async function post(base: string, body: unknown): Promise<{ data: ApiResponse; latencyMs: number }> {
  const started = Date.now()
  const response = await fetch(`${base}/recommendations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000)
  })
  const data = await response.json() as ApiResponse
  return { data, latencyMs: Date.now() - started }
}

/** Replays a conversation the way ConversationalHome builds requests. */
async function replay(base: string, evalCase: EvalCase) {
  const transcript: TranscriptEntry[] = []
  const userTurns: string[] = []
  const askedQuestionIds: string[] = []
  const passes: { applied: string[]; pivot: boolean; turnIndex: number }[] = []
  let firstQuery: string | undefined
  let clarificationRound = 0
  let pendingOptions: string[] | undefined
  let finalResults: Recommendation[] = []
  let clarifiedFirstTurn = false
  const status: { lastOutcome: TranscriptEntry['outcome']; spec?: unknown } = { lastOutcome: 'empty' }

  const send = async (text: string) => {
    userTurns.push(text)
    const pivotTurnIndex = userTurns.map(turn => HARD_PIVOT_CUE_PATTERN.test(turn)).lastIndexOf(true)
    const lastPivotPassIndex = passes.map(pass => pass.pivot).lastIndexOf(true)
    const lastPivotPass = passes[lastPivotPassIndex]
    const pivotUnresolved = pivotTurnIndex >= 0 && (!lastPivotPass || lastPivotPass.turnIndex < pivotTurnIndex)
    const activePasses = lastPivotPassIndex >= 0 ? passes.slice(lastPivotPassIndex) : passes
    const cumulativeConstraints = Array.from(new Set((pivotUnresolved ? [] : activePasses).flatMap(pass => pass.applied)))
    const isFollowUp = firstQuery !== undefined

    const body = isFollowUp
      ? {
          description: firstQuery,
          clarificationContext: {
            clarificationRound: Math.max(1, clarificationRound),
            userClarification: text,
            askedQuestionIds,
            previousRecommendationIds: finalResults.map(item => item.id),
            cumulativeConstraints,
            userTurns: [...userTurns]
          },
          spec: status.spec
        }
      : { description: text }

    const { data, latencyMs } = await post(base, body)
    if (firstQuery === undefined) firstQuery = text
    status.spec = data.spec

    if (!data.success) {
      status.lastOutcome = 'error'
      transcript.push({ user: text, reply: data.message || 'error', outcome: 'error', latencyMs })
      return
    }

    if (data.requiresClarification) {
      const question = data.requiresClarification.questions[0]
      pendingOptions = question?.options
      askedQuestionIds.push(...data.requiresClarification.questions.map(item => item.id))
      clarificationRound += 1
      status.lastOutcome = 'clarification'
      if (userTurns.length === 1) clarifiedFirstTurn = true
      transcript.push({
        user: text,
        reply: `${data.requiresClarification.context} ${question?.question || ''}`.trim(),
        outcome: 'clarification',
        options: pendingOptions,
        latencyMs,
        spec: data.spec
      })
      return
    }

    pendingOptions = undefined
    clarificationRound = 0
    const recommendations = data.recommendations || []
    if (recommendations.length > 0) {
      finalResults = recommendations
      passes.push({ applied: data.appliedConstraints || [], pivot: data.turnOperation?.continuity === 'hard_pivot', turnIndex: userTurns.length - 1 })
      status.lastOutcome = 'results'
    } else {
      finalResults = []
      status.lastOutcome = 'empty'
    }
    transcript.push({
      user: text,
      reply: [data.assistantMessage, data.interpretationNote].filter(Boolean).join(' '),
      outcome: status.lastOutcome,
      latencyMs,
      spec: data.spec
    })
  }

  for (const turn of evalCase.turns) {
    if (typeof turn === 'string') {
      await send(turn)
      continue
    }
    const wanted = turn.choose.toLowerCase()
    const option = pendingOptions?.find(item => item.toLowerCase().includes(wanted)) ?? pendingOptions?.[0]
    await send(option ?? turn.text)
  }

  // A real user would answer an unexpected question; take the first option so the case still produces results.
  for (let attempt = 0; attempt < 2 && status.lastOutcome === 'clarification' && pendingOptions?.length; attempt += 1) {
    await send(pendingOptions[0])
  }

  return { transcript, finalResults, clarifiedFirstTurn, lastOutcome: status.lastOutcome }
}

const isSeries = (item: Recommendation) => SERIES_TYPES.has((item.type || '').toLowerCase())
const yearOf = (item: Recommendation) => Number.parseInt(String(item.year || '').slice(0, 4), 10)
const hasGenre = (item: Recommendation, genres: string[]) =>
  (item.genres || []).some(genre => genres.some(wanted => genre.toLowerCase() === wanted.toLowerCase()))
const share = (items: Recommendation[], predicate: (item: Recommendation) => boolean) =>
  items.length ? items.filter(predicate).length / items.length : 0
const pct = (value: number) => `${Math.round(value * 100)}%`
const titlesFailing = (items: Recommendation[], predicate: (item: Recommendation) => boolean) =>
  items.filter(item => !predicate(item)).slice(0, 4).map(item => item.title).join(', ')

function score(evalCase: EvalCase, results: Recommendation[], clarifiedFirstTurn: boolean): Check[] {
  const expect = evalCase.expect
  const checks: Check[] = []
  const add = (name: string, kind: CheckKind, pass: boolean, detail: string) => checks.push({ name, kind, pass, detail })
  const minResults = expect.minResults ?? 5

  add('minResults', 'results', results.length >= minResults, `${results.length} results (need ${minResults})`)
  if (expect.clarify !== undefined) {
    add('clarify', 'clarify', clarifiedFirstTurn === expect.clarify, `asked=${clarifiedFirstTurn}, expected=${expect.clarify}`)
  }
  if (results.length === 0) return checks

  if (expect.countries) {
    const wanted = expect.countries.map(code => code.toUpperCase())
    const fits = (item: Recommendation) => (item.originCountries || []).some(code => wanted.includes(code.toUpperCase()))
    const value = share(results, fits)
    add('countries', 'hard', value >= MIN_SHARE, `${pct(value)} from ${wanted.join('/')}; off: ${titlesFailing(results, fits)}`)
    if (expect.coverAllCountries) {
      const missing = wanted.filter(code => !results.some(item => (item.originCountries || []).includes(code)))
      add('coverAllCountries', 'hard', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : 'all present')
    }
  }
  if (expect.avoidCountries) {
    const avoided = expect.avoidCountries.map(code => code.toUpperCase())
    const value = share(results, item => (item.originCountries || []).some(code => avoided.includes(code)))
    add('avoidCountries', 'hard', value <= 0.5, `${pct(value)} still from ${avoided.join('/')}`)
  }
  if (expect.languages) {
    const fits = (item: Recommendation) => expect.languages!.includes((item.originalLanguage || '').toLowerCase())
    const value = share(results, fits)
    add('languages', 'hard', value >= MIN_SHARE, `${pct(value)} in ${expect.languages.join('/')}; off: ${titlesFailing(results, fits)}`)
    if (expect.coverAllLanguages) {
      const missing = expect.languages.filter(code => !results.some(item => item.originalLanguage === code))
      add('coverAllLanguages', 'hard', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : 'all present')
    }
  }
  if (expect.yearMin !== undefined || expect.yearMax !== undefined) {
    const fits = (item: Recommendation) => {
      const year = yearOf(item)
      return Number.isFinite(year) && year >= (expect.yearMin ?? -Infinity) && year <= (expect.yearMax ?? Infinity)
    }
    const value = share(results, fits)
    add('years', 'hard', value >= MIN_SHARE, `${pct(value)} within ${expect.yearMin ?? ''}-${expect.yearMax ?? ''}; off: ${titlesFailing(results, fits)}`)
  }
  if (expect.format) {
    const fits = (item: Recommendation) => (expect.format === 'tv' ? isSeries(item) : !isSeries(item))
    const value = share(results, fits)
    add('format', 'hard', value >= MIN_SHARE, `${pct(value)} ${expect.format}`)
  }
  if (expect.excludeGenres) {
    const offenders = results.filter(item => hasGenre(item, expect.excludeGenres!))
    add('excludeGenres', 'hard', offenders.length === 0, offenders.length ? `contains: ${offenders.map(item => item.title).join(', ')}` : 'none')
  }
  if (expect.excludeTitles) {
    const offenders = results.filter(item => expect.excludeTitles!.some(title => item.title.toLowerCase() === title.toLowerCase()))
    add('excludeTitles', 'hard', offenders.length === 0, offenders.length ? `contains reference ${offenders[0].title}` : 'none')
  }
  if (expect.cast) {
    const name = expect.cast.toLowerCase()
    const fits = (item: Recommendation) => (item.mainCast || []).some(person => person.toLowerCase() === name)
    const value = share(results, fits)
    add('cast', 'hard', value >= PEOPLE_SHARE, `${pct(value)} with ${expect.cast}`)
  }
  if (expect.director) {
    const name = expect.director.toLowerCase()
    const fits = (item: Recommendation) => (item.directors || []).some(person => person.toLowerCase() === name)
    const value = share(results, fits)
    add('director', 'hard', value >= PEOPLE_SHARE, `${pct(value)} directed by ${expect.director}`)
  }
  if (expect.anyGenre) {
    const fits = (item: Recommendation) => hasGenre(item, expect.anyGenre!)
    const value = share(results, fits)
    add('anyGenre', 'soft', value >= GENRE_SHARE, `${pct(value)} match ${expect.anyGenre.join('/')}; off: ${titlesFailing(results, fits)}`)
  }
  if (expect.allGenres) {
    const fits = (item: Recommendation) => expect.allGenres!.every(genre => hasGenre(item, [genre]))
    const value = share(results, fits)
    const needed = expect.allGenresShare ?? GENRE_SHARE
    add('allGenres', 'soft', value >= needed, `${pct(value)} are ${expect.allGenres.join('+')} (need ${pct(needed)})`)
  }
  if (expect.toneConflict) {
    const top = results.slice(0, TONE_WINDOW)
    const offenders = top.filter(item => hasGenre(item, expect.toneConflict!))
    add('toneConflict', 'tone', offenders.length === 0, offenders.length
      ? `${offenders.length}/${top.length} top titles conflict: ${offenders.map(item => `${item.title} [${(item.genres || []).join('/')}]`).join(', ')}`
      : 'none in top 5')
  }
  return checks
}

async function runCase(base: string, evalCase: EvalCase): Promise<CaseResult> {
  try {
    const { transcript, finalResults, clarifiedFirstTurn } = await replay(base, evalCase)
    const checks = score(evalCase, finalResults, clarifiedFirstTurn)
    return {
      id: evalCase.id,
      category: evalCase.category,
      pass: checks.every(check => check.pass),
      checks,
      transcript,
      results: finalResults.map(item => ({
        title: item.title,
        year: item.year,
        type: item.type,
        genres: item.genres,
        countries: item.originCountries,
        language: item.originalLanguage,
        votes: item.voteCount
      }))
    }
  } catch (error) {
    return { id: evalCase.id, category: evalCase.category, pass: false, checks: [], transcript: [], results: [], error: String(error) }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length)
  let cursor = 0
  const lanes = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await worker(items[index])
      const result = output[index] as unknown as CaseResult
      process.stdout.write(`${result.pass ? '✓' : '✗'} ${result.id}\n`)
    }
  })
  await Promise.all(lanes)
  return output
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]
}

function summarise(results: CaseResult[]) {
  const checks = results.flatMap(result => result.checks)
  const rate = (kind: CheckKind) => {
    const relevant = checks.filter(check => check.kind === kind)
    return relevant.length ? relevant.filter(check => check.pass).length / relevant.length : null
  }
  const latencies = results.flatMap(result => result.transcript.map(entry => entry.latencyMs))
  const followups = results.filter(result => result.category === 'followup')
  const toneChecks = checks.filter(check => check.name === 'toneConflict')
  return {
    cases: results.length,
    casePassRate: results.filter(result => result.pass).length / results.length,
    hardConstraintPassRate: rate('hard'),
    genreFitPassRate: rate('soft'),
    tonePassRate: rate('tone'),
    clarifyPassRate: rate('clarify'),
    firstTurnClarificationRate: results.filter(result => result.transcript[0]?.outcome === 'clarification').length / results.length,
    emptyResultRate: results.filter(result => result.results.length === 0).length / results.length,
    followupPassRate: followups.length ? followups.filter(result => result.pass).length / followups.length : null,
    toneConflictCases: toneChecks.filter(check => !check.pass).length,
    errors: results.filter(result => result.error).length,
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP90Ms: percentile(latencies, 0.9),
    byCategory: Object.fromEntries(
      Array.from(new Set(results.map(result => result.category))).map(category => {
        const group = results.filter(result => result.category === category)
        return [category, `${group.filter(result => result.pass).length}/${group.length}`]
      })
    )
  }
}

async function main() {
  const options = parseArgs()
  const { cases } = JSON.parse(readFileSync(join(ROOT, 'cases.json'), 'utf8')) as { cases: EvalCase[] }
  const selected = options.only ? cases.filter(item => options.only!.includes(item.id)) : cases
  console.log(`Running ${selected.length} cases against ${options.base}\n`)

  const results = await mapLimit(selected, options.concurrency, evalCase => runCase(options.base, evalCase))
  const summary = summarise(results)

  console.log('\nFailures:')
  for (const result of results.filter(item => !item.pass)) {
    const failed = result.checks.filter(check => !check.pass).map(check => `${check.name}: ${check.detail}`)
    console.log(`  ${result.id}\n    ${result.error || failed.join('\n    ')}`)
  }
  console.log('\nSummary:')
  for (const [key, value] of Object.entries(summary)) {
    const shown = typeof value === 'number' && value <= 1 && key.endsWith('Rate') ? pct(value) : JSON.stringify(value)
    console.log(`  ${key}: ${shown}`)
  }

  const reportsDir = join(ROOT, 'reports')
  mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(reportsDir, `${stamp}-${options.label}.json`)
  writeFileSync(file, JSON.stringify({ label: options.label, base: options.base, createdAt: new Date().toISOString(), summary, results }, null, 2))
  console.log(`\nReport: ${file}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
