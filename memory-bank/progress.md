# Verification ledger and general backlog

Status: current evidence owner. Updated: October 16, 2026.
Implementation checklists belong to [feature tasks](tasks-conversational-engine.md).
Original detailed checklists remain in the [historical snapshot](archive/2026-10-16/progress.md).

## Latest verification

| Date | Scope | Evidence | Result and boundary |
|---|---|---|---|
| October 16, progressive delivery refinement | Critical-path reduction, 15-second ceiling, POST SSE, lazy trailers and timing/eval diagnostics | Full backend Jest suite; backend/frontend `build`/`lint`; separate eval `tsc --noEmit`; `backend/node_modules/.bin/tsx --test frontend/tests/recommendationStream.test.ts`; documentation audit/tests | 497/497 backend tests across 16 suites, 8/8 frontend stream tests and 13/13 documentation tests pass; both builds/lints and eval type-check pass. Tests cover completion after five seconds, exact 15-second timeout, SSE progress before terminal state, one terminal error/timeout, JSON compatibility, disconnect cancellation, fragmented UTF-8/CRLF, malformed/interrupted streams and final constraint gates. A local mock-server eval proves a timed-out follow-up fails even when earlier titles satisfy all content checks; scratch report removed. No new live recommendation/Gemini calls or deployment acceptance. |
| October 16, progressive delivery refinement | Mocked browser interaction | Temporary local frontend HTTP 200; integrated browser with mocked recommendation/availability/trailer responses | Actual progress visible before any result, checked title shown only after terminal event, zero trailer calls before details and one after open. Cancel aborted a pending refinement; retry sent the same saved spec and added no result round. New-chat reset aborted work and the next request omitted prior state. Browser mocks/page cleared and helper server stopped. This is UI/transport evidence, not semantic quality, live provider speed or proxy-flushing certification. |
| October 16, 16:09 BST, targeted live check | `gritty-crime`, fresh local backend, sequential concurrency 1 | `npm --prefix backend run eval -- --base http://localhost:3017 --only gritty-crime --concurrency 1 --label deadline-targeted-gritty`; report `2026-10-16T15-09-25-650Z-deadline-targeted-gritty.json` | 0/1 cases passed; one turn, 5,085 ms client latency, explicit `search_timeout`, no results. Gemini `gemini-3.5-flash-lite` understanding hit its 4-second deadline (4,003 ms); legacy preference parsing was skipped without another dispatch because the shared window was exhausted. Logs show fallback TMDB discovery and ranking began before the outer deadline stopped work. No 429/503 was observed; quota reset/provider health are not established by an aborted request. Stopped after this first failure rather than spending quota on the remaining planned cases; temporary backend stopped. No returned titles to assess for semantic quality. |
| October 16, whole-turn deadline slice | Recommendation deadline, provider bodies/caches, HTTP disconnect and browser abort wiring | `npm --prefix backend test -- --runInBand --silent`; backend/frontend `build`/`lint`; separate eval `tsc --noEmit` as below; documentation tests/audit | 485/485 tests across 15 suites; builds/lints and eval type-check pass. Targeted fake-clock tests verify no reply before 4,999 ms and `search_timeout` at 5,000 ms, preserved original spec, no partial titles/widening, late-result rejection, expired-preview cache protection, body cancellation and clean retries after aborted cache loads. Real local HTTP disconnect and real SDK with mocked fetch are covered. No provider calls, successful browser interaction test, deployment or live quality/latency acceptance. |
| October 16, latency slice | Shared LLM deadline, SDK transport, preview scheduling and diagnostics | Full backend Jest suite; backend/frontend `build`/`lint`; separate eval `tsc --noEmit` as below | 466/466 tests across 13 suites; builds/lints and eval type-check pass. Real SDK with mocked fetch verifies one dispatch on 429/503 and in-flight abort at the shared deadline. Fake-clock tests cover all completion stages, fractional deadlines, cached answers, concurrent-request isolation, late-output rejection and incomplete catalogue checks. No live provider, browser or deployment verification. |
| October 16, catalogue-choice slice | Local backend, frontend and replay contract | `npm --prefix backend test -- --runInBand --silent`; backend and frontend `build`/`lint`; from backend, `tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --esModuleInterop --skipLibCheck --resolveJsonModule eval/run.ts` | 448/448 tests across 12 suites; both builds/lints and separate eval type-check pass. Added scoped genre choices, distinct-title thresholds, thin/specialised-path checks, no-LLM/trailer previews, selected widening, stale-token preservation and broad browsing regressions. No live Gemini/catalogue evaluation or deployment acceptance. |
| October 16, reliability slice | Local backend usable-spec/saved-state and final-candidate gates | `npm --prefix backend test -- --runInBand`; `npm --prefix backend run build`; `npm --prefix backend run lint` | 410/410 tests across 11 suites, build/lint passed. Existing Jest open-handles warning remains. Mocked/local evidence only; no fresh live quality, browser or deployment certification. |
| October 16, earlier | Local backend, after final candidate-reuse fix | `npm test -- --runInBand`; `npm run lint`; `npm run build` in backend | 375/375 tests, lint and build passed. Superseded locally by the reliability slice below, not by a fresh live-quality evaluation. |
| October 16, catalogue-choice slice | Browser interaction attempt | Temporary local frontend HTTP 200; mocked Playwright check attempted | Not verified: shared MCP browser was already in use; separate integrated browser could not reach localhost (`ERR_CONNECTION_REFUSED`). No application interaction assertions completed. Temporary server stopped and isolated page cleared; no provider requests made. |
| October 16 | Documentation reconciliation | Local-link/fence and documentation diff checks | Passed on the pre-migration docs. No application tests or provider calls made for that refresh. |

