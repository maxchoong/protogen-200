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
          className="text-blue-400 hover:text-blue-300 mb-6 text-sm underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          aria-label="Back to search page"
        >
          ← Back to search
        </button>

        <h1 className="text-4xl font-bold text-white mb-2">
          Recommendations
        </h1>
        <p className="text-slate-300 mb-8">
          Based on: <span className="italic">"{query}"</span>
        </p>

        {/* Results Grid */}
        {results.length === 0 ? (
          <div className="text-center py-12" role="status" aria-live="polite">
            <p className="text-slate-300 text-lg">
              No recommendations found. Try adjusting your preferences and search again.
            </p>
          </div>
        ) : (
          <div className="grid gap-8" role="list" aria-label="Movie and TV show recommendations">
            {results.map((rec) => (
              <article
                key={rec.id}
                className="bg-slate-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
                role="listitem"
              >
                <div className="p-6">
                  <div className="flex gap-6">
                    {/* Poster Placeholder */}
                    {rec.posterUrl ? (
                      <img
                        src={rec.posterUrl}
                        alt={`${rec.title} poster`}
                        className="w-32 h-48 object-cover rounded-lg flex-shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div 
                        className="w-32 h-48 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-500"
                        role="img"
                        aria-label="No poster available"
                      >
                        No poster
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-white mb-2">
                        {rec.title}
                      </h2>
                      <p className="text-sm text-slate-400 mb-4">
                        {rec.year} • {rec.type}
                      </p>

                      {/* Synopsis */}
                      {rec.synopsis && (
                        <div className="mb-4">
                          <p className="text-slate-300 text-sm">
                            {rec.synopsis}
                          </p>
                        </div>
                      )}

                      {/* Why This */}
                      {rec.whyThis && (
                        <div className="bg-slate-700 p-4 rounded mb-4" role="complementary" aria-label="Recommendation explanation">
                          <p className="text-sm font-semibold text-blue-300 mb-1">
                            Why this recommendation?
                          </p>
                          <p className="text-sm text-slate-300">
                            {rec.whyThis}
                          </p>
                        </div>
                      )}

                      {/* Availability */}
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-white mb-2">
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
                                  className="bg-green-900 text-green-100 px-3 py-1 rounded-full text-xs hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                                  role="listitem"
                                  aria-label={`Open ${avail.platform} in a new tab`}
                                >
                                  {avail.platform} ({avail.type})
                                </a>
                              ) : (
                                <span
                                  key={idx}
                                  className="bg-green-900 text-green-100 px-3 py-1 rounded-full text-xs"
                                  role="listitem"
                                >
                                  {avail.platform} ({avail.type})
                                </span>
                              )
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-400 text-sm">Availability info not available.</p>
                        )}
                      </div>

                      {/* Trailer Button */}
                      {rec.trailerUrl && (
                        <div>
                          <button
                            onClick={() => openTrailer(rec.trailerUrl!, rec.title)}
                            className="inline-block bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                            aria-label={`Watch trailer for ${rec.title}`}
                          >
                            ▶ Watch Trailer
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
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={closeTrailer}
          role="dialog"
          aria-modal="true"
          aria-labelledby="trailer-title"
        >
          <div
            className="bg-slate-900 rounded-lg overflow-hidden max-w-4xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 id="trailer-title" className="text-xl font-bold text-white">
                {trailerModal.title} - Trailer
              </h2>
              <button
                onClick={closeTrailer}
                className="text-slate-400 hover:text-white text-2xl leading-none focus:outline-none focus:ring-2 focus:ring-white rounded"
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
            <div className="p-4 border-t border-slate-700 text-center">
              <button
                onClick={closeTrailer}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-white"
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
