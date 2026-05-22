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
          <h1 className="mb-4 text-5xl font-bold text-text">
            Lumera
          </h1>
          <p className="text-xl text-text-muted">
            Your taste, illuminated.
          </p>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-border bg-surface p-8 shadow-card">
          <div className="mb-6">
            <label htmlFor="description" className="mb-2 block text-sm font-medium text-text">
              What are you in the mood for?
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., A cozy romance on a rainy day, or an intense sci-fi thriller..."
              className="h-32 w-full resize-none rounded-lg border border-border bg-surface-2 px-4 py-3 text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-focus"
              disabled={loading}
              aria-invalid={description.length > 0 && description.trim().length < 3}
              aria-describedby="char-count"
            />
            <p id="char-count" className="mt-2 text-sm text-text-muted">
              {description.length}/500 characters
            </p>
          </div>

          {/* Preferences Toggle */}
          <button
            type="button"
            onClick={() => setShowPreferences(!showPreferences)}
            className="mb-4 text-sm text-accent underline transition-opacity hover:opacity-80"
            aria-expanded={showPreferences}
            aria-controls="preferences-panel"
          >
            {showPreferences ? 'Hide' : 'Show'} preference details
          </button>

          {/* Preferences Panel */}
          {showPreferences && (
            <div id="preferences-panel" className="mb-6 space-y-6 rounded-lg border border-border bg-surface-2 p-6" role="region" aria-label="Preference options">
              {/* Genres */}
              <div>
                <label className="mb-3 block text-sm font-medium text-text">
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
                          ? 'bg-accent text-accent-contrast'
                          : 'border border-border bg-surface text-text hover:border-accent'
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
                <label className="mb-3 block text-sm font-medium text-text">
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
                          ? 'bg-accent text-accent-contrast'
                          : 'border border-border bg-surface text-text hover:border-accent'
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
                <label className="mb-3 block text-sm font-medium text-text">
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
                      <span className="capitalize text-text">{type === 'both' ? 'Movies and TV' : type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Max Rating */}
              <div>
                <label className="mb-3 block text-sm font-medium text-text">
                  Max Rating (optional)
                </label>
                <select
                  value={preferences.maxRating}
                  onChange={(e) => setPreferences(prev => ({ ...prev, maxRating: e.target.value }))}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-text focus:outline-none focus:ring-2 focus:ring-focus"
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
            className="w-full rounded-lg bg-accent px-6 py-3 font-semibold text-accent-contrast transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Finding recommendations...' : 'Get Recommendations'}
          </button>

          {description.trim().length > 0 && description.trim().length < 3 && (
            <p className="mt-3 text-sm text-amber-300" role="status" aria-live="polite">
              Description must be at least 3 characters, or submit preferences only.
            </p>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/60 bg-red-500/10 p-4">
              <p className="text-sm text-red-300">
                <span className="font-semibold">Error:</span> {error}
              </p>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="mt-4 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-accent"></div>
              <p className="mt-2 text-sm text-text-muted">
                Analyzing your preferences with AI...
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
