import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import 'dotenv/config'
import { validateConfig } from './config.js'
import { PreferenceParser } from './engine/preferenceParser.js'
import { recommendationEngine } from './engine/recommendationEngine.js'

export const app: Express = express()
const port = process.env.PORT || 3000

// Validate configuration on startup
validateConfig()

// Middleware
app.use(cors())
app.use(express.json())

// Types
interface RecommendationRequest {
  description: string
  region?: string
  preferences?: {
    genres?: string[]
    mood?: string[]
    type?: 'movie' | 'tv' | 'both'
    maxRating?: string
  }
  // Phase 5: Conversational intent support (optional for backward compat)
  clarificationContext?: {
    clarificationRound: number          // 0 = first, 1+ = follow-up
    previousRecommendationId?: string
    userClarification?: string           // User's answer to clarification question
    clarificationIndex?: number          // Which question answered (0-based)
    askedQuestionIds?: string[]
  }
}

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
  score?: number
  scoringFactors?: {
    composite?: number
  }
}

interface ClarificationQuestion {
  id: string                            // Unique question identifier
  question: string                      // The clarification question text
  type: 'select' | 'text' | 'boolean'  // Response type
  options?: string[]                    // For 'select' type only
}

interface RequiresClarification {
  questions: ClarificationQuestion[]
  context: string                       // Why clarification is needed
  confidenceScore?: number              // Intent confidence (0-1)
}

interface ApiResponse {
  success: boolean
  recommendations?: Recommendation[]
  requiresClarification?: RequiresClarification
  message?: string
  // Phase 5: Intent metadata (informational)
  detectedIntent?: {
    mode: 'mood' | 'reference' | 'talent' | 'mixed'
    confidence: number                  // 0-1
  }
}

type ParsedPreferencesSnapshot = ReturnType<typeof PreferenceParser.parse>

const MIN_TOP_COMPOSITE = 0.45
const MIN_STRONG_MATCH_COUNT = 2
const MAX_CLARIFICATION_TURNS = 3

const isWeakRecommendationSet = (recommendations: Recommendation[]): boolean => {
  if (recommendations.length === 0) {
    return true
  }

  const compositeScores = recommendations
    .map(r => r.scoringFactors?.composite)
    .filter((value): value is number => typeof value === 'number')

  const topComposite = compositeScores.length > 0 ? Math.max(...compositeScores) : 0
  const strongMatches = compositeScores.filter(score => score >= MIN_TOP_COMPOSITE).length

  return topComposite < MIN_TOP_COMPOSITE || strongMatches < MIN_STRONG_MATCH_COUNT
}

const nextUnaskedQuestion = (
  askedQuestionIds: Set<string>,
  candidates: ClarificationQuestion[]
): ClarificationQuestion | null => {
  for (const candidate of candidates) {
    if (!askedQuestionIds.has(candidate.id)) {
      return candidate
    }
  }
  return null
}

const hasKeywordMatch = (value: string, keywords: string[]): boolean => {
  const lower = value.toLowerCase()
  return keywords.some(keyword => lower.includes(keyword.toLowerCase()))
}

const inferClarificationState = (
  mode: 'mood' | 'reference' | 'talent' | 'mixed' | undefined,
  parsedPreferences: ParsedPreferencesSnapshot,
  latestAnswer: string,
  askedQuestionIds: Set<string>
) => {
  const lowerAnswer = latestAnswer.toLowerCase()
  const genreKeywords = [
    'action', 'comedy', 'drama', 'sci-fi', 'science fiction', 'thriller',
    'romance', 'horror', 'fantasy', 'animation', 'documentary', 'indie'
  ]

  const axisResolved =
    mode === 'talent' ||
    askedQuestionIds.has('quality_reference_axis') ||
    askedQuestionIds.has('quality_disambiguate_intent') ||
    hasKeywordMatch(lowerAnswer, [
      'mood', 'tone', 'plot', 'plot complexity', 'cast', 'director',
      'genre similarity', 'genre', 'actor', 'title', 'reference title'
    ])

  const formatResolved = true

  const paceResolved =
    askedQuestionIds.has('quality_runtime_focus') ||
    hasKeywordMatch(lowerAnswer, [
      'slower pace', 'slow pace', 'slower', 'gentler', 'more relaxed', 'relaxed pace',
      'faster pace', 'fast pace', 'faster', 'more kinetic', 'balanced pace', 'no preference'
    ])

  const eraResolved =
    askedQuestionIds.has('quality_era_focus') ||
    hasKeywordMatch(lowerAnswer, ['recent', 'last 5 years', '2010s', '2000s', 'classic', 'before 2000', 'no preference'])

  const genreResolved =
    parsedPreferences.genres.length > 0 ||
    hasKeywordMatch(lowerAnswer, genreKeywords) ||
    (mode === 'reference' && (parsedPreferences.referenceTitle?.length || 0) > 0 && axisResolved)

  const moodResolved =
    (parsedPreferences.boostedMoods?.length || 0) > 0 ||
    (parsedPreferences.reducedMoods?.length || 0) > 0 ||
    hasKeywordMatch(lowerAnswer, ['mood', 'tone', 'relaxing', 'calm', 'intense', 'dark', 'funny'])

  const enoughContextToFinalize =
    (mode === 'reference' && axisResolved && genreResolved && (paceResolved || formatResolved)) ||
    (mode === 'mood' && genreResolved && (paceResolved || formatResolved)) ||
    (mode === 'talent' && genreResolved && formatResolved) ||
    (mode === 'mixed' && axisResolved && (genreResolved || moodResolved) && (paceResolved || formatResolved))

  return {
    axisResolved,
    formatResolved,
    paceResolved,
    eraResolved,
    genreResolved,
    moodResolved,
    enoughContextToFinalize
  }
}

