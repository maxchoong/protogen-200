import { useState } from 'react'
import ConversationalHome from './pages/ConversationalHome'
import ResultsPage from './pages/ResultsPage'
import { useTheme } from './hooks/useTheme'
import { useConversation } from './hooks/useConversation'

interface RecommendationRequest {
  description: string
  region?: string
  clarificationContext?: {
    clarificationRound: number
    userClarification: string
    askedQuestionIds?: string[]
    previousRecommendationIds?: string[]
    cumulativeConstraints?: string[]
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
  refinementSuggestions?: string[]
  appliedConstraints?: string[]
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
  const conversation = useConversation()
  const [currentPage, setCurrentPage] = useState<'home' | 'results'>('home')
  const [results, setResults] = useState<any[]>([])
  const [query, setQuery] = useState<string>('')
  const [activeConstraints, setActiveConstraints] = useState<string[]>([])
  const [refinementSuggestions, setRefinementSuggestions] = useState<string[]>([])

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
      previousRecommendationIds?: string[]
      cumulativeConstraints?: string[]
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

  const handleNavigateToResults = (
    recommendations: any[],
    queryText: string,
    options?: {
      refinementSuggestions?: string[]
      appliedConstraints?: string[]
    }
  ) => {
    setResults(recommendations)
    setQuery(queryText)
    setRefinementSuggestions(options?.refinementSuggestions || [])
    setActiveConstraints(options?.appliedConstraints || [])
    setCurrentPage('results')
  }

  const handleRefineResults = async (refinementText: string): Promise<void> => {
    const trimmed = refinementText.trim()
    if (!trimmed || !query) {
      return
    }

    conversation.addMessage({
      role: 'user',
      text: trimmed,
      timestamp: Date.now()
    })
    conversation.setLoading(true)
    conversation.setError(null)

    const nextConstraints = [...activeConstraints, trimmed]

    const askedQuestionIds = conversation.state.messages.flatMap(message =>
      (message.clarificationQuestions || []).map(question => question.id)
    )

    try {
      const response = await handleConversationSubmit(query, {
        clarificationRound: 1,
        userClarification: trimmed,
        askedQuestionIds,
        previousRecommendationIds: results.map(item => item.id).filter(Boolean),
        cumulativeConstraints: nextConstraints
      })

      if (response.recommendations && response.recommendations.length > 0) {
        setResults(response.recommendations)
        setActiveConstraints(response.appliedConstraints || nextConstraints)
        setRefinementSuggestions(response.refinementSuggestions || [])

        conversation.addMessage({
          role: 'assistant',
          text: `Updated results using your refinement: "${trimmed}".`,
          timestamp: Date.now(),
          recommendations: response.recommendations,
          detectedIntent: response.detectedIntent
        })

        if (response.detectedIntent) {
          conversation.updateLastIntent(response.detectedIntent)
        }

        return
      }

      conversation.addMessage({
        role: 'assistant',
        text: 'I could not improve the results from that refinement. Try being more specific about mood, era, or popularity.',
        timestamp: Date.now(),
        detectedIntent: response.detectedIntent
      })

      throw new Error('No refined recommendations returned. Try a different refinement.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refine results right now.'
      conversation.setError(message)
      throw error
    } finally {
      conversation.setLoading(false)
    }
  }

  const handleBackHome = () => {
    setCurrentPage('home')
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
          conversation={conversation}
          onSubmit={handleConversationSubmit}
          onNavigateToResults={handleNavigateToResults}
        />
      ) : (
        <ResultsPage
          results={results}
          query={query}
          onBackHome={handleBackHome}
          conversationMessages={conversation.state.messages}
          activeConstraints={activeConstraints}
          refinementSuggestions={refinementSuggestions}
          onRefine={handleRefineResults}
        />
      )}
    </div>
  )
}

export default App