Documentation-migration verification is recorded separately below; it must not
change the date/scope of application or provider verification.

Latest documentation validation: `npm --prefix backend run check:docs`,
`npm --prefix backend run test:docs` and `git diff --check` pass; all six preserved
snapshot hashes remain unchanged; documentation tests pass 13/13. Local
implementation is not live-quality or successful-five-second-response acceptance.
The latest provisional 15-second server-work ceiling (five-second soft target)
wraps the four-second LLM window and 1.5-second preview scheduling window; it cancels in-flight catalogue I/O and
returns an incomplete-search clarification, not a promised recommendation set.
Token signing currently assumes one issuing process. Existing Jest open-handle warnings are historical,
not a fresh finding in the latest silent run.

## Evaluation record

| Run | Cases passing | Hard checks | Genre checks | Tone checks | Clarification | Follow-up cases | p50 / p90 |
|---|---:|---:|---:|---:|---:|---:|---|
| October 15 baseline, 52 cases | 69% | 91% | 89% | 92% | 62% | 85% | 4.8 s / 11.2 s |
| October 16 phase2b, 52 cases | 65% | 96% | 84% | 77% | 62% | 77% | 12.8 s / 26.8 s |
| October 16 phase2c, 52 cases | 79% | 93% | 97% | 85% | 90% | 69% | 24.9 s / 41.3 s |

All three ended with non-empty final lists, sometimes after automatically
answering clarification/widening options. This does not prove that the original
request always returns matches. Checks are proxies, not a semantic judge or a
pure intent-understanding measurement. Baseline concurrency was 2; October 16
full runs used 1. Initial clarification fell from 40% baseline to 13% in phase2c.

Reports in `backend/eval/reports/` (local evidence, not required documentation links):

- `baseline-2026-10-15.json`: tracked baseline report.
- `2026-10-15T13-33-39-549Z-phase2.json`: earlier 60% pass run, contaminated
  by 429s and fallback; not a reliable quality comparison.
- `2026-10-16T09-32-52-596Z-phase2b.json`: two understanding timeouts, no 429s.
- `2026-10-16T10-07-37-543Z-phase2c.json`: 22 understanding failures/73 turns;
  20 timeout and 8 HTTP 503 errors across LLM stages, no 429s.
- `2026-10-16T10-12-17-864Z-phase2d-followups.json`: 1/2 cases pass after the
  candidate-reuse fix. 90s sci-fi passes; French follow-up encountered 503/429
  and fell back.
- `2026-10-16T15-09-25-650Z-deadline-targeted-gritty.json`: user-authorised
  single-case live check after deadline work; 0/1, explicit incomplete-search
  reply at 5,085 ms after understanding exhausted its four-second window.
  The harness calls this an empty-result case, but it is a timeout, not evidence
  of no catalogue matches. There was no automatic option replay or second turn.

Only baseline reports are eligible for version control; other runs are
ignored local files. These summaries persist independently of those files.
No full live evaluation covers the final reuse fix or deadline work. The latest
bounded live check ended at the understanding deadline, without a successful
LLM response or observed 429/503; quota reset and continuing health are unknown.
Quality/latency acceptance remains open. Run instructions and harness limitations
belong to the [backend README](../backend/README.md) and [design](design-conversational-engine.md).

## General backlog

These are carried-forward open items, not new acceptance claims. Engine work
is tracked separately in feature tasks; do not maintain duplicate checklists.

