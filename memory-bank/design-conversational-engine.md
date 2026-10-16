# Design: Conversational Recommendation Engine (v2)

Status: partial implementation; planned sections are labelled below.

Implements [the PRD](prd-conversational-engine.md). Updated October 16, 2026.
Phases 1–2 are implemented, with initial results-first policy work from phase 3.
Quality and latency acceptance remain open. The harness measures changes; there
is no runtime feature flag gating the structured-request path.

## Target pipeline (includes unimplemented phases)

```mermaid
flowchart LR
    U[User turn + previous request] --> I[1. Understand: LLM returns full updated request and operation]
    I --> V[2. Validate: known lists, overlay on rule parser]
    V --> C[3. Check catalogue: count matching titles]
    C -->|ambiguous or too broad| Q[Ask: options built from catalogue, each checked]
    C -->|too few| R[Loosen: soft preferences first, record each step]
    C -->|enough| K
    R --> K[4. Rank: filter hard constraints, one weighted score, optional LLM re-order]
    K --> E[5. Reply: plain-English summary from the engine's match record]
    E --> O[Results + updated request + reply]
```

## 1. Structured request (implemented)

The runtime type is defined in
[`requestSpec.ts`](../backend/src/engine/requestSpec.ts). Fields are flat; the
hard/soft distinction is conceptual, not nested JSON.

```ts
interface RequestSpec {
  countries: string[]           // production countries, ISO 3166-1 alpha-2
  languages: string[]           // original languages
  years?: { min?: number; max?: number }
  releasedWithinDays?: number
  dateRange?: { from?: string; to?: string }
  format: 'movie' | 'tv' | 'both'
  excludeGenres: string[]
  maxCertification?: string     // parsed, not fully enforced
  genres: string[]
  tones: string[]
  themes: string[]
  references: string[]
  referenceSuggestions: string[] // catalogue-validated search seeds
  actors: string[]
  creators: {
    name: string
    role: 'director' | 'writer' | 'producer' | 'creator'
    allowOtherRoles: boolean
  }[]
  popularity?: 'mainstream' | 'niche'
}

interface SpecTurn {
  operation: 'new' | 'refine' | 'add' | 'remove' | 'replace' | 'pivot'
  spec: RequestSpec
}
```

- **Understanding:** `parseRequestSpec` receives the previous spec, latest message and up to six earlier user messages. It uses JSON-object mode plus a schema-shaped prompt, not provider-enforced JSON Schema.
- **Validation:** `validateSpecTurn`/`validateSpec` normalise codes, vocabulary,
  lists, people and date/year bounds. `assessSpecTurn` now gates raw provider
  output before accepting this sanitisation: operation/object/list/format shape,
  usable direction, explicit representation of populated saved fields and
  protection against implicit hard-constraint loss on refine/add. Rejected
  updates are logged with a reason; per-field discarded-value logging is still
  unfinished. Sanitisation alone remains permissive for client-supplied specs.
- **Fallback:** first requests (or legacy follow-ups without a saved spec) can
  still use rules. With a saved spec, failed/unusable follow-up understanding
  returns the unchanged spec and a text clarification, without retrieval or
  legacy LLM parsing. It explicitly says the change was not applied. This is a
  conservative clarification policy, not equivalent offline understanding.
- **Mapping:** `PreferenceParser.applySpec` overlays successful understanding on rule-derived preferences; there is no separate `specToPreferences` or `applyDelta`.

### As built (phase 2)

