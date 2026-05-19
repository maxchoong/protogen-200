import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import 'dotenv/config'
import { validateConfig } from './config.js'
import { PreferenceParser } from './engine/preferenceParser.js'
import { recommendationEngine } from './engine/recommendationEngine.js'

const app: Express = express()
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

// Mock recommendations for testing (fallback when no real data)
const getMockRecommendations = (query: string): Recommendation[] => {
  const mockData: Recommendation[] = [
    {
      id: '1',
      title: 'The Shawshank Redemption',
      year: '1994',
      type: 'movie',
      synopsis: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.',
      whyThis: 'This classic drama perfectly captures emotional depth with outstanding performances.',
      posterUrl: 'https://via.placeholder.com/300x450?text=Shawshank',
      availability: [
        { platform: 'Netflix', type: 'Stream' },
        { platform: 'Amazon Prime', type: 'Rent' }
      ],
      trailerUrl: 'https://www.youtube.com/watch?v=6hB3S9bIaco'
    },
    {
      id: '2',
      title: 'The Matrix',
      year: '1999',
      type: 'movie',
      synopsis: 'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.',
      whyThis: 'Ground-breaking sci-fi action with a mind-bending plot that still holds up today.',
      posterUrl: 'https://via.placeholder.com/300x450?text=Matrix',
      availability: [
        { platform: 'HBO Max', type: 'Stream' }
      ],
      trailerUrl: 'https://www.youtube.com/watch?v=vKQi3bBA1y8'
    },
    {
      id: '3',
      title: 'Inception',
      year: '2010',
      type: 'movie',
      synopsis: 'A skilled thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea.',
      whyThis: 'Complex, intelligent sci-fi thriller with stunning visuals and an intricate plot.',
      posterUrl: 'https://via.placeholder.com/300x450?text=Inception',
      availability: [
        { platform: 'Netflix', type: 'Stream' },
        { platform: 'Disney+', type: 'Stream' }
      ],
      trailerUrl: 'https://www.youtube.com/watch?v=YoHD_XwIlIY'
    },
    {
      id: '4',
      title: 'The Crown',
      year: '2016',
      type: 'tv',
      synopsis: 'The political rivalries and romance of Queen Elizabeth II\'s reign, and the events that shaped the second half of the twentieth century.',
      whyThis: 'Prestige drama with high production values and compelling historical storytelling.',
      posterUrl: 'https://via.placeholder.com/300x450?text=TheCrown',
      availability: [
        { platform: 'Netflix', type: 'Stream' }
      ],
      trailerUrl: 'https://www.youtube.com/watch?v=JWtnJjn6ng0'
    },
    {
      id: '5',
      title: 'Gladiator',
      year: '2000',
      type: 'movie',
      synopsis: 'A former Roman General sets out to exact vengeance against the Emperor who wronged him.',
      whyThis: 'Epic historical drama with thrilling action sequences and emotional resonance.',
      posterUrl: 'https://via.placeholder.com/300x450?text=Gladiator',
      availability: [
        { platform: 'Paramount+', type: 'Stream' },
        { platform: 'Amazon Prime', type: 'Rent' }
      ],
      trailerUrl: 'https://www.youtube.com/watch?v=owK1qxDsel8'
    }
  ]

  return mockData
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

    // If no real results, fall back to mock data
    const finalRecommendations = recommendations.length > 0
      ? recommendations
      : getMockRecommendations(normalizedDescription || 'preferences-based search')

    res.json({
      success: true,
      recommendations: finalRecommendations,
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

// Start server
app.listen(port, () => {
  console.log(`🚀 Film & TV Advisor backend listening on port ${port}`)
  console.log(`   Health check: http://localhost:${port}/health`)
})
