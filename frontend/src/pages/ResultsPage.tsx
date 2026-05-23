import { useState, useEffect } from 'react'

interface Recommendation {
  id: string
  title: string
  year: string
  type: string
  genres?: string[]
  originalLanguage?: string
  certification?: string
  runtimeMinutes?: number
  rating?: number
  voteCount?: number
  mainCast?: string[]
  directors?: string[]
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
  activeConstraints?: string[]
  interpretationNote?: string
  retrievalDiagnostics?: {
    tmdbEnabled: boolean
    usedTmdb: boolean
    usedOmdb: boolean
    omdbFallbackUsed: boolean
  }
  onPreviousPass: () => void
  onNextPass: () => void
}

const editorialHighlights = [
  { title: 'Quiet Rebellion', note: 'Character-forward drama', palette: 'from-[#d8d0c4] to-[#bdb0a0]' },
  { title: 'Afterglow City', note: 'Noir mood, modern pacing', palette: 'from-[#bec8d2] to-[#8fa2b6]' },
  { title: 'Winter Static', note: 'Minimal thriller tension', palette: 'from-[#ced2d9] to-[#a4adb9]' },
  { title: 'Neon Orchard', note: 'Playful genre blend', palette: 'from-[#d8c8bc] to-[#b89b87]' },
  { title: 'The Last Ferry', note: 'Slow-burn mystery', palette: 'from-[#c7d0cc] to-[#95aaa1]' },
  { title: 'Paper Moons', note: 'Warm, intimate storytelling', palette: 'from-[#d7cdc2] to-[#b4a08f]' }
]

const formatTurnOperation = (turnOperation?: TurnOperation): string => {
  if (!turnOperation) {
    return 'Initial round'
  }

  const continuity = turnOperation.continuity.replace('_', ' ')
  return `${continuity} + ${turnOperation.operation}`
}