- **Full request, not a change set:** the implementation chose a complete updated `RequestSpec` rather than the originally proposed delta. `diffSpecs`/`summariseOrigins` derive changes (e.g. "Added Indonesian alongside Malaysian."). The eval has not independently compared full-spec versus delta reliability.
- **Validation (`requestSpec.ts`):** country/language code checks (including the catalogue's `cn` language code), canonical genre and tone names with aliases, reversed-year swapping, out-of-range year rejection, and list caps. Actor names matching creator names are removed; creator entries are capped but not fully deduplicated.
- **Applying it:** rather than a separate `specToPreferences`, `PreferenceParser.parse` overlays the spec (`applySpec`) on the rule output, so the spec is authoritative and the rules still fill fields the spec lacks. Rule guards still apply:
  - "Indie" becomes discovery intent, not a hard genre.
  - Popularity is accepted only when the wording supports it.
- **Operation mapping:** new/pivot → hard pivot; replace → continue + replace; add/remove → widen; refine → narrow.
- **Failure handling:** understanding uses an 8 s per-attempt timeout and one SDK retry. Other completion calls default to 15 s per attempt and two retries. A 429 starts a process-local 60 s cooldown only after SDK retries finish. Uncached calls then fail fast during cooldown; cached output can still be used. This is not an 8 s total-turn budget and does not cover 503s/timeouts with a circuit breaker.
- **Refinement retention (October 16):** the prompt explicitly distinguishes a short genre/tone answer from a pivot, retains prior genres unless explicitly replaced/rejected, and preserves unrelated country/format fields. Relative release windows should not invent extra year bounds.
- **Candidate reuse (October 16):** compare current/previous validated specs with `diffSpecs`. Any changed field other than tones requires fresh catalogue retrieval; missing previous structured state also requires retrieval. Unchanged scope and tone-only refinements may re-rank previous candidates. This prevents a new decade/window from being applied only to ten old results.

### Existing engine invariants to preserve

- Production country and original language are distinct. The successful spec
  path treats nationality as country unless language is explicit. Rule-origin
  parsing has its own demonym/language taxonomy; do not assume both paths agree.
- Country filters require country evidence, which can be inferred from a
  country-constrained discovery query when TMDB omits the field; it is not
  always independent title-detail evidence. Language filters tolerate missing metadata.
  Origin lists use `|` and discovery fans out per origin. Established candidates
  are reserved so low-vote new releases do not crowd out small catalogues.
- Indie is a soft discovery signal, not a TMDB genre. TV genre mappings and
  keyword evidence differ from films; qualified dramas need their qualifier.
  Genre relaxation is recorded per request with `AsyncLocalStorage`.
- Engine-level "last retrieval diagnostics" are shared mutable state; do not
  rely on them for concurrency-safe per-request evidence.
- Vote-confidence ranking separates unknown from zero votes, uses Bayesian
  ratings and pool-relative popularity, and scales recency with vote support.
  Exact weights belong to source/tests, not duplicated prose constants.
- Requested genres are exempted from diversity penalties. Warm-tone conflict
  demotion is conditional, not a blanket genre ban.
- Creator-role evidence is distinct from acting credits; unqualified "films
  by" permits directing-first fallback, while explicit roles must stay exact.
- Reference anchors are suppressed unless rewatching is intended. Contrastive
  concept/tone evidence must not be reduced to broad genre overlap.
- Preserve country-aware change/relaxation notes and stock-phrase filtering.
  Detailed historical diagnoses, tuning values, catalogue examples and UI
  rationale remain in the [snapshot recovery map](archive/2026-10-16/README.md).

### Enforcement and turn-boundary gaps (source cross-check, October 16)

- Internal TMDB candidates now retain exact release/first-air dates. The common
  `filterHardConstraints` checks format, date, year, country, known language and
  exclusions before ranking and after final metadata hydration, including reused,
  talent and specialised candidates. Missing dates are hydrated from cached TMDB
  details when possible for date-bound requests, otherwise excluded with
  request-local counts and user-facing uncertainty copy. Scope changes still
  merge prior candidates, but they must pass these gates. Missing language
  metadata remains permissive; country evidence may be discovery-derived.
  Detailed certification enforcement is separately described in
  [system patterns](systemPatterns.md#validation-and-safety-pattern).
- First-request/legacy fallback can still parse rules in the route and legacy
  LLM preferences in the engine, so their metadata can differ. Saved-spec
  follow-ups no longer enter that divergent path when understanding fails.
- Unsupported critic-source detection checks the original `description`, not
  the latest follow-up. Since chat resends that description, accepting the
  offered proxy can repeat the question; naming an unsupported source only in
  a follow-up can miss the guard. Consent/denial is not explicitly tracked.
- `appliedConstraints` unions supplied cumulative tags with current parser tags;
  it is not a canonical active spec or an enforcement trace. Frontend pivot
  handling clears some history, but replace/remove can leave obsolete tags.
- Understanding receives user messages and the previous spec, not the assistant
  question/options. Short choices rely on their own wording. Current intro
  generation does not receive the previous assistant reply; stock-phrase
  filtering does not provide general cross-turn repetition prevention.

## 2. Conversation state (implemented, conservative failure handling)

### Reliability implementation slice (October 16, locally implemented)

- Gate raw understanding before accepting its sanitised spec: require a
  recognised operation and at least one usable request signal. Non-pivot
  updates must explicitly represent populated previous fields rather than
  silently omit them. Refine/add cannot remove saved hard constraints.
- If understanding is unavailable/unusable on a follow-up with a saved spec,
  return that spec with a plain-language text clarification and do not run
  retrieval or legacy LLM parsing for an unconfirmed change. This conservative
  path does not pretend to apply the follow-up. First requests retain rules.
- Preserve exact release/first-air dates in internal candidates. For date-bound
  searches, resolve missing dates through cached TMDB details when possible,
  then gate format/date before ranking and again after final metadata hydration.
  Unknown dates are excluded with request-local diagnostic counts; widening
  copy must distinguish missing evidence from catalogue absence.
- Validated with mocked clients only. No live Gemini probes/evaluation in this
  slice; catalogue-built option work follows separately.

- The client sends `spec` (the previous `RequestSpec`) with each turn. The server returns the updated `spec`.
- `userTurns` is still sent so the rule fallback can work.
- No server-side session store is needed (the API stays stateless).
- The engine skips older `parsePreferences` when a new spec is available.
  Failed saved-spec follow-ups return clarification before the engine runs.
  Other fallback paths can still attempt legacy parsing and multiple retries.

## 3. Catalogue check, clarification and loosening (partially implemented)

- **Initial policy implemented locally October 16:** a validated spec with a
  concrete genre, tone, theme, reference, person or date direction bypasses
  first-turn clarification and attempts results. Origin/format alone do not
  trigger this spec-based override; separate legacy intent/confidence overrides
  still exist. Empty retrieval uses the existing widening flow. This is not yet
  the catalogue-count/option-building design below or a deployment claim.
- **Existing option check:** deterministic or LLM-written option strings are parsed by rules and checked with `estimateAvailableTitles`; the current minimum is 3, with a 2.5 s timeout treated as unknown/viable. This does not use the active spec or fully model specialised ranking paths. It is not a guarantee of 3 final results (Malaysian festival dramas returned 2).
- **Current transparency:** genre-filter relaxation and origin-change notes exist. A general recorded loosening plan does not.

### Planned catalogue strategy (not implemented)
- `probeCatalog(spec)` makes cheap TMDB discover calls (first page only, counts from `total_results`) and returns the number of matching titles and the genres among them.
- **When to ask:** the request has no soft preferences, more than ~500 titles match, and the top genres are spread out. Otherwise show results.
- **Options:** the top 3 genre or tone groups from the matching titles. Each option's request is checked to return at least 8 results. This replaces the fixed option templates.
- **Loosening order:**
  1. Themes.
  2. Tones beyond the first.
  3. Genres not mentioned in the latest turn.
  4. Release window.
  5. Never loosen countries or languages without saying so; prefer widening to neighbouring options only if the user agrees.

  Each step is recorded as `relaxations: { field, from, to, reason }[]`.
  Protect constraints stated in the latest turn (R4). A release window or other
  hard constraint must not be silently relaxed; ask before widening it. The
  general relaxation record and consent flow are not implemented.

## 4. Ranking (planned simplification)

The current engine still combines `RankingScorer` with post-scoring boosts,
penalties and final-selection logic. The following is the target, not a claim
that those adjustments have been retired.

- Date/format/year/origin/exclusion gates now apply across candidate sources.
  Language filtering tolerates missing metadata. Detailed certification
  enforcement is not implemented; do not treat every parsed hard field as a
  fully enforced guarantee.
- `RankingScorer` stays the single scorer. Tone and theme fit become scorer inputs instead of separate engine boosts.
- **Optional LLM re-order:** score the top 30 titles from synopsis against tone and themes on a 0–1 scale, blended into the score at about 30% weight. Results are cached per (spec, title).
- The post-scoring adjustments in `recommendationEngine.ts` (~2180–2260) are retired one at a time, each change checked against the evaluation set.

## 5. Reply (planned facts record and streaming)

Current responses may include an LLM results intro, deterministic constraint
copy and an interpretation note. Some result paths omit `assistantMessage`;
the frontend supplies its own fallback. `buildReplyFacts` and streaming are not
implemented.

`buildReplyFacts(spec, relaxations, results)` produces the facts the reply is written from:

- `understood`: a short phrase describing the request.
- `relaxed`: what was loosened, if anything.
- `coverage`: e.g. "4 Malaysian + 6 Indonesian".
- `suggestions`: follow-ups the catalogue can support.

`generateResultsIntro` writes the reply from these facts only. The prompt bans stock phrases and gets the previous reply so it doesn't repeat itself.

## Evaluation harness (`backend/eval/`)

- `cases.json`: 52 cases, each with `id`, `category`, `turns` (text or `{ choose: "<option substring>", text: "<fallback>" }`), and `expect`:
  - `countries`, `coverAllCountries`, `avoidCountries`, `languages`, `coverAllLanguages`, `yearMin` / `yearMax`;
  - `format`, `excludeGenres`, `toneConflict`, `anyGenre`, `allGenres`, `allGenresShare`;
  - `excludeTitles`, `cast`, `director`;
  - `minResults`, `clarify` (whether a clarifying question should be asked).
- `run.ts`: replays the turns against `POST /recommendations` exactly like the frontend (base query plus `clarificationContext.userTurns`). Picks options by substring and answers a question with its first option if one is asked unexpectedly. It then scores each check, writes `eval/reports/<timestamp>.json` and prints a summary.
- **Metrics:** hard-constraint check pass rate, final empty-list rate, follow-up case pass rate, tone-check pass rate, first-turn clarification appropriateness, p50 / p90 turn latency. These are proxy checks, not a semantic relevance judge. Release windows are not checked at exact-date granularity.
- **Scoring tolerances:** country/language/year/format checks accept a 90%
  matching share, actor/director checks 60%, and genre checks normally 60%.
  `avoidCountries` allows up to 50% from the avoided origins; tone checks use
  genre conflicts in the top five, not narrative tone. There is no certification
  check. Exact scoring belongs to [the runner](../backend/eval/run.ts); a passed
  case does not certify every recommendation or every hard requirement.
- **Replay caveat:** if the requested option substring is absent, the runner takes the first option. It also answers unexpected questions with the first option (up to two extra turns). That can explicitly widen an origin or change direction. Review transcripts before attributing a failed final check to state loss.
- **Reports:** baseline reports are eligible for version control; other reports are ignored local files. See [progress](progress.md) for dated results and provider caveats. No full live run covers the final October 16 candidate-reuse fix.
- The API now returns `originCountries` on each recommendation so country constraints can be checked.

## Risks

- **LLM cost and latency:** understanding, optional legacy parsing/talent recovery,
  explanations and intro generation can each invoke a provider, with SDK retries.
  The five-second goal is not an enforced whole-turn budget. Bound stage/retry
  latency and measure it; use the [verification ledger](progress.md) for evidence.
- **Inconsistent LLM output:** JSON-object mode is not provider-enforced schema.
  The new acceptance gate blocks unusable/omitted-state updates and asks rather
  than guessing on failed saved-spec follow-ups. It cannot prove the model's
  interpreted replacement/pivot matches the user's semantics; live quality
  evaluation and per-field rejection logging remain open.
- **TMDB rate limits** from catalogue checks: mitigate with first-page-only calls, cached counts and batching option checks.
