/**
 * Parses user preferences and input into structured query parameters
 * Phase 1 Enhancement: Reference titles, excluded genres, mood confidence scoring
 * Phase 5: Intent classification and ambiguity detection
 */

export type DiscoveryMode = 'mood' | 'reference' | 'talent' | 'mixed'
export type TurnContinuity = 'continue' | 'soft_pivot' | 'hard_pivot'
export type TurnOperationType = 'narrow' | 'widen' | 'replace'

export interface TurnOperation {
  continuity: TurnContinuity
  operation: TurnOperationType
  confidence: number
  rationaleTags: string[]
}

export interface IntentSignals {
  foundReferenceTitle: boolean
  foundActorNames: boolean
  hasMoodDescriptors: boolean
  hasSituationDescriptors: boolean
  conflictingSignals: boolean        // Multiple intent types detected
}

export interface IntentClassification {
  mode: DiscoveryMode
  confidence: number                  // 0-1: how confident we are in the mode
  signals: IntentSignals
  ambiguities?: string[]              // What's unclear (e.g., ["Mood and reference conflict"])
  suggestedClarifications?: Array<{
    id: string
    question: string
    type: 'select' | 'text' | 'boolean'
    options?: string[]
  }>
}

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
  
  // Phase 5: Intent classification signals
  detectedActors?: string[]     // Actor names mentioned (e.g., "Ryan Gosling")
  discoveryMode?: DiscoveryMode // Primary intent mode
  intentConfidence?: number      // Confidence in discovered mode (0-1)
  intentSignals?: IntentSignals  // Raw signal breakdown
  isContrastiveReference?: boolean // true for prompts like "like X but more relaxing"
  boostedMoods?: string[]         // Moods to explicitly increase
  reducedMoods?: string[]         // Moods to explicitly de-emphasize
  noveltyIntent?: boolean         // true for discovery language like "indie gems"
  popularityPreference?: 'mainstream' | 'niche'
  turnOperation?: TurnOperation
}

export interface RecommendationRequest {
  description: string
  region?: string
  preferences?: Partial<ParsedPreferences>
  clarificationContext?: {
    clarificationRound: number
    previousRecommendationId?: string
    previousRecommendationIds?: string[]
    userClarification?: string
    clarificationIndex?: number
    askedQuestionIds?: string[]
    cumulativeConstraints?: string[]
  }
}

/**
 * Rule-based preference parser with LLM enhancement
 * Extracts: genres, moods, reference titles, excluded preferences, constraints
 */
export class PreferenceParser {
  private static readonly HARD_PIVOT_CUES = [
    'instead',
    'actually',
    'forget that',
    'forget this',
    'different direction',
    'switch gears',
    'new direction',
    'not that',
    'start over'
  ]

  private static readonly SOFT_PIVOT_CUES = [
    'same vibe but',
    'but with',
    'shift toward',
    'lean toward',
    'more like',
    'less like'
  ]

  private static readonly NARROW_CUES = [
    'only',
    'just',
    'specifically',
    'strictly',
    'prioritize',
    'focus on',
    'more',
    'less',
    'without',
    'exclude'
  ]

  private static readonly WIDEN_CUES = [
    'broader',
    'broaden',
    'wider',
    'more options',
    'open to',
    'either',
    'any',
    'no preference',
    'anything'
  ]

  private static readonly REPLACE_CUES = [
    'replace',
    'swap',
    'switch to',
    'instead',
    'rather than',
    'instead of',
    'not x',
    'not this'
  ]
  private static readonly MOVIE_HINT_KEYWORDS = [
    'movie', 'movies', 'film', 'films', 'cinema', 'feature'
  ]

