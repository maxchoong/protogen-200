import { useState, useEffect } from 'react'

interface Recommendation {
  id: string
  title: string
  year: string
  type: string
  synopsis?: string
  whyThis?: string
  posterUrl?: string
  availability?: {
    platform: string
    type: string
    link?: string
  }[]
  trailerUrl?: string
}

interface TurnOperation {
  continuity: 'continue' | 'soft_pivot' | 'hard_pivot'
  operation: 'narrow' | 'widen' | 'replace'
  confidence: number
  rationaleTags: string[]
}

interface ResultsPageProps {
  results: Recommendation[]
  query: string
  passIndex: number
  passCount: number
  triggerText?: string
  turnOperation?: TurnOperation
  requiresDirectionConfirmation?: boolean
  directionConfirmationChoice?: 'keep_direction' | 'pivot_direction'
  confirmationTrace?: {
    fromChoice: 'keep_direction' | 'pivot_direction'
    outcomeContinuity?: TurnOperation['continuity']
    aligned: boolean
  }
  activeConstraints?: string[]
  refinementSuggestions?: string[]
  retrievalDiagnostics?: {
    tmdbEnabled: boolean
    usedTmdb: boolean
    usedOmdb: boolean
    omdbFallbackUsed: boolean
  }
  onPreviousPass: () => void
  onNextPass: () => void
}

const formatTurnOperation = (turnOperation?: TurnOperation): string => {
  if (!turnOperation) {
    return 'Initial pass'
  }

  const continuity = turnOperation.continuity.replace('_', ' ')
  return `${continuity} + ${turnOperation.operation}`
}