- Detailed certification/max-rating enforcement and consistent final safety
  checks across recommendations, references, highlights and details. Existing
  rating-label blocks help only when metadata is present; see
  [current safety boundaries](systemPatterns.md#validation-and-safety-pattern).
- Spoiler-safe synopsis helpers are not fully wired into the response guarantee.
- Automated critics-proxy/unsupported-source and interpretation-note regressions.
- Automated highlight-details route and frontend cache/fallback coverage.
- Browser cache freshness, country-aware availability keys and retry after
  failed enrichment; session-cached empty/fallback values currently outlive
  backend TTLs. See [frontend behaviour](../frontend/README.md#state-and-lazy-enrichment).
- Runtime request-shape validation (beyond empty/minimum-length checks) and a
  production-configurable, reliable OMDb fallback; fixed testing configuration
  is not a production availability guarantee.
- Full multi-turn browser/deployed smoke pass and conversational-naturalness
  checks after recent engine changes, plus an accessibility audit.
- UI visual/interaction regressions: clarification states, shared button
  variants across themes, highlight hover lift/edge clipping, and details panels.
- Reassess metadata-rail density; consider a typed shared Button component only
  if useful, not as an incidental refactor.
- Earlier trailer/availability paths were exercised, but local configuration
  and end-to-end deployment coverage must be checked when working on them;
  old unchecked TMDB setup items are not silently marked done.
- Superseded setup summaries were reconciled; future changes must update their
  owners. Legacy snapshots remain historical rather than endlessly refreshed.
- Accounts, long-term profiles and watchlists remain outside current scope.
  Broader future features require their own product decision.
- Recommendation-review skill implementation/validation exists; its recorded
  final sign-off remains pending in [review tasks](recommendation-review-skill/tasks.md).

## Documentation migration

Scope: workspace documentation, agent context routing and a dependency-free
documentation checker only; no application changes or live provider calls.
Preservation evidence: [snapshot manifest and recovery map](archive/2026-10-16/README.md).

October 16 local verification:

- `npm --prefix backend run test:docs`: 13/13 tests pass, including broken
  links/fences, missing owners/status, tampered/missing snapshots and context
  budget warnings. Tests create and remove isolated temporary fixtures.
- `npm --prefix backend run check:docs`: 31 Markdown documents checked, all six
  original snapshot hashes match; no errors or budget warnings.
- Default entry set at migration completion (workspace instructions, index,
  rules, handoff): 1,382
  whitespace-delimited words, versus the former 20,368-word root-memory read-all
  set (about 93% less startup text, before task-specific loading).
  Active context is 557 words, down from 3,920.
- Scoped `git diff --check` passes. Existing unrelated application/frontend
  edits remain untouched; no commit or fresh application/provider certification.
- [CI](../.github/workflows/ci.yml) now runs checker tests and the documentation
  audit in a dependency-free Node 20 job on push/pull request. The job is
  configured, not claimed to have run on GitHub.

Checks cover simple local inline links (historical snapshot links use original
source paths), fence balance, current memory-owner discoverability and status,
snapshot bytes and soft context budgets. They do not prove prose truth, external
URL/heading validity, complete Markdown/YAML syntax or application/provider
health. Current owners must be reachable without traversing archived documents.

## Code/documentation cross-check

Historical findings at review time; the later reliability slice below resolves
some gaps, without claiming the entire backlog is fixed.

October 16, after the structure migration: static source/test review of
recommendation routes, structured spec/parser, retrieval/ranking, LLM/TMDB/OMDb/
streaming clients, frontend submission/state/details/cache, evaluation scoring,
package/CI configuration and archived open-item lists.

| Classification | Discrepancy and disposition | Authoritative owner / source evidence |
|---|---|---|
| Inaccurate | Availability was described as recommendation-time batch work; it is lazy, details-triggered work. Corrected architecture and documented the previously missing HTTP endpoints. | [Backend API guide](../backend/README.md#api-endpoints), [engine](../backend/src/engine/recommendationEngine.ts), [details UI](../frontend/src/pages/ResultsPage.tsx) |
| Inaccurate | Validation was overstated as malformed-spec rejection and full request-shape validation. Sanitisation can accept empty/incomplete objects; continuity work now includes this gap. | [Engine design](design-conversational-engine.md), [validator and tests](../backend/src/engine/__tests__/requestSpec.test.ts), [route](../backend/src/index.ts) |
| Missing | Exact release-date/format enforcement, fallback route/engine divergence and historical constraint-tag limitations were not explicit. Added implementation boundaries and open tasks, not application fixes. | [Engine design](design-conversational-engine.md#enforcement-and-turn-boundary-gaps-source-cross-check-october-16), [engine](../backend/src/engine/recommendationEngine.ts), [parser](../backend/src/engine/preferenceParser.ts) |
| Inaccurate | Safety summaries hid metadata-dependent label blocking and lack of per-user rating/final-path enforcement. Corrected without claiming a comprehensive safety certification. | [Safety boundaries](systemPatterns.md#validation-and-safety-pattern), [candidate conversion/filtering](../backend/src/engine/recommendationEngine.ts) |
| Missing | Critic-source checking uses the original query; follow-up consent can loop or be missed. Assistant question/prior-reply context is absent from understanding/intro calls. Tracked as unfinished work. | [Feature tasks](tasks-conversational-engine.md), [route](../backend/src/index.ts), [LLM calls](../backend/src/clients/llm.ts) |
| Missing | Session-cache failure/region behaviour and local visual controls were absent from current guidance; OMDb's legacy keyless description was misleading. Documented actual behaviour and reliability caveats. | [Frontend guide](../frontend/README.md), [technical context](techContext.md), [OMDb client](../backend/src/clients/fmdb.ts) |
| Inaccurate | Evaluation pass labels concealed permissive per-title thresholds; some references implied undated lint success or deployment. Added scoring tolerances and separated local implementation from dated verification/deployment. | [Evaluation design](design-conversational-engine.md#evaluation-harness-backendeval), [runner](../backend/eval/run.ts), latest verification above |
| Historical-only / intentionally omitted | Archived unchecked tasks were accounted for in current feature/general backlogs; detailed tuning constants, old UI iterations and dated diagnoses remain in snapshots/source rather than the startup handoff. No additional lost open item identified in the inspected lists. | [Recovery map](archive/2026-10-16/README.md), [feature tasks](tasks-conversational-engine.md), general backlog above |

The source review found inaccurate/missing current guidance, not lost snapshot
bytes. Static evidence is not a fresh behavioural test: existing tests cover
normalisation, spec round-trip, fallback retaining the prior spec, option
pruning, request-local genre notes and fresh retrieval on a year refinement.
They do not establish the newly listed end-to-end guarantees. No application
tests, live providers, browser journeys or deployed configuration were exercised
for this cross-check; neither every source line nor every historical claim was
exhaustively revalidated. Application changes and immutable snapshots were left
untouched.

Post-audit validation: `npm --prefix backend run check:docs` passed across 31
documents and all six unchanged snapshots; `npm --prefix backend run test:docs`
passed 13/13. Scoped `git diff --check` passed. The tracked application-source
diff fingerprint matched before/after the audit. Default startup text is now
1,412 words, including a link to this review; the handoff is 587 words.

## Reliability implementation slice

October 16, after the cross-check. User authorised implementation with caution
about Gemini quota; **no Gemini/provider probes or live evaluations were made**.

- `assessSpecTurn` rejects unusable raw updates before normalisation can
  replace state: invalid shapes/operation, empty search direction, omitted
  populated saved fields and implicit hard-constraint loosening on refine/add.
  Explicit remove/replace/pivot remain available. Reason-level warnings are
  emitted; complete per-field rejection diagnostics remain open.
- Failed/unusable understanding on a saved-spec follow-up returns unchanged
  state and an explicit text clarification without engine retrieval or a second
  legacy LLM parse. First-request/legacy rule fallback remains. This trades
  availability of offline refinements for honest state preservation; it does
  not claim to have applied the failed turn.
- Exact release/first-air dates are retained or hydrated through cached TMDB
  details for date-bound candidates. A common gate applies date, format, year,
  origin, known language and exclusions before ranking and after final detail
  enrichment. Missing dates are excluded, counted per request and explained
  without claiming there are certainly no catalogue matches.
- Added local regressions cover state failure/disabled provider, malformed
  updates, explicit removal/replacement/pivot, inclusive date bounds, missing
  evidence, old-result reuse, filmographies, critics-year retrieval, final
  enrichment changes, TV dates and unchanged no-window behaviour. Existing
  ranking-only fixtures now include movie type required by the new gate.
- Validation: backend 410/410 tests, lint/build passed; documentation tests
  13/13, audit passed over 31 documents and six unchanged snapshots, scoped
  whitespace checks passed. Default entry set is 1,467 words; active context
  642 words. No frontend source, credentials, dependencies or archives changed.

Catalogue-built/spec-aware options are **not** implemented by this slice.
Next work remains phase 3 plus latency budgeting; detailed certification,
proxy-consent state, browser cache issues, first/legacy fallback parity and
healthy-provider quality acceptance are still outstanding. New date hydration
can add TMDB work when evidence is missing; latency impact is not live-measured.
