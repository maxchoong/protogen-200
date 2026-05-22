import { useState, useEffect } from 'react'
import { ConversationMessage } from '../hooks/useConversation'

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
  conversationMessages?: ConversationMessage[]
  activeConstraints?: string[]
  refinementSuggestions?: string[]
  onRefine?: (refinementText: string) => Promise<void>
}

export default function ResultsPage({
  results,
  query,
  onBackHome,
  conversationMessages = [],
  activeConstraints = [],
  refinementSuggestions = [],
  onRefine
}: ResultsPageProps) {
  const [trailerModal, setTrailerModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  })
  const [refinementInput, setRefinementInput] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)

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

  const submitRefinement = async (value: string) => {
    if (!onRefine) {
      return
    }

    const trimmed = value.trim()
    if (!trimmed) {
      return
    }

    try {
      setIsRefining(true)
      setRefineError(null)
      await onRefine(trimmed)
      setRefinementInput('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refine results right now.'
      setRefineError(message)
    } finally {
      setIsRefining(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <button
          onClick={onBackHome}
          className="mb-8 rounded-pill border border-border bg-surface px-4 py-2 text-sm text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
          aria-label="Back to conversation"
        >
          ← Back to conversation
        </button>

        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-text-muted">Curated selections</p>
        <h1 className="mb-3 font-serif text-4xl font-medium tracking-[-0.03em] text-text md:text-[2.8rem]">
          Recommendations
        </h1>
        <p className="mb-8 max-w-2xl text-[15px] leading-relaxed text-text-muted">
          Based on: <span className="italic">"{query}"</span>
        </p>

        {conversationMessages.length > 0 && (
          <section className="mb-8 rounded-lg border border-border bg-surface p-6 shadow-card" aria-label="Conversation thread">
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-text-muted">Conversation thread</p>
            <h2 className="mb-4 font-serif text-2xl font-medium tracking-[-0.02em] text-text">Editorial Notes</h2>
            <div className="space-y-4" role="log" aria-live="polite">
              {conversationMessages.map(message => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <article
                    className={`max-w-[85%] rounded-lg border px-4 py-3 shadow-card ${
                    message.role === 'user'
                      ? 'rounded-br-none border-accent/50 bg-accent/12 text-text'
                      : 'rounded-bl-none border-border bg-bg text-text'
                  }`}
                  >
                    <p className="mb-1 text-[11px] tracking-[0.08em] text-text-muted">
                      {message.role === 'user' ? 'You' : 'Advisor'}
                    </p>
                    <p className="text-sm leading-relaxed">{message.text}</p>
                  </article>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mb-8 rounded-lg border border-border bg-surface p-6 shadow-card" aria-label="Refine recommendations">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-text-muted">Refinement desk</p>
          <h2 className="mb-2 font-serif text-2xl font-medium tracking-[-0.02em] text-text">Shape the next pass</h2>
          <p className="mb-5 max-w-2xl text-sm leading-relaxed text-text-muted">
            Add a note in plain language and I will re-curate the list. Try: prioritize blockbusters, focus on 80s titles, or make the tone less dark.
          </p>

          {activeConstraints.length > 0 && (
            <div className="mb-5" aria-label="Active refinement constraints">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-text-muted">Current direction</p>
              <div className="flex flex-wrap gap-2.5">
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
            <div className="mb-5" aria-label="Suggested refinements">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-text-muted">Suggested edits</p>
              <div className="flex flex-wrap gap-2.5">
                {refinementSuggestions.map((suggestion, idx) => (
                  <button
                    key={`${suggestion}-${idx}`}
                    onClick={() => void submitRefinement(suggestion)}
                    disabled={isRefining}
                    className="rounded-pill border border-border bg-surface-2 px-3 py-1.5 text-xs text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              value={refinementInput}
              onChange={(e) => setRefinementInput(e.target.value)}
              placeholder="Write your editorial note..."
              disabled={isRefining}
              className="flex-1 rounded-pill border border-border bg-surface-2 px-4 py-2.5 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-50"
            />
            <button
              onClick={() => void submitRefinement(refinementInput)}
              disabled={!refinementInput.trim() || isRefining}
              className="rounded-pill border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRefining ? 'Curating...' : 'Apply note'}
            </button>
          </div>

          {refineError && (
            <p className="mt-3 text-sm text-red-300" role="alert">{refineError}</p>
          )}
        </section>

        {/* Results Grid */}
        {results.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-card" role="status" aria-live="polite">
            <p className="text-lg text-text-muted">
              Nothing landed on this pass. Add a new note and I will curate another set.
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
                            Why this made the list
                          </p>
                          <p className="text-sm text-text-muted">
                            {rec.whyThis}
                          </p>
                        </div>
                      )}

                      {/* Availability */}
                      <div className="mb-4">
                        <p className="mb-2 text-sm font-semibold text-text">
                          Where to stream
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
                            View trailer
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
