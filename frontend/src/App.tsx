import { useState } from 'react'
import ConversationalHome from './pages/ConversationalHome'
import ResultsPage from './pages/ResultsPage'
import { useTheme } from './hooks/useTheme'

interface RecommendationRequest {
  description: string
  region?: string
  clarificationContext?: {
    clarificationRound: number
    userClarification: string
    askedQuestionIds?: string[]
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
  const { theme, toggleTheme } = useTheme()
  const [currentPage, setCurrentPage] = useState<'home' | 'results'>('home')
  const [results, setResults] = useState<any[]>([])
  const [query, setQuery] = useState<string>('')

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
    clarificationContext?: {
      clarificationRound: number
      userClarification: string
      askedQuestionIds?: string[]
    }
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
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="fixed right-4 top-4 z-40">
        <button
          onClick={toggleTheme}
          className="rounded-pill border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        </button>
      </div>

      {currentPage === 'home' ? (
        <ConversationalHome 
          onSubmit={handleConversationSubmit}
          onNavigateToResults={handleNavigateToResults}
        />
      ) : (
        <ResultsPage results={results} query={query} onBackHome={handleBackHome} />
      )}
    </div>
  )
}

export default App
