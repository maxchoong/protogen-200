import { useState } from 'react'
import ConversationalHome from './pages/ConversationalHome'
import ResultsPage from './pages/ResultsPage'
import './App.css'

interface RecommendationRequest {
  description: string
  region?: string
  clarificationContext?: {
    clarificationRound: number
    userClarification: string
  }
  preferences?: {
    genres?: string[]
    mood?: string[]
    type?: 'movie' | 'tv' | 'both'
    maxRating?: string
  }
}

interface RecommendationResponse {
  recommendations?: any[]
  requiresClarification?: {
    questions: Array<{
      id: string
      question: string
      type: 'select' | 'text' | 'boolean'
      options?: string[]
    }>
    context: string
    confidenceScore?: number
  }
  detectedIntent?: {
    mode: 'mood' | 'reference' | 'talent' | 'mixed'
    confidence: number
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'results'>('home')
  const [results, setResults] = useState<any[]>([])
  const [query, setQuery] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const inferRegionFromLocale = (): string => {
    const locale = navigator.language || 'en-US'
    const parts = locale.split('-')
    if (parts.length > 1 && parts[1].length === 2) {
      return parts[1].toUpperCase()
    }
    return 'US'
  }

  const handleConversationSubmit = async (
    description: string,
    clarificationContext?: { clarificationRound: number; userClarification: string }
  ): Promise<RecommendationResponse> => {
    const payload: RecommendationRequest = {
      description,
      region: inferRegionFromLocale(),
      clarificationContext
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://protogen-backend-1bvp.onrender.com'
      const response = await fetch(`${backendUrl}/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to get recommendations')
      }

      const data: RecommendationResponse = await response.json()
      return data
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Something went wrong'
      throw new Error(errorMsg)
    }
  }

  const handleNavigateToResults = (recommendations: any[], queryText: string) => {
    setResults(recommendations)
    setQuery(queryText)
    setCurrentPage('results')
  }

  const handleBackHome = () => {
    setCurrentPage('home')
    setResults([])
    setQuery('')
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {currentPage === 'home' ? (
        <ConversationalHome 
          onSubmit={handleConversationSubmit}
          error={error}
          onNavigateToResults={handleNavigateToResults}
        />
      ) : (
        <ResultsPage results={results} query={query} onBackHome={handleBackHome} />
      )}
    </div>
  )
}

export default App