  private static readonly TV_HINT_KEYWORDS = [
    'tv', 'series', 'show', 'shows', 'season', 'seasons', 'episode', 'episodes'
  ]

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
    'Documentary': ['documentary', 'real', 'true', 'educational'],
    'Indie': ['indie', 'independent', 'arthouse', 'art house', 'festival', 'hidden gem', 'cult']
  }

  private static readonly MOOD_KEYWORDS: Record<string, string[]> = {
    'Happy': ['happy', 'uplifting', 'feel-good', 'cheerful', 'light', 'fun'],
    'Sad': ['sad', 'emotional', 'crying', 'melancholic', 'depressing'],
    'Intense': ['intense', 'adrenaline', 'fast-paced', 'fast paced', 'suspenseful', 'gripping', 'faster pace'],
    'Relaxing': ['relaxing', 'chill', 'cozy', 'calm', 'peaceful', 'easy-going', 'slower pace', 'slow pace', 'slower', 'gentle'],
    'Funny': ['funny', 'hilarious', 'laugh', 'comedy', 'witty'],
    'Thoughtful': ['thoughtful', 'philosophical', 'intelligent', 'educational', 'inspiring'],
    'Dark': ['dark', 'gritty', 'bleak', 'moody', 'brooding'],
    'Romantic': ['romantic', 'love', 'tender', 'passionate'],
    'Suspenseful': ['suspenseful', 'tension', 'thrilling', 'edge-of-seat'],
    'Surprising': ['surprising', 'unexpected', 'offbeat', 'unusual', 'different', 'left-field']
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

  // Phase 5: Actor/talent extraction patterns
  private static readonly ACTOR_PATTERNS = [
    /with\s+(?:['"])?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/g,
    /(?:starring|featuring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/g,
    /cast:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/g
  ]

  // Phase 5: Situation/context keywords for mood detection
  private static readonly SITUATION_KEYWORDS: Record<string, string[]> = {
    'Lazy': ['lazy', 'cozy', 'relax', 'chill', 'wind down', 'unwind'],
    'Stuck': ['stuck', 'trapped', 'can\'t go out', 'lockdown', 'snowed in'],
    'Date': ['date night', 'with someone', 'with my', 'together', 'couples'],
    'Sick': ['sick', 'ill', 'not feeling', 'bed', 'recovery'],
    'Late': ['late night', '3am', 'can\'t sleep', 'insomnia', 'night owl'],
    'Weekend': ['weekend', 'saturday', 'sunday', 'friday night']
  }

  private static readonly NOVELTY_KEYWORDS = [
    'indie',
    'independent',
    'hidden gem',
    'hidden gems',
    'underrated',
    'offbeat',
    'cult',
    'arthouse',
    'art house',
    'festival',
    'surprising',
    'unexpected',
    'unusual'
  ]

  private static readonly MAINSTREAM_KEYWORDS = [
    'blockbuster',
    'blockbusters',
    'mainstream',
    'popular hits',
    'big hits',
    'widely known',
    'crowd-pleaser',
    'crowd pleaser'
  ]

  private static readonly CONTRASTIVE_CONNECTORS = [
    ' but ',
    ' instead ',
    ' rather than ',
    ' not as ',
    ' less ',
    ' more '
  ]

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
    const analysisText = this.buildAnalysisText(request)
    const description = analysisText.toLowerCase()

    // Start with defaults
    const preferences: ParsedPreferences = {
      genres: [],
      mood: [],
      contentType: this.inferContentType(analysisText, request.preferences?.contentType),
      maxRating: request.preferences?.maxRating || 'R',
      referenceTitle: [],
      excludedGenres: [],
      constraints: [],
      moodStrength: new Map(),
      boostedMoods: [],
      reducedMoods: [],
      popularityPreference: undefined
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

    // Track comparative/contrastive constraints for reference-style prompts.
    const comparative = this.extractComparativeMoodShifts(description)
    preferences.boostedMoods = comparative.boostedMoods
    preferences.reducedMoods = comparative.reducedMoods
    preferences.isContrastiveReference = comparative.isContrastive

    // Detect novelty-oriented discovery intent (e.g., "surprising indie gems").
    preferences.noveltyIntent = this.hasNoveltyIntent(description)

    // Parse refinement-specific ranking preferences (e.g. blockbusters, 80s).
    const refinementSignals = this.extractRefinementSignals(description)
    if (refinementSignals.popularityPreference) {
      preferences.popularityPreference = refinementSignals.popularityPreference
    }
    if (refinementSignals.yearRange) {
      preferences.yearRange = refinementSignals.yearRange
    }
    if (refinementSignals.constraints.length > 0) {
      preferences.constraints = Array.from(
        new Set([...(preferences.constraints || []), ...refinementSignals.constraints])
      )
    }

    // If novelty intent is explicit, enrich retrieval hints without hardcoding a single prompt.
    if (preferences.noveltyIntent) {
      if (!preferences.genres.includes('Indie')) {
        preferences.genres.push('Indie')
      }
      if (preferences.constraints) {
        preferences.constraints = Array.from(new Set([...preferences.constraints, 'novelty', 'discovery']))
      }
    }

    // === PHASE 5: Extract actors and classify intent ===
    preferences.detectedActors = this.extractActors(analysisText)
    const intentClassification = this.classifyIntent(
      preferences.referenceTitle || [],
      preferences.detectedActors || [],
      Array.from(preferences.moodStrength?.keys() || []),
      this.hasSituationKeywords(description),
      preferences.isContrastiveReference || false,
      preferences.noveltyIntent || false
    )
    preferences.discoveryMode = intentClassification.mode
    preferences.intentConfidence = intentClassification.confidence
    preferences.intentSignals = intentClassification.signals
    preferences.turnOperation = this.inferTurnOperation(request, preferences)

    // Store original description for later use
    preferences.description = analysisText

    // If no genres found, infer genre hints from mood/novelty for non-reference discovery.
    if (
      preferences.genres.length === 0 &&
      !request.preferences?.genres &&
      (preferences.referenceTitle?.length || 0) === 0
    ) {
      preferences.genres = this.inferFallbackGenresFromMood(preferences)
    }

    return preferences
  }

  private static inferTurnOperation(
    request: RecommendationRequest,
    preferences: ParsedPreferences
  ): TurnOperation | undefined {
    const clarificationRound = request.clarificationContext?.clarificationRound ?? 0
    const latestTurn = request.clarificationContext?.userClarification?.trim().toLowerCase()

    if (clarificationRound === 0 || !latestTurn) {
      return undefined
    }

    const rationaleTags: string[] = []
    let continuity: TurnContinuity = 'continue'
    let operation: TurnOperationType = 'narrow'
    let confidence = 0.55

    const hasHardPivotCue = this.HARD_PIVOT_CUES.some(cue => latestTurn.includes(cue))
    const hasSoftPivotCue = this.SOFT_PIVOT_CUES.some(cue => latestTurn.includes(cue))
    const hasReplaceCue = this.REPLACE_CUES.some(cue => latestTurn.includes(cue))
    const hasWidenCue = this.WIDEN_CUES.some(cue => latestTurn.includes(cue))
    const hasNarrowCue = this.NARROW_CUES.some(cue => latestTurn.includes(cue))
    const hasNewAnchorSignals =
      /(like|similar to|in the style of|vibes of)\s+/.test(latestTurn) ||
      /(?:with|starring|featuring|cast:)\s+[a-z]/.test(latestTurn)

    if (hasHardPivotCue) {
      continuity = 'hard_pivot'
      confidence += 0.3
      rationaleTags.push('hard_pivot_cue')
    } else if (hasSoftPivotCue || hasNewAnchorSignals) {
      continuity = 'soft_pivot'
      confidence += hasNewAnchorSignals ? 0.2 : 0.15
      if (hasSoftPivotCue) {
        rationaleTags.push('soft_pivot_cue')
      }
      if (hasNewAnchorSignals) {
        rationaleTags.push('anchor_shift')
      }
    }

    if (hasReplaceCue) {
      operation = 'replace'
      confidence += 0.2
      rationaleTags.push('replace_cue')
    } else if (hasWidenCue && !hasNarrowCue) {
      operation = 'widen'
      confidence += 0.15
      rationaleTags.push('widen_cue')
    } else if (hasNarrowCue) {
      operation = 'narrow'
      confidence += 0.1
      rationaleTags.push('narrow_cue')
    }

    if (continuity === 'soft_pivot' && operation === 'replace') {
      continuity = 'hard_pivot'
      rationaleTags.push('pivot_promoted_by_replace')
      confidence += 0.05
    }

    return {
      continuity,
      operation,
      confidence: Math.max(0.4, Math.min(0.95, confidence)),
      rationaleTags: Array.from(new Set(rationaleTags))
    }
  }

  private static buildAnalysisText(request: RecommendationRequest): string {
    const base = request.description || ''
    const clarification = request.clarificationContext?.userClarification?.trim()
    const cumulativeConstraints = request.clarificationContext?.cumulativeConstraints || []

    const cumulative = cumulativeConstraints
      .map(value => value.trim())
      .filter(Boolean)
      .join(' ')

    if (!clarification && !cumulative) {
      return base
    }

    return `${base} ${cumulative} ${clarification || ''}`.trim()
  }

  private static extractRefinementSignals(description: string): {
    popularityPreference?: 'mainstream' | 'niche'
    yearRange?: { min?: number; max?: number }
    constraints: string[]
  } {
    const constraints: string[] = []
    let popularityPreference: 'mainstream' | 'niche' | undefined

    const hasMainstream = this.MAINSTREAM_KEYWORDS.some(keyword => description.includes(keyword))
    const hasNiche = this.NOVELTY_KEYWORDS.some(keyword => description.includes(keyword))

    if (/(not|less)\s+mainstream/.test(description) || hasNiche) {
      popularityPreference = 'niche'
    } else if (hasMainstream) {
      popularityPreference = 'mainstream'
    }

    if (popularityPreference) {
      constraints.push(`popularity:${popularityPreference}`)
    }

    const explicitDecades = Array.from(description.matchAll(/\b(19\d0|20\d0)s\b/g))
      .map(match => parseInt(match[1], 10))

    const shorthandDecades = Array.from(description.matchAll(/\b([6-9]0|00|10|20)s\b/g))
      .map(match => {
        const shortValue = parseInt(match[1], 10)
        if (shortValue <= 30) {
          return 2000 + shortValue
        }
        return 1900 + shortValue
      })

    const decades = Array.from(new Set([...explicitDecades, ...shorthandDecades]))
      .filter(year => Number.isFinite(year) && year >= 1960 && year <= 2030)

    const yearRange = decades.length > 0
      ? {
          min: Math.min(...decades),
          max: Math.max(...decades) + 9
        }
      : undefined

    if (yearRange?.min !== undefined) {
      constraints.push(`decade:${yearRange.min}s`)
    }

    return {
      popularityPreference,
      yearRange,
      constraints
    }
  }

  private static inferContentType(
    description: string,
    explicitType?: 'movie' | 'tv' | 'both'
  ): 'movie' | 'tv' | 'both' {
    if (explicitType) {
      return explicitType
    }

    const lower = description.toLowerCase()
    const hasMovieHint = this.MOVIE_HINT_KEYWORDS.some(keyword => lower.includes(keyword))
    const hasTVHint = this.TV_HINT_KEYWORDS.some(keyword => lower.includes(keyword))

    if (hasMovieHint && !hasTVHint) {
      return 'movie'
    }

    if (hasTVHint && !hasMovieHint) {
      return 'tv'
    }

    return 'both'
  }

  private static inferFallbackGenresFromMood(preferences: ParsedPreferences): string[] {
    const moodToGenres: Record<string, string[]> = {
      'Relaxing': ['Drama', 'Romance', 'Documentary', 'Indie'],
      'Funny': ['Comedy'],
      'Thoughtful': ['Drama', 'Documentary', 'Indie'],
      'Intense': ['Action', 'Thriller'],
      'Suspenseful': ['Thriller', 'Mystery', 'Crime'],
      'Dark': ['Thriller', 'Crime', 'Horror'],
      'Romantic': ['Romance', 'Drama'],
      'Happy': ['Comedy', 'Family'],
      'Sad': ['Drama'],
      'Surprising': ['Indie', 'Mystery', 'Thriller']
    }

    const inferred = new Set<string>()

    for (const mood of preferences.mood || []) {
      const mappedGenres = moodToGenres[mood] || []
      mappedGenres.forEach(genre => inferred.add(genre))
    }

    if (preferences.noveltyIntent) {
      inferred.add('Indie')
    }

    if (inferred.size === 0) {
      return ['Drama', 'Comedy']
    }

    return Array.from(inferred).slice(0, 4)
  }

  private static hasNoveltyIntent(description: string): boolean {
    const lower = description.toLowerCase()
    return this.NOVELTY_KEYWORDS.some(keyword => lower.includes(keyword))
  }

  private static extractComparativeMoodShifts(description: string): {
    isContrastive: boolean
    boostedMoods: string[]
    reducedMoods: string[]
  } {
    const lower = description.toLowerCase()
    const boostedMoods: string[] = []
    const reducedMoods: string[] = []

    const isContrastive = this.CONTRASTIVE_CONNECTORS.some(connector => lower.includes(connector))

    // Generalized directional rules for common tone comparisons.
    if (/(more|extra|bit more)\s+(relaxing|calm|chill|cozy|peaceful)/i.test(lower)) {
      boostedMoods.push('Relaxing')
      reducedMoods.push('Intense')
      reducedMoods.push('Funny')
      reducedMoods.push('Happy')
    }

    if (/(slower|slower pace|slow pace|more measured|gentler)/i.test(lower)) {
      boostedMoods.push('Relaxing')
      reducedMoods.push('Intense')
    }

    if (/(faster|faster pace|more kinetic|more adrenaline)/i.test(lower)) {
      boostedMoods.push('Intense')
      reducedMoods.push('Relaxing')
    }

    if (/(less|not as)\s+(intense|dark|suspenseful|gritty)/i.test(lower)) {
      reducedMoods.push('Intense')
      reducedMoods.push('Dark')
      reducedMoods.push('Suspenseful')
    }

    if (/(more|extra|bit more)\s+(funny|light|lighthearted|uplifting)/i.test(lower)) {
      boostedMoods.push('Funny')
      boostedMoods.push('Happy')
    }

    if (/(less|not as)\s+(funny|light|lighthearted)/i.test(lower)) {
      reducedMoods.push('Funny')
      reducedMoods.push('Happy')
    }

    return {
      isContrastive,
      boostedMoods: Array.from(new Set(boostedMoods)),
      reducedMoods: Array.from(new Set(reducedMoods))
    }
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

  /**
   * Phase 5: Extract actor/talent names from description
   * Patterns: "with Tom Cruise", "starring Ryan Gosling", "cast: Tom Hanks"
   */
  private static extractActors(description: string): string[] {
    const actors: string[] = []

    for (const pattern of this.ACTOR_PATTERNS) {
      let match
      while ((match = pattern.exec(description)) !== null) {
        const names = match[1]
          .split(/\s+and\s+|\s*,\s*/)
          .map(n => n.trim())
          .filter(n => n.length > 2)
        actors.push(...names)
      }
    }

    return [...new Set(actors)]  // Deduplicate
  }

  /**
   * Phase 5: Detect if description contains situation keywords
   * E.g., "lazy Sunday", "date night", "stuck at home"
   */
  private static hasSituationKeywords(description: string): boolean {
    const lower = description.toLowerCase()
    return Object.values(this.SITUATION_KEYWORDS)
      .some(keywords => keywords.some(kw => lower.includes(kw)))
  }

  /**
   * Phase 5: Classify the primary intent mode and confidence
   * Returns: mood | reference | talent | mixed
   */
  private static classifyIntent(
    referenceTitle: string[],
    actors: string[],
    moods: string[],
    hasSituation: boolean,
    isContrastiveReference: boolean,
    noveltyIntent: boolean
  ): IntentClassification {
    const signals: IntentSignals = {
      foundReferenceTitle: referenceTitle.length > 0,
      foundActorNames: actors.length > 0,
      hasMoodDescriptors: moods.length > 0,
      hasSituationDescriptors: hasSituation,
      conflictingSignals: false
    }

    let mode: DiscoveryMode = 'mixed'
    let confidence = 0.5

    // Priority order: talent > reference > mood > mixed
    if (actors.length > 0) {
      mode = 'talent'
      confidence = Math.min(1.0, 0.85 + actors.length * 0.05)  // Higher with more actors
    } else if (referenceTitle.length > 0) {
      mode = 'reference'
      confidence = Math.min(1.0, 0.85 + referenceTitle.length * 0.05)
    } else if (moods.length > 0 || hasSituation) {
      mode = 'mood'
      confidence = 0.75 + (hasSituation ? 0.15 : 0)
    } else if (noveltyIntent) {
      // Novelty discovery queries should not default to low-confidence mixed.
      mode = 'mood'
      confidence = 0.7
    } else {
      mode = 'mixed'
      confidence = 0.3  // Low confidence for empty/vague queries
    }

    // Detect conflicts (multiple strong signals)
    const strongSignals = [
      actors.length > 0,
      referenceTitle.length > 0,
      moods.length > 0 && moods.length <= 1
    ]
    const signalCount = strongSignals.filter(s => s).length

    const isActorMoodCompatible = actors.length > 0 && moods.length === 1 && referenceTitle.length === 0
    const isReferenceContrastCompatible =
      referenceTitle.length > 0 && moods.length === 1 && isContrastiveReference && actors.length === 0

    signals.conflictingSignals =
      signalCount > 1 && !isActorMoodCompatible && !isReferenceContrastCompatible

    // If conflicting signals, lower confidence and mark as ambiguous
    if (signals.conflictingSignals) {
      confidence = Math.max(0.4, confidence - 0.2)
      mode = 'mixed'
    } else if (isActorMoodCompatible) {
      // Compatible dual-signal queries should stay talent-primary.
      mode = 'talent'
      confidence = Math.max(0.78, confidence - 0.05)
    } else if (isReferenceContrastCompatible) {
      // Contrastive reference requests are explicit enough to keep reference mode.
      mode = 'reference'
      confidence = Math.max(0.76, confidence - 0.08)
    }

    // Multiple mood targets without an anchor are often ambiguous and should clarify.
    if (actors.length === 0 && referenceTitle.length === 0 && moods.length > 1) {
      mode = 'mixed'
      confidence = Math.min(confidence, 0.58)
      signals.conflictingSignals = true
    }

    return {
      mode,
      confidence,
      signals,
      ambiguities: signals.conflictingSignals ? ["Multiple intent signals detected; could you clarify?"] : undefined
    }
  }

  /**
   * Phase 5: Determine if clarification is needed
   * Returns null if confidence is high, otherwise returns clarification questions
   * Confidence threshold: 0.65 (return results if >= 0.65, ask if < 0.65)
   */
  static needsClarification(
    preferences: ParsedPreferences,
    clarificationRound: number = 0
  ): Array<{
    id: string
    question: string
    type: 'select' | 'text' | 'boolean'
    options?: string[]
  }> | null {
    const CONFIDENCE_THRESHOLD = 0.65
    const MIXED_SAFE_THRESHOLD = 0.72
    const confidence = preferences.intentConfidence ?? 0.5

    // On follow-up rounds, always return recommendations
    if (clarificationRound > 0) {
      return null
    }

    // Contrastive reference requests need a directional target to rank properly.
    if (
      preferences.isContrastiveReference &&
      preferences.referenceTitle &&
      preferences.referenceTitle.length > 0 &&
      (preferences.boostedMoods?.length || 0) === 0 &&
      (preferences.reducedMoods?.length || 0) === 0
    ) {
      return [
        {
          id: 'contrastive_target',
          question: `You asked for something like "${preferences.referenceTitle[0]}" with a different vibe. Which direction should I prioritize?`,
          type: 'select',
          options: ['More relaxing', 'More intense', 'Funnier', 'Darker']
        }
      ]
    }

    // Mixed intent near threshold is fragile; ask one disambiguation question.
    if (preferences.discoveryMode === 'mixed' && confidence < MIXED_SAFE_THRESHOLD) {
      return [
        {
          id: 'mixed_disambiguation',
          question: 'What do you mean by "surprise me"?',
          type: 'select',
          options: ['Go mood-first', 'Go title-similarity first', 'Go cast/director first']
        }
      ]
    }

    // On first round, ask only if confidence is low after specialized checks.
    if (clarificationRound === 0 && confidence >= CONFIDENCE_THRESHOLD) {
      return null
    }

    // Generate clarification questions based on detected signals and mode
    const questions: Array<{
      id: string
      question: string
      type: 'select' | 'text' | 'boolean'
      options?: string[]
    }> = []

    const signals = preferences.intentSignals

    // Case: Conflicting signals (multiple intent types detected)
    if (signals?.conflictingSignals && preferences.discoveryMode === 'mixed') {
      if (
        signals.foundActorNames &&
        signals.foundReferenceTitle &&
        signals.hasMoodDescriptors
      ) {
        // All three types detected - ask which is primary
        questions.push({
          id: 'primary_intent',
          question: 'You mentioned actor(s), a reference title, and a mood. Which matters most to you?',
          type: 'select',
          options: ['Finding movies with specific actors', 'Similar to a movie I like', 'A specific mood or vibe']
        })
      } else if (signals.foundActorNames && signals.foundReferenceTitle) {
        // Both actor and reference detected
        questions.push({
          id: 'actor_vs_reference',
          question: 'Should I prioritize movies with those actors, or movies similar to the reference you mentioned?',
          type: 'select',
          options: ['Actors are key', 'Reference title matters more', 'Both equally']
        })
      } else if (
        signals.foundReferenceTitle &&
        signals.hasMoodDescriptors &&
        (preferences.mood && preferences.mood.length > 1)
      ) {
        // Reference + multiple conflicting moods
        questions.push({
          id: 'mood_priority',
          question: `You want something like "${preferences.referenceTitle?.[0]}" but also with moods: ${preferences.mood.join(', ')}. Do you want similar vibes to the reference, or the moods you mentioned?`,
          type: 'select',
          options: ['Similar to reference title', 'The moods you mentioned', 'Both']
        })
      }
    }

    // If we generated any questions, return them
    if (questions.length > 0) {
      return questions
    }

    // Default: No clarification needed (confidence is good or on follow-up round)
    return null
  }
}