const formatRuntime = (runtimeMinutes?: number): string | null => {
  if (!runtimeMinutes || runtimeMinutes <= 0) {
    return null
  }

  const hours = Math.floor(runtimeMinutes / 60)
  const minutes = runtimeMinutes % 60

  if (hours === 0) {
    return `${minutes}m`
  }

  if (minutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${minutes}m`
}

const formatVoteCount = (voteCount?: number): string | null => {
  if (!voteCount || voteCount <= 0) {
    return null
  }

  return voteCount.toLocaleString()
}

const languageDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'language' })
    : null

const formatLanguageName = (languageCode?: string): string | null => {
  if (!languageCode) {
    return null
  }

  const normalized = languageCode.toLowerCase()
  const fullName = languageDisplayNames?.of(normalized)
  if (fullName && fullName.toLowerCase() !== normalized) {
    return fullName
  }

  return normalized.toUpperCase()
}

export default function ResultsPage({
  results,
  query,
  passIndex,
  passCount,
  triggerText,
  turnOperation,
  activeConstraints = [],
  interpretationNote,
  retrievalDiagnostics,
  onPreviousPass,
  onNextPass
}: ResultsPageProps) {
  const [trailerModal, setTrailerModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  })
  const [roundMenuOpen, setRoundMenuOpen] = useState(false)

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
    <div className="editorial-results-scroll h-full overflow-y-auto px-4">
      <div className="mx-auto max-w-3xl">
        {passCount > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-border">
              <h2 className="font-serif text-2xl font-medium tracking-[-0.02em] text-text">Recommendations</h2>
              <div className="relative">
                <button
                  onClick={() => setRoundMenuOpen(!roundMenuOpen)}
                  className="p-1 transition-opacity hover:opacity-70"
                  aria-label="Round selection menu"
                  title="Select round"
                >
                  <svg
                    className="h-5 w-5 text-text"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>

                {roundMenuOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-surface shadow-card z-10">
                    <div className="p-2">
                      {Array.from({ length: passCount }).map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            if (idx < passIndex) {
                              for (let i = 0; i < passIndex - idx; i++) {
                                onPreviousPass()
                              }
                            } else if (idx > passIndex) {
                              for (let i = 0; i < idx - passIndex; i++) {
                                onNextPass()
                              }
                            }
                            setRoundMenuOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                            idx === passIndex
                              ? 'bg-accent text-text font-medium'
                              : 'text-text hover:bg-surface-2'
                          }`}
                        >
                          Round {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {query && (
          <details className="mb-8">
            <summary className="cursor-pointer flex items-center gap-2 pb-3 border-b border-border mb-4">
              <span className="text-xs uppercase tracking-[0.14em] text-text-muted font-medium">
                Why This Recommendation
              </span>
            </summary>
            <div className="space-y-4 pl-0">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-text-muted mb-2">Based on</p>
                <p className="text-sm text-text">{query}</p>
                {triggerText && triggerText !== query && (
                  <p className="mt-2 text-xs text-text-muted">Latest note: {triggerText}</p>
                )}
              </div>

              {activeConstraints.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-text-muted mb-2">Active direction</p>
                  <div className="flex flex-wrap gap-2">
                    {activeConstraints.map((constraint, idx) => (
                      <span
                        key={`${constraint}-${idx}`}
                        className="bg-surface-2 px-2 py-1 text-xs text-text rounded"
                      >
                        {constraint}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {interpretationNote && (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-text-muted mb-2">Interpretation</p>
                  <p className="text-sm text-text-muted">{interpretationNote}</p>
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-text-muted mb-2">Turn type</p>
                <p className="text-sm text-text-muted">{formatTurnOperation(turnOperation)}</p>
              </div>

              {retrievalDiagnostics && (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-text-muted mb-2">Data source</p>
                  <p className="text-sm text-text-muted">
                    {retrievalDiagnostics.omdbFallbackUsed
                      ? 'OMDB fallback (TMDB available but no candidates)'
                      : !retrievalDiagnostics.tmdbEnabled && retrievalDiagnostics.usedOmdb
                        ? 'OMDB (TMDB not configured)'
                        : retrievalDiagnostics.usedTmdb && !retrievalDiagnostics.usedOmdb
                          ? 'TMDB'
                          : retrievalDiagnostics.usedTmdb && retrievalDiagnostics.usedOmdb
                            ? 'TMDB + OMDB'
                            : 'Unavailable'}
                  </p>
                </div>
              )}
            </div>
          </details>
        )}

        {results.length === 0 ? (
          <div className="space-y-6" role="status" aria-live="polite">
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3" role="list" aria-label="System highlight titles">
              {editorialHighlights.map((item, idx) => (
                <article key={`${item.title}-${idx}`} className="space-y-3" role="listitem">
                  <div className={`aspect-[2/3] rounded-lg bg-gradient-to-b ${item.palette} shadow-card`} aria-hidden="true" />
                  <p className="text-sm font-medium leading-snug tracking-[-0.01em] text-text">{item.title}</p>
                  <p className="text-xs leading-relaxed tracking-[-0.004em] text-text-muted">{item.note}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-6" role="list" aria-label="Movie and TV show recommendations">
            {results.map((rec, index) => (
              <article
                key={rec.id}
                className="overflow-hidden rounded-lg bg-surface shadow-card transition-shadow hover:shadow-card-hover"
                role="listitem"
              >
                <div className="p-6">
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
                        className="flex h-44 w-28 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted"
                        role="img"
                        aria-label="No poster available"
                      >
                        No poster
                      </div>
                    )}

                    <div className="flex-1">
                      <h3 className="mb-1 font-serif text-xl font-medium tracking-[-0.02em] text-text">{rec.title}</h3>
                      <p className="mb-4 text-xs text-text-muted">{rec.year} • {rec.type}</p>

                      <div className="mb-4 flex flex-wrap gap-2 text-xs text-text-muted">
                        {typeof rec.rating === 'number' && rec.rating > 0 && (
                          <span className="bg-surface-2 px-2 py-1 rounded">
                            {rec.rating.toFixed(1)}/10
                            {formatVoteCount(rec.voteCount) ? ` • ${formatVoteCount(rec.voteCount)} votes` : ''}
                          </span>
                        )}
                        {formatRuntime(rec.runtimeMinutes) && (
                          <span className="bg-surface-2 px-2 py-1 rounded">
                            {formatRuntime(rec.runtimeMinutes)}
                          </span>
                        )}
                        {rec.certification && (
                          <span className="bg-surface-2 px-2 py-1 rounded">
                            {rec.certification}
                          </span>
                        )}
                      </div>

                      {(rec.mainCast?.length || rec.directors?.length) ? (
                        <p className="mb-4 text-xs text-text-muted">
                          {rec.mainCast && rec.mainCast.length > 0 ? `Cast: ${rec.mainCast.slice(0, 2).join(', ')}` : ''}
                          {rec.mainCast && rec.mainCast.length > 0 && rec.directors && rec.directors.length > 0 ? ' • ' : ''}
                          {rec.directors && rec.directors.length > 0 ? `Director: ${rec.directors[0]}` : ''}
                        </p>
                      ) : null}

                      {(rec.genres?.length || rec.originalLanguage || rec.mainCast?.length || rec.directors?.length) ? (
                        <details className="mb-4 rounded-lg bg-surface-2 px-3 py-2" open={index === 0}>
                          <summary className="cursor-pointer text-xs uppercase tracking-[0.12em] text-text-muted">
                            Details
                          </summary>
                          <div className="mt-2 space-y-2 text-xs text-text-muted">
                            {rec.genres && rec.genres.length > 0 && (
                              <p>
                                <span className="font-medium text-text">Genres:</span> {rec.genres.slice(0, 4).join(', ')}
                              </p>
                            )}
                            {formatLanguageName(rec.originalLanguage) && (
                              <p>
                                <span className="font-medium text-text">Language:</span> {formatLanguageName(rec.originalLanguage)}
                              </p>
                            )}
                            {rec.mainCast && rec.mainCast.length > 0 && (
                              <p>
                                <span className="font-medium text-text">Main cast:</span> {rec.mainCast.slice(0, 3).join(', ')}
                              </p>
                            )}
                            {rec.directors && rec.directors.length > 0 && (
                              <p>
                                <span className="font-medium text-text">Director:</span> {rec.directors.join(', ')}
                              </p>
                            )}
                          </div>
                        </details>
                      ) : null}

                      {rec.synopsis && (
                        <p className="mb-4 text-sm text-text-muted">{rec.synopsis}</p>
                      )}

                      {rec.whyThis && (
                        <div className="mb-4 rounded-lg bg-surface-2 p-3" role="complementary" aria-label="Recommendation explanation">
                          <p className="mb-1 text-xs uppercase tracking-[0.12em] text-text-muted">Why this</p>
                          <p className="text-sm text-text-muted">{rec.whyThis}</p>
                        </div>
                      )}

                      <div className="mb-4">
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
                                  className="rounded-pill bg-surface-2 px-3 py-1 text-xs text-text transition-colors hover:opacity-80"
                                  role="listitem"
                                >
                                  {avail.platform} ({avail.type})
                                </a>
                              ) : (
                                <span
                                  key={idx}
                                  className="rounded-pill bg-surface-2 px-3 py-1 text-xs text-text"
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
                          className="rounded-pill bg-surface-2 px-4 py-1.5 text-xs text-text transition-colors hover:opacity-80"
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
            className="w-full max-w-4xl overflow-hidden rounded-lg bg-surface shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4">
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

            <div className="p-4 text-center">
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
