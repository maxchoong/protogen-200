import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import 'dotenv/config'

const app: Express = express()
const port = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())

// Types
interface RecommendationRequest {
  description: string
  preferences?: {
    genres?: string[]
    mood?: string[]
    type?: 'movie' | 'tv' | 'both'
    maxRating?: string
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
  }[]
  trailerUrl?: string
}

interface ApiResponse {
  success: boolean
  recommendations?: Recommendation[]
  message?: string
}

// Mock recommendations for testing
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

app.post('/recommendations', (req: Request, res: Response<ApiResponse>) => {
  try {
    const { description, preferences } = req.body as RecommendationRequest

    // Validation
    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Description is required'
      })
    }

    // Log the query (anonymized) for debugging
    console.log(`[${new Date().toISOString()}] Recommendation request:`, {
      descriptionLength: description.length,
      hasPreferences: !!preferences,
      preferencesKeys: preferences ? Object.keys(preferences) : []
    })

    // Get mock recommendations
    const recommendations = getMockRecommendations(description)

    res.json({
      success: true,
      recommendations
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
