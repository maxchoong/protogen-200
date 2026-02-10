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
  }[]
  trailerUrl?: string
}

interface ResultsPageProps {
  results: Recommendation[]
  query: string
  onBackHome: () => void
}

export default function ResultsPage({ results, query, onBackHome }: ResultsPageProps) {
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <button
          onClick={onBackHome}
          className="text-blue-400 hover:text-blue-300 mb-6 text-sm underline"
        >
          ← Back to search
        </button>

        <h1 className="text-4xl font-bold text-white mb-2">
          Recommendations
        </h1>
        <p className="text-slate-300 mb-8">
          Based on: "{query}"
        </p>

        {/* Results Grid */}
        {results.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-300 text-lg">
              No recommendations found. Try adjusting your preferences and search again.
            </p>
          </div>
        ) : (
          <div className="grid gap-8">
            {results.map((rec) => (
              <div
                key={rec.id}
                className="bg-slate-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="p-6">
                  <div className="flex gap-6">
                    {/* Poster Placeholder */}
                    {rec.posterUrl ? (
                      <img
                        src={rec.posterUrl}
                        alt={rec.title}
                        className="w-32 h-48 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className="w-32 h-48 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-500">
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
                        <div className="bg-slate-700 p-4 rounded mb-4">
                          <p className="text-sm font-semibold text-blue-300 mb-1">
                            Why this recommendation?
                          </p>
                          <p className="text-sm text-slate-300">
                            {rec.whyThis}
                          </p>
                        </div>
                      )}

                      {/* Availability */}
                      {rec.availability && rec.availability.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-semibold text-white mb-2">
                            Where to watch:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {rec.availability.map((avail, idx) => (
                              <span
                                key={idx}
                                className="bg-green-900 text-green-100 px-3 py-1 rounded-full text-xs"
                              >
                                {avail.platform} ({avail.type})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Trailer Button */}
                      {rec.trailerUrl && (
                        <div>
                          <a
                            href={rec.trailerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors"
                          >
                            Watch Trailer
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
