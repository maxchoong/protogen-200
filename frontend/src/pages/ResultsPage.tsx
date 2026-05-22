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

interface ResultsPageProps {
  results: Recommendation[]
  query: string
  onBackHome: () => void
}

export default function ResultsPage({ results, query, onBackHome }: ResultsPageProps) {
  const [trailerModal, setTrailerModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  })

  // Handle Escape key to close modal
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
    // Convert watch URL to embed URL
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
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <button
          onClick={onBackHome}
          className="mb-6 rounded-pill border border-border bg-surface px-4 py-2 text-sm text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
          aria-label="Back to search page"
        >
          ← Back to search
        </button>

        <h1 className="mb-2 font-serif text-4xl font-medium tracking-[-0.03em] text-text">
          Recommendations
        </h1>
        <p className="mb-8 text-text-muted">
          Based on: <span className="italic">"{query}"</span>
        </p>

        {/* Results Grid */}
        {results.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-card" role="status" aria-live="polite">
            <p className="text-lg text-text-muted">
              No recommendations found. Try adjusting your preferences and search again.
            </p>
          </div>
        ) : (
          <div className="grid gap-8" role="list" aria-label="Movie and TV show recommendations">
            {results.map((rec) => (
              <article
                key={rec.id}
                className="overflow-hidden rounded-lg border border-border bg-surface shadow-card transition-shadow hover:shadow-card-hover"
                role="listitem"
              >
                <div className="p-6">
                  <div className="flex gap-6">
                    {/* Poster Placeholder */}
                    {rec.posterUrl ? (
                      <img
                        src={rec.posterUrl}
                        alt={`${rec.title} poster`}
                        className="h-48 w-32 flex-shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div 
                        className="flex h-48 w-32 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-text-muted"
                        role="img"
                        aria-label="No poster available"
                      >
                        No poster
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1">
                      <h2 className="mb-2 font-serif text-2xl font-medium leading-tight tracking-[-0.02em] text-text md:text-[1.7rem]">
                        {rec.title}
                      </h2>
                      <p className="mb-4 text-sm text-text-muted">
                        {rec.year} • {rec.type}
                      </p>

                      {/* Synopsis */}
                      {rec.synopsis && (
                        <div className="mb-4">
                          <p className="text-sm text-text-muted">
                            {rec.synopsis}
                          </p>
                        </div>
                      )}

                      {/* Why This */}
                      {rec.whyThis && (
                        <div className="mb-4 rounded-lg border border-border bg-surface-2 p-4" role="complementary" aria-label="Recommendation explanation">
                          <p className="mb-1 text-sm font-semibold text-text">
                            Why this recommendation?
                          </p>
                          <p className="text-sm text-text-muted">
                            {rec.whyThis}
                          </p>
                        </div>
                      )}

                      {/* Availability */}
                      <div className="mb-4">
                        <p className="mb-2 text-sm font-semibold text-text">
                          Where to watch:
                        </p>
                        {rec.availability && rec.availability.length > 0 ? (
                          <div className="flex flex-wrap gap-2" role="list" aria-label="Streaming platforms">
                            {rec.availability.map((avail, idx) => (
                              avail.link ? (
                                <a
                                  key={idx}
                                  href={avail.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
                                  role="listitem"
                                  aria-label={`Open ${avail.platform} in a new tab`}
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

                      {/* Trailer Button */}
                      {rec.trailerUrl && (
                        <div>
                          <button
                            onClick={() => openTrailer(rec.trailerUrl!, rec.title)}
                            className="inline-block rounded-pill border border-border bg-surface-2 px-4 py-2 text-sm text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
                            aria-label={`Watch trailer for ${rec.title}`}
                          >
                            Watch trailer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Trailer Modal */}
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
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 id="trailer-title" className="text-xl font-semibold tracking-[-0.03em] text-text">
                {trailerModal.title} - Trailer
              </h2>
              <button
                onClick={closeTrailer}
                className="rounded text-2xl leading-none text-text-muted transition-colors hover:text-text focus:outline-none focus:ring-2 focus:ring-focus"
                aria-label="Close trailer"
              >
                ×
              </button>
            </div>

            {/* Video Player */}
            <div className="relative" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={trailerModal.url}
                title={`${trailerModal.title} Trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Modal Footer */}
            <div className="border-t border-border p-4 text-center">
              <button
                onClick={closeTrailer}
                className="rounded-pill border border-border bg-surface-2 px-6 py-2 text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
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