const buildWeakMatchClarification = (
  mode: 'mood' | 'reference' | 'talent' | 'mixed' | undefined,
  clarificationRound: number,
  askedQuestionIds: Set<string>,
  parsedPreferences: ParsedPreferencesSnapshot,
  latestAnswer: string
): RequiresClarification | null => {
  const sharedContext = 'I need one more detail so I can return closer matches instead of weak guesses.'
  const hasInferredMoodShift =
    (parsedPreferences.boostedMoods?.length || 0) > 0 ||
    (parsedPreferences.reducedMoods?.length || 0) > 0
  const modeKey: 'mood' | 'reference' | 'talent' | 'mixed' = mode || 'mixed'
  const state = inferClarificationState(modeKey, parsedPreferences, latestAnswer, askedQuestionIds)

  if (state.enoughContextToFinalize) {
    return null
  }

  const roundOneByMode: Record<'mood' | 'reference' | 'talent' | 'mixed', ClarificationQuestion[]> = {
    mood: [
      {
        id: 'quality_mood_genre_focus',
        question: 'What genre should I pair with that mood?',
        type: 'select',
        options: ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Thriller', 'Other (type your own)']
      }
    ],
    reference: [
      {
        id: 'quality_reference_axis',
        question: 'For titles similar to your reference, what should I prioritize?',
        type: 'select',
        options: [
          ...(hasInferredMoodShift ? [] : ['Mood/tone']),
          'Plot complexity',
          'Cast/director overlap',
          'Genre similarity',
          'Other (type your own)'
        ]
      }
    ],
    talent: [
      {
        id: 'quality_talent_genre_focus',
        question: 'Which genre should I focus on for that actor/director?',
        type: 'select',
        options: ['Action', 'Comedy', 'Drama', 'Romance', 'Thriller', 'Other (type your own)']
      }
    ],
    mixed: [
      {
        id: 'quality_disambiguate_intent',
        question: 'To narrow this down, what did you mean most by your request?',
        type: 'select',
        options: ['Mood/tone', 'Genre', 'A specific title', 'A specific actor/director', 'Other (type your own)']
      }
    ]
  }

  const roundOneFollowUps: ClarificationQuestion[] = [
    {
      id: 'quality_genre_focus',
      question: 'Is there a particular genre you are interested in?',
      type: 'select',
      options: ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Thriller', 'No preference', 'Other (type your own)']
    },
    {
      id: 'quality_format_focus',
      question: 'Do you want a movie, series, or either?',
      type: 'select',
      options: ['Movie', 'Series', 'Either', 'Other (type your own)']
    }
  ]

  const roundTwoGeneric: ClarificationQuestion[] = [
    {
      id: 'quality_runtime_focus',
      question: 'Do you prefer a faster pace or a slower, more relaxed pace?',
      type: 'select',
      options: ['Faster pace', 'Balanced pace', 'Slower pace', 'No preference', 'Other (type your own)']
    },
    {
      id: 'quality_era_focus',
      question: 'Any preferred release era?',
      type: 'select',
      options: ['Recent (last 5 years)', '2010s', '2000s', 'Classic (before 2000)', 'No preference']
    }
  ]

  let primaryCandidates: ClarificationQuestion[] = []

  if (clarificationRound === 0 && !state.axisResolved) {
    primaryCandidates = roundOneByMode[modeKey]
  } else if (!state.genreResolved) {
    if (modeKey === 'mood') {
      primaryCandidates = [roundOneByMode.mood[0]]
    } else if (modeKey === 'talent') {
      primaryCandidates = [roundOneByMode.talent[0]]
    } else if (modeKey === 'mixed') {
      primaryCandidates = [roundOneFollowUps[0]]
    }
  } else if (!state.paceResolved && !hasInferredMoodShift) {
    primaryCandidates = [roundTwoGeneric[0]]
  } else if (!state.eraResolved && clarificationRound >= 2) {
    primaryCandidates = [roundTwoGeneric[1]]
  }

  if (primaryCandidates.length === 0) {
    return null
  }

  const question = nextUnaskedQuestion(askedQuestionIds, primaryCandidates)
  if (!question) {
    return null
  }

  return {
    context: sharedContext,
    questions: [question]
  }
}

