import { useState } from 'react'

interface HomePageProps {
  onSubmit: (request: {
    description: string
    preferences?: {
      genres?: string[]
      mood?: string[]
      type?: 'movie' | 'tv' | 'both'
      maxRating?: string
    }
  }) => void
  loading?: boolean
  error?: string | null
}

export default function HomePage({ onSubmit, loading = false, error = null }: HomePageProps) {
  const [description, setDescription] = useState('')
  const [showPreferences, setShowPreferences] = useState(false)
  const [preferences, setPreferences] = useState({
    genres: [] as string[],
    mood: [] as string[],
    type: 'both' as 'movie' | 'tv' | 'both',
    maxRating: 'PG-13'
  })

  const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Romance', 'Sci-Fi', 'Thriller', 'Animation']
  const moods = ['Happy', 'Sad', 'Intense', 'Relaxing', 'Funny', 'Thoughtful']

  const hasSelectedPreferences =
    preferences.genres.length > 0 ||
    preferences.mood.length > 0 ||
    preferences.type !== 'both' ||
    preferences.maxRating !== 'PG-13'

  const handleToggleGenre = (genre: string) => {
    setPreferences(prev => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter(g => g !== genre)
        : [...prev.genres, genre]
    }))
  }

  const handleToggleMood = (mood: string) => {
    setPreferences(prev => ({
      ...prev,
      mood: prev.mood.includes(mood)
        ? prev.mood.filter(m => m !== mood)
        : [...prev.mood, mood]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = description.trim()
    if (!trimmed && !hasSelectedPreferences) {
      return
    }
    if (trimmed && trimmed.length < 3) {
      return
    }
    onSubmit({
      description: trimmed,
      preferences
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            🎬 Film & TV Advisor
          </h1>
          <p className="text-xl text-slate-300">
            Tell us what you're in the mood for and we'll find the perfect thing to watch
          </p>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-lg shadow-xl p-8 mb-6">
          <div className="mb-6">
            <label htmlFor="description" className="block text-sm font-medium text-white mb-2">
              What are you in the mood for?
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., A cozy romance on a rainy day, or an intense sci-fi thriller..."
              className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
              disabled={loading}
              aria-invalid={description.length > 0 && description.trim().length < 3}
              aria-describedby="char-count"
            />
            <p id="char-count" className="text-sm text-slate-400 mt-2">
              {description.length}/500 characters
            </p>
          </div>

          {/* Preferences Toggle */}
          <button
            type="button"
            onClick={() => setShowPreferences(!showPreferences)}
            className="text-blue-400 hover:text-blue-300 text-sm mb-4 underline"
            aria-expanded={showPreferences}
            aria-controls="preferences-panel"
          >
            {showPreferences ? 'Hide' : 'Show'} preference details
          </button>

          {/* Preferences Panel */}
          {showPreferences && (
            <div id="preferences-panel" className="bg-slate-700 rounded-lg p-6 mb-6 space-y-6" role="region" aria-label="Preference options">
              {/* Genres */}
              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  Genres (optional)
                </label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Genre selection">
                  {genres.map(genre => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => handleToggleGenre(genre)}
                      className={`px-4 py-2 rounded-full text-sm transition-colors ${
                        preferences.genres.includes(genre)
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                      }`}
                      disabled={loading}
                      aria-pressed={preferences.genres.includes(genre)}
                      aria-label={`${genre} genre`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mood */}
              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  Mood (optional)
                </label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Mood selection">
                  {moods.map(mood => (
                    <button
                      key={mood}
                      type="button"
                      onClick={() => handleToggleMood(mood)}
                      className={`px-4 py-2 rounded-full text-sm transition-colors ${
                        preferences.mood.includes(mood)
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                      }`}
                      disabled={loading}
                      aria-pressed={preferences.mood.includes(mood)}
                      aria-label={`${mood} mood`}
                    >
                      {mood}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  Type (optional)
                </label>
                <div className="flex gap-4">
                  {(['movie', 'tv', 'both'] as const).map(type => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value={type}
                        checked={preferences.type === type}
                        onChange={(e) => setPreferences(prev => ({ ...prev, type: e.target.value as 'movie' | 'tv' | 'both' }))}
                        className="w-4 h-4"
                        disabled={loading}
                      />
                      <span className="text-white capitalize">{type === 'both' ? 'Movies & TV' : type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Max Rating */}
              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  Max Rating (optional)
                </label>
                <select
                  value={preferences.maxRating}
                  onChange={(e) => setPreferences(prev => ({ ...prev, maxRating: e.target.value }))}
                  className="bg-slate-600 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                >
                  <option value="G">G</option>
                  <option value="PG">PG</option>
                  <option value="PG-13">PG-13</option>
                  <option value="R">R</option>
                </select>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || (!description.trim() && !hasSelectedPreferences) || (description.trim().length > 0 && description.trim().length < 3)}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            {loading ? 'Finding recommendations...' : 'Get Recommendations'}
          </button>

          {description.trim().length > 0 && description.trim().length < 3 && (
            <p className="mt-3 text-amber-300 text-sm" role="status" aria-live="polite">
              Description must be at least 3 characters, or submit preferences only.
            </p>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-900 border border-red-700 rounded-lg">
              <p className="text-red-100 text-sm">
                <span className="font-semibold">Error:</span> {error}
              </p>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="mt-4 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              <p className="text-slate-300 mt-2 text-sm">
                Analyzing your preferences with AI...
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
