/**
 * Parses user preferences and input into structured query parameters
 */

export interface ParsedPreferences {
  genres: string[]
  mood: string[]
  contentType: 'movie' | 'tv' | 'both'
  maxRating: string
  yearRange?: {
    min?: number
    max?: number
  }
}

export interface RecommendationRequest {
  description: string
  region?: string
  preferences?: Partial<ParsedPreferences>
}

/**
 * Simple rule-based preference parser
 * Could be enhanced with LLM in Phase 3
 */
export class PreferenceParser {
  private static readonly GENRE_KEYWORDS: Record<string, string[]> = {
    'Action': ['action', 'fight', 'explosion', 'adventure', 'heroic', 'thrilling', 'combat'],
    'Comedy': ['funny', 'laugh', 'comedy', 'humorous', 'hilarious', 'comic'],
    'Drama': ['emotional', 'serious', 'dramatic', 'deep', 'character', 'intense'],
    'Horror': ['scary', 'horror', 'spooky', 'creepy', 'terrifying', 'frightening'],
    'Romance': ['romance', 'romantic', 'love', 'couple', 'relationship'],
    'Sci-Fi': ['sci-fi', 'science fiction', 'future', 'space', 'alien', 'technology', 'dystopian'],
    'Thriller': ['thriller', 'suspense', 'mystery', 'detective', 'crime', 'dark'],
    'Animation': ['animated', 'animation', 'cartoon'],
    'Fantasy': ['fantasy', 'magic', 'magical', 'legend', 'adventure'],
    'Documentary': ['documentary', 'real', 'true', 'educational']
  }

  private static readonly MOOD_KEYWORDS: Record<string, string[]> = {
    'Happy': ['happy', 'uplifting', 'feel-good', 'cheerful', 'light', 'fun'],
    'Sad': ['sad', 'emotional', 'crying', 'melancholic', 'depressing'],
    'Intense': ['intense', 'adrenaline', 'fast-paced', 'suspenseful', 'gripping'],
    'Relaxing': ['relaxing', 'chill', 'cozy', 'calm', 'peaceful', 'easy-going'],
    'Funny': ['funny', 'hilarious', 'laugh', 'comedy', 'witty'],
    'Thoughtful': ['thoughtful', 'philosophical', 'intelligent', 'educational', 'inspiring']
  }

  /**
   * Parse user request into structured preferences
   */
  static parse(request: RecommendationRequest): ParsedPreferences {
    const description = request.description.toLowerCase()

    // Start with defaults
    const preferences: ParsedPreferences = {
      genres: [],
      mood: [],
      contentType: request.preferences?.contentType || 'both',
      maxRating: request.preferences?.maxRating || 'R'
    }

    // Extract genres from description
    for (const [genre, keywords] of Object.entries(this.GENRE_KEYWORDS)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        preferences.genres.push(genre)
      }
    }

    // Extract moods from description
    for (const [mood, keywords] of Object.entries(this.MOOD_KEYWORDS)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        preferences.mood.push(mood)
      }
    }

    // Override with explicit preferences
    if (request.preferences?.genres && request.preferences.genres.length > 0) {
      preferences.genres = request.preferences.genres
    }

    if (request.preferences?.mood && request.preferences.mood.length > 0) {
      preferences.mood = request.preferences.mood
    }

    // If no genres found, use top genres as fallback
    if (preferences.genres.length === 0 && !request.preferences?.genres) {
      preferences.genres = ['Drama', 'Comedy', 'Action']
    }

    return preferences
  }

  /**
   * Get explanation of parsed preferences for logging
   */
  static explain(preferences: ParsedPreferences): string {
    const parts = []

    if (preferences.genres.length > 0) {
      parts.push(`Genres: ${preferences.genres.join(', ')}`)
    }

    if (preferences.mood.length > 0) {
      parts.push(`Mood: ${preferences.mood.join(', ')}`)
    }

    parts.push(`Type: ${preferences.contentType}`)
    parts.push(`Max Rating: ${preferences.maxRating}`)

    return parts.join(' | ')
  }
}