// Routes
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK' })
})

app.post('/recommendations', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { description, preferences, region, clarificationContext } = req.body as RecommendationRequest
    const normalizedDescription = (description || '').trim()
    const hasDescription = normalizedDescription.length > 0
    const hasPreferences = !!(
      preferences && (
        (preferences.genres && preferences.genres.length > 0) ||
        (preferences.mood && preferences.mood.length > 0) ||
        !!preferences.type ||
        !!preferences.maxRating
      )
    )

    // Validation: allow description-only OR preferences-only flow
    if (!hasDescription && !hasPreferences) {
      return res.status(400).json({
        success: false,
        message: 'Provide a description or select at least one preference.'
      })
    }

    // Validation: if description is provided, it must be at least 3 chars
    if (hasDescription && normalizedDescription.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Description must be at least 3 characters.'
      })
    }

    // Log the query (anonymized) for debugging
    console.log(`[${new Date().toISOString()}] Recommendation request:`, {
      descriptionLength: normalizedDescription.length,
      hasPreferences: !!preferences,
      preferencesKeys: preferences ? Object.keys(preferences) : [],
      region: region || 'US',
      clarificationRound: clarificationContext?.clarificationRound ?? 0,
      hasUserClarification: !!clarificationContext?.userClarification
    })

    // === PHASE 5: Parse preferences and check for clarification need ===
    const preferencesObject = preferences ? {
      genres: preferences.genres,
      mood: preferences.mood,
      contentType: preferences.type as 'movie' | 'tv' | 'both' | undefined,
      maxRating: preferences.maxRating
    } : undefined

    const parsedPreferences = PreferenceParser.parse({
      description: normalizedDescription,
      region,
      preferences: preferencesObject,
      clarificationContext
    })

    // Check if clarification is needed (only on first round, confidence-gated)
    const clarificationRound = clarificationContext?.clarificationRound ?? 0
    const clarificationQuestions = PreferenceParser.needsClarification(
      parsedPreferences,
      clarificationRound
    )

    if (clarificationQuestions) {
      console.log(`[${new Date().toISOString()}] Clarification suggested with ${clarificationQuestions.length} questions`)
      return res.json({
        success: true,
        requiresClarification: {
          questions: clarificationQuestions,
          context: 'Your request has multiple possible interpretations. Help us narrow it down:',
          confidenceScore: parsedPreferences.intentConfidence
        },
        detectedIntent: parsedPreferences.discoveryMode && parsedPreferences.intentConfidence
          ? {
              mode: parsedPreferences.discoveryMode,
              confidence: parsedPreferences.intentConfidence
            }
          : undefined
      })
    }

    // Use real recommendation engine
    const recommendations = await recommendationEngine.getRecommendations({
      description: normalizedDescription,
      region,
      preferences: preferences ? {
        genres: preferences.genres,
        mood: preferences.mood,
        contentType: preferences.type as 'movie' | 'tv' | 'both' | undefined,
        maxRating: preferences.maxRating
      } : undefined,
      clarificationContext: clarificationContext
    })

    const weakResultSet = isWeakRecommendationSet(recommendations)
    if (weakResultSet) {
      const round = clarificationContext?.clarificationRound ?? 0
      const askedQuestionIds = new Set(clarificationContext?.askedQuestionIds || [])

      if (round < MAX_CLARIFICATION_TURNS) {
        const clarification = buildWeakMatchClarification(
          parsedPreferences.discoveryMode,
          round,
          askedQuestionIds,
          parsedPreferences,
          clarificationContext?.userClarification || ''
        )

        if (clarification) {
          console.log(`[${new Date().toISOString()}] Weak recommendation set detected; requesting clarification`) 
          return res.json({
            success: true,
            requiresClarification: {
              ...clarification,
              confidenceScore: parsedPreferences.intentConfidence
            },
            detectedIntent: parsedPreferences.discoveryMode && parsedPreferences.intentConfidence !== undefined
              ? {
                  mode: parsedPreferences.discoveryMode,
                  confidence: parsedPreferences.intentConfidence
                }
              : undefined
          })
        }
      }

      console.log(`[${new Date().toISOString()}] Weak recommendation set persisted after clarification cap; returning best available results`)
    }

    res.json({
      success: true,
      recommendations,
      detectedIntent: parsedPreferences.discoveryMode && parsedPreferences.intentConfidence !== undefined
        ? {
            mode: parsedPreferences.discoveryMode,
            confidence: parsedPreferences.intentConfidence
          }
        : undefined
    })
  } catch (error) {
    console.error('Error in /recommendations:', error)
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    })
  }
})

// Health check and 404
app.get('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Not found'
  })
})

// Error handling middleware
app.use((err: any, req: Request, res: Response) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  })
})

// Start server when not running under Jest tests
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`🚀 Film & TV Advisor backend listening on port ${port}`)
    console.log(`   Health check: http://localhost:${port}/health`)
  })
}
