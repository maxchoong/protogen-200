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

const MIN_TOP_COMPOSITE = 0.45
const MIN_STRONG_MATCH_COUNT = 2

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

const buildWeakMatchClarification = (mode?: 'mood' | 'reference' | 'talent' | 'mixed'): RequiresClarification => {
  const sharedContext = 'I need one more detail so I can return closer matches instead of weak guesses.'

  if (mode === 'reference') {
    return {
      context: sharedContext,
      questions: [
        {
          id: 'quality_reference_axis',
          question: 'For recommendations similar to your reference title, what should I prioritize next?',
          type: 'select',
          options: ['More relaxing tone', 'Similar plot complexity', 'Similar cast/director', 'Different but same genre']
        }
      ]
    }
  }

  if (mode === 'talent') {
    return {
      context: sharedContext,
      questions: [
        {
          id: 'quality_talent_axis',
          question: 'Should I prioritize actor match or overall vibe first?',
          type: 'select',
          options: ['Actor match first', 'Vibe first', 'Balanced']
        }
      ]
    }
  }

  return {
    context: sharedContext,
    questions: [
      {
        id: 'quality_general_axis',
        question: 'What should I tune first to improve relevance?',
        type: 'select',
        options: ['Mood/tone', 'Genre', 'Cast/crew', 'Pace (slower/faster)']
      }
    ]
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
      console.log(`[${new Date().toISOString()}] Weak recommendation set detected; requesting clarification`) 
      const clarification = buildWeakMatchClarification(parsedPreferences.discoveryMode)
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
