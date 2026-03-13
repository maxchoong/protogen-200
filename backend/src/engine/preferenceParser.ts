/**
 * Parses user preferences and input into structured query parameters
 * Phase 1 Enhancement: Reference titles, excluded genres, mood confidence scoring
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
  // Phase 1: Enhanced parsing
  referenceTitle?: string[]     // Titles mentioned as "like" or "similar to"
  excludedGenres?: string[]     // Genres user wants to avoid
  constraints?: string[]        // Captured constraints (e.g., "slow-paced", "short episodes")
  moodStrength?: Map<string, number>  // Mood confidence 0-1 (e.g., "funny": 1.0, "kinda dark": 0.6)
  description?: string          // Original user query (for hard filter inference)
}

export interface RecommendationRequest {
  description: string
  region?: string
  preferences?: Partial<ParsedPreferences>
}

/**
 * Rule-based preference parser with LLM enhancement
 * Extracts: genres, moods, reference titles, excluded preferences, constraints
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
    'Thoughtful': ['thoughtful', 'philosophical', 'intelligent', 'educational', 'inspiring'],
    'Dark': ['dark', 'gritty', 'bleak', 'moody', 'brooding'],
    'Romantic': ['romantic', 'love', 'tender', 'passionate'],
    'Suspenseful': ['suspenseful', 'tension', 'thrilling', 'edge-of-seat']
  }

  // Patterns for extracting reference titles
  private static readonly REFERENCE_PATTERNS = [
    /like\s+(?:['""])?([a-zA-Z0-9\s&:'"-]+?)(?:['""])?(?:\s|$)/gi,
    /similar\s+to\s+(?:['""])?([a-zA-Z0-9\s&:'"-]+?)(?:['""])?(?:\s|$)/gi,
    /reminds?\s+me\s+of\s+(?:['""])?([a-zA-Z0-9\s&:'"-]+?)(?:['""])?(?:\s|$)/gi,
    /in\s+the\s+style\s+of\s+(?:['""])?([a-zA-Z0-9\s&:'"-]+?)(?:['""])?(?:\s|$)/gi,
    /vibes\s+of\s+(?:['""])?([a-zA-Z0-9\s&:'"-]+?)(?:['""])?(?:\s|$)/gi
  ]

  // Patterns for extracting exclusions
  private static readonly EXCLUSION_PATTERNS = [
    /no\s+(\w+)/gi,
    /avoid\s+(\w+)/gi,
    /not\s+(\w+)/gi,
    /without\s+(\w+)/gi,
    /hate\s+(\w+)/gi,
    /(?:^|[\s,])(?:don't|do\s+not)\s+want\s+(\w+)/gi
  ]

  // Strength modifiers for moods
  private static readonly INTENSITY_MODIFIERS: Record<string, number> = {
    // High confidence
    'very': 1.0,
    'extremely': 1.0,
    'super': 1.0,
    'really': 0.9,
    'quite': 0.85,
    // Medium-high
    'pretty': 0.75,
    'rather': 0.7,
    'somewhat': 0.65,
    // Medium
    'kind of': 0.5,
    'kinda': 0.5,
    'a bit': 0.5,
    'slightly': 0.6,
    // Low
    'maybe': 0.4,
    'sorta': 0.4
  }

  /**
   * Extract reference title(s) from description
   * E.g., "like Parks and Rec" → ["Parks and Rec"]
   */
  private static extractReferenceTitle(description: string): string[] {
    const references: string[] = []

    for (const pattern of this.REFERENCE_PATTERNS) {
      let match
      while ((match = pattern.exec(description)) !== null) {
        const title = match[1].trim()
        // Filter out very short matches (likely false positives)
        if (title.length > 2) {
          references.push(title)
        }
      }
    }

    // Deduplicate and normalize (title case)
    const unique = Array.from(new Set(references.map(t => t.trim())))
    return unique
  }

  /**
   * Extract excluded genres/constraints from description
   * E.g., "no horror" → ["Horror"]
   * E.g., "avoid action-heavy" → ["Action", "action-heavy"]
   */
  private static extractExcludedPreferences(description: string): {
    excludedGenres: string[]
    constraints: string[]
  } {
    const excludedGenres: string[] = []
    const constraints: string[] = []
    const lowerDesc = description.toLowerCase()

    // Look for genre exclusions
    for (const pattern of this.EXCLUSION_PATTERNS) {
      let match
      while ((match = pattern.exec(description)) !== null) {
        const term = match[1]?.toLowerCase() || ''
        if (!term) continue

        // Check if it's a genre
        const matchedGenre = Object.keys(this.GENRE_KEYWORDS).find(g =>
          g.toLowerCase().includes(term) || term.includes(g.toLowerCase())
        )

        if (matchedGenre) {
          excludedGenres.push(matchedGenre)
        } else if (term.length > 2) {
          // Store as constraint for secondary filtering
          constraints.push(term)
        }
      }
    }

    return {
      excludedGenres: Array.from(new Set(excludedGenres)),
      constraints: Array.from(new Set(constraints))
    }
  }

  /**
   * Score mood confidence based on keywords and intensity modifiers
   * Returns: Map<mood, confidence 0-1>
   * E.g., "very funny" → Funny: 0.95
   * E.g., "kinda dark" → Dark: 0.5
   */
  private static scoreMoodConfidence(description: string): Map<string, number> {
    const moodStrength = new Map<string, number>()
    const descLower = description.toLowerCase()

    for (const [mood, keywords] of Object.entries(this.MOOD_KEYWORDS)) {
      // Check if any mood keyword matches
      const matchedKeyword = keywords.find(keyword => descLower.includes(keyword))
      if (!matchedKeyword) continue

      // Base confidence from exact keyword match
      let baseConfidence =
        descLower.includes(mood.toLowerCase()) ? 0.9 : // Direct mood name match
        keywords.some(kw => descLower.includes(kw)) ? 0.8 : // Keyword match
        0.7 // Fallback

      // Look for intensity modifiers around the keyword
      const keywordIndex = descLower.indexOf(matchedKeyword)
      const contextWindow = descLower.substring(
        Math.max(0, keywordIndex - 30),
        Math.min(descLower.length, keywordIndex + 30)
      )

      let confidence = baseConfidence
      for (const [modifier, modifierStrength] of Object.entries(this.INTENSITY_MODIFIERS)) {
        if (contextWindow.includes(modifier)) {
          confidence = modifierStrength * baseConfidence
          break
        }
      }

      // Normalize to 0.3-1.0 range (minimum confidence for detected mood)
      confidence = Math.max(0.3, Math.min(1.0, confidence))

      // Only store if not already stored with higher confidence
      if (!moodStrength.has(mood) || moodStrength.get(mood)! < confidence) {
        moodStrength.set(mood, confidence)
      }
    }

    return moodStrength
  }

  /**
   * Parse user request into structured preferences
   * Combines rule-based extraction with optional LLM enhancement
   */
  static parse(request: RecommendationRequest): ParsedPreferences {
    const description = request.description.toLowerCase()

    // Start with defaults
    const preferences: ParsedPreferences = {
      genres: [],
      mood: [],
      contentType: request.preferences?.contentType || 'both',
      maxRating: request.preferences?.maxRating || 'R',
      referenceTitle: [],
      excludedGenres: [],
      constraints: [],
      moodStrength: new Map()
    }

    // === PHASE 1 STEP 1.2: Extract reference titles ===
    preferences.referenceTitle = this.extractReferenceTitle(description)

    // === PHASE 1 STEP 1.4: Extract excluded preferences ===
    const { excludedGenres, constraints } = this.extractExcludedPreferences(description)
    preferences.excludedGenres = excludedGenres
    preferences.constraints = constraints

    // === PHASE 1 STEP 1.3: Score mood confidence ===
    preferences.moodStrength = this.scoreMoodConfidence(description)
    preferences.mood = Array.from(preferences.moodStrength.keys())

    // === PHASE 1 STEP 1.1: Extract genres (existing logic) ===
    for (const [genre, keywords] of Object.entries(this.GENRE_KEYWORDS)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        preferences.genres.push(genre)
      }
    }

    // Remove excluded genres from detected genres
    if (preferences.excludedGenres.length > 0) {
      preferences.genres = preferences.genres.filter(
        g => !preferences.excludedGenres!.includes(g)
      )
    }

    // === Override with explicit preferences ===
    if (request.preferences?.genres && request.preferences.genres.length > 0) {
      preferences.genres = request.preferences.genres
    }

    if (request.preferences?.mood && request.preferences.mood.length > 0) {
      preferences.mood = request.preferences.mood
      // Rebuild moodStrength map from explicit preferences (all 1.0)
      preferences.moodStrength = new Map(
        request.preferences.mood.map(m => [m, 1.0])
      )
    }

    if (request.preferences?.referenceTitle && request.preferences.referenceTitle.length > 0) {
      preferences.referenceTitle = request.preferences.referenceTitle
    }

    if (request.preferences?.excludedGenres && request.preferences.excludedGenres.length > 0) {
      preferences.excludedGenres = request.preferences.excludedGenres
      // Re-filter genres
      preferences.genres = preferences.genres.filter(
        g => !preferences.excludedGenres!.includes(g)
      )
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

    if (preferences.genres && preferences.genres.length > 0) {
      parts.push(`Genres: ${preferences.genres.join(', ')}`)
    }

    if (preferences.excludedGenres && preferences.excludedGenres.length > 0) {
      parts.push(`Excluded: ${preferences.excludedGenres.join(', ')}`)
    }

    if (preferences.referenceTitle && preferences.referenceTitle.length > 0) {
      parts.push(`References: ${preferences.referenceTitle.join(', ')}`)
    }

    if (preferences.mood && preferences.mood.length > 0) {
      const moodStr = preferences.mood.map(m => {
        const strength = preferences.moodStrength?.get(m) ?? 0
        return `${m} (${(strength * 100).toFixed(0)}%)`
      }).join(', ')
      parts.push(`Mood: ${moodStr}`)
    }

    if (preferences.constraints && preferences.constraints.length > 0) {
      parts.push(`Constraints: ${preferences.constraints.join(', ')}`)
    }

    parts.push(`Type: ${preferences.contentType}`)
    parts.push(`Max Rating: ${preferences.maxRating}`)

    return parts.join(' | ')
  }
}