export default function ResultsPage({
  results,
  query,
  passIndex,
  passCount,
  triggerText,
  turnOperation,
  requiresDirectionConfirmation,
  directionConfirmationChoice,
  confirmationTrace,
  activeConstraints = [],
  refinementSuggestions = [],
  retrievalDiagnostics,
  onPreviousPass,
  onNextPass
}: ResultsPageProps) {
  const [trailerModal, setTrailerModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  })

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && trailerModal.isOpen) {
        closeTrailer()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [trailerModal.isOpen])

  const openTrailer = (url: string, title: string) => {
    const videoId = url.split('v=')[1]?.split('&')[0]
    if (videoId) {
      setTrailerModal({
        isOpen: true,
        url: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
        title
      })
    }
  }

  const closeTrailer = () => {
    setTrailerModal({ isOpen: false, url: '', title: '' })
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-text-muted">Current curated pass</p>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
            <div>
              <h2 className="font-serif text-2xl font-medium tracking-[-0.02em] text-text">Recommendations</h2>
              <p className="mt-1 text-sm text-text-muted">
                {passCount > 0 ? `Pass ${passIndex + 1} of ${passCount}` : 'No passes yet'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onPreviousPass}
                disabled={passCount === 0 || passIndex <= 0}
                className="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs text-text transition-colors hover:border-accent disabled:opacity-50"
                aria-label="Previous recommendation pass"
              >
                Previous pass
              </button>
              <button
                onClick={onNextPass}
                disabled={passCount === 0 || passIndex >= passCount - 1}
                className="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs text-text transition-colors hover:border-accent disabled:opacity-50"
                aria-label="Next recommendation pass"
              >
                Next pass
              </button>
            </div>
          </div>
        </div>

        {query && (
          <div className="mb-5 rounded-lg border border-border bg-surface p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.14em] text-text-muted">Based on</p>
            <p className="mt-1 text-sm text-text">{query}</p>
            {triggerText && triggerText !== query && (
              <p className="mt-2 text-xs text-text-muted">Latest note: {triggerText}</p>
            )}
            <p className="mt-2 text-xs text-text-muted">Turn type: {formatTurnOperation(turnOperation)}</p>
            {requiresDirectionConfirmation && !directionConfirmationChoice && (
              <p className="mt-2 rounded-sm border border-amber-300/40 bg-amber-100/10 px-2 py-1 text-xs text-amber-100">
                Quick check pending in the conversation: stay close to this lane, or take a bigger swing.
              </p>
            )}
            {directionConfirmationChoice && (
              <p className="mt-2 text-xs text-text-muted">
                Direction set: {directionConfirmationChoice === 'keep_direction' ? 'Stay close to this lane' : 'Take a bigger swing'}
              </p>
            )}
            {confirmationTrace && (
              <p
                className={`mt-2 text-xs ${confirmationTrace.aligned ? 'text-emerald-300' : 'text-amber-200'}`}
              >
                Check-in: you picked {confirmationTrace.fromChoice === 'keep_direction' ? 'stay close to this lane' : 'take a bigger swing'}, and the next pass came back as {confirmationTrace.outcomeContinuity?.replace('_', ' ') || 'unknown'} {confirmationTrace.aligned ? '(aligned)' : '(diverged)'}. 
              </p>
            )}
          </div>
        )}

        {activeConstraints.length > 0 && (
          <div className="mb-5 rounded-lg border border-border bg-surface p-4 shadow-card">
            <p className="mb-2 text-xs uppercase tracking-[0.14em] text-text-muted">Active direction</p>
            <div className="flex flex-wrap gap-2">
              {activeConstraints.map((constraint, idx) => (
                <span
                  key={`${constraint}-${idx}`}
                  className="rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs text-text"
                >
                  {constraint}
                </span>
              ))}
            </div>
          </div>
        )}

        {refinementSuggestions.length > 0 && (
          <div className="mb-5 rounded-lg border border-border bg-surface p-4 shadow-card">
            <p className="mb-2 text-xs uppercase tracking-[0.14em] text-text-muted">Suggested follow-ups</p>
            <div className="flex flex-wrap gap-2">
              {refinementSuggestions.map((suggestion, idx) => (
                <span
                  key={`${suggestion}-${idx}`}
                  className="rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs text-text-muted"
                >
                  {suggestion}
                </span>
              ))}
            </div>
          </div>
        )}

        {retrievalDiagnostics && (
          <details className="mb-5 rounded-lg border border-border bg-surface p-4 shadow-card">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-text-muted">Diagnostics</summary>
            <p className="mt-3 text-sm text-text-muted">
              {retrievalDiagnostics.omdbFallbackUsed
                ? 'OMDB fallback engaged (TMDB was available but returned no usable candidates).'
                : !retrievalDiagnostics.tmdbEnabled && retrievalDiagnostics.usedOmdb
                  ? 'Using OMDB because TMDB is not configured in this environment.'
                  : retrievalDiagnostics.usedTmdb && !retrievalDiagnostics.usedOmdb
                    ? 'Using TMDB retrieval.'
                    : retrievalDiagnostics.usedTmdb && retrievalDiagnostics.usedOmdb
                      ? 'Using mixed TMDB + OMDB retrieval.'
                      : 'Catalog source unavailable for this response.'}
            </p>
          </details>
        )}

        {results.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-card" role="status" aria-live="polite">
            <p className="text-sm text-text-muted">No recommendations yet. Continue the conversation to generate your first curated pass.</p>
          </div>
        ) : (
          <div className="grid gap-5" role="list" aria-label="Movie and TV show recommendations">
            {results.map((rec) => (
              <article
                key={rec.id}
                className="overflow-hidden rounded-lg border border-border bg-surface shadow-card transition-shadow hover:shadow-card-hover"
                role="listitem"
              >
                <div className="p-5">
                  <div className="flex gap-4">
                    {rec.posterUrl ? (
                      <img
                        src={rec.posterUrl}
                        alt={`${rec.title} poster`}
                        className="h-44 w-28 flex-shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="flex h-44 w-28 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-muted"
                        role="img"
                        aria-label="No poster available"
                      >
                        No poster
                      </div>
                    )}

                    <div className="flex-1">
                      <h3 className="mb-1 font-serif text-xl font-medium tracking-[-0.02em] text-text">{rec.title}</h3>
                      <p className="mb-3 text-xs text-text-muted">{rec.year} • {rec.type}</p>

                      {rec.synopsis && (
                        <p className="mb-3 text-sm text-text-muted">{rec.synopsis}</p>
                      )}

                      {rec.whyThis && (
                        <div className="mb-3 rounded-lg border border-border bg-surface-2 p-3" role="complementary" aria-label="Recommendation explanation">
                          <p className="mb-1 text-xs uppercase tracking-[0.12em] text-text-muted">Why this</p>
                          <p className="text-sm text-text-muted">{rec.whyThis}</p>
                        </div>
                      )}

                      <div className="mb-3">
                        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-text-muted">Where to stream</p>
                        {rec.availability && rec.availability.length > 0 ? (
                          <div className="flex flex-wrap gap-2" role="list" aria-label="Streaming platforms">
                            {rec.availability.map((avail, idx) => (
                              avail.link ? (
                                <a
                                  key={idx}
                                  href={avail.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs text-text transition-colors hover:border-accent"
                                  role="listitem"
                                >
                                  {avail.platform} ({avail.type})
                                </a>
                              ) : (
                                <span
                                  key={idx}
                                  className="rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs text-text"
                                  role="listitem"
                                >
                                  {avail.platform} ({avail.type})
                                </span>
                              )
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-text-muted">Availability info not available.</p>
                        )}
                      </div>

                      {rec.trailerUrl && (
                        <button
                          onClick={() => openTrailer(rec.trailerUrl!, rec.title)}
                          className="rounded-pill border border-border bg-surface-2 px-4 py-1.5 text-xs text-text transition-colors hover:border-accent"
                          aria-label={`Watch trailer for ${rec.title}`}
                        >
                          View trailer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {trailerModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={closeTrailer}
          role="dialog"
          aria-modal="true"
          aria-labelledby="trailer-title"
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-surface shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 id="trailer-title" className="text-xl font-semibold tracking-[-0.03em] text-text">
                {trailerModal.title} - Trailer
              </h2>
              <button
                onClick={closeTrailer}
                className="rounded text-2xl leading-none text-text-muted transition-colors hover:text-text"
                aria-label="Close trailer"
              >
                ×
              </button>
            </div>

            <div className="relative" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 h-full w-full"
                src={trailerModal.url}
                title={`${trailerModal.title} Trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="border-t border-border p-4 text-center">
              <button
                onClick={closeTrailer}
                className="rounded-pill border border-border bg-surface-2 px-6 py-2 text-text transition-colors hover:border-accent"
                aria-label="Close trailer modal"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
