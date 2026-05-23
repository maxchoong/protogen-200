import { useState } from 'react'
import ConversationalHome from './pages/ConversationalHome'
import ResultsPage from './pages/ResultsPage'
import { useTheme } from './hooks/useTheme'
import { useConversation } from './hooks/useConversation'
import './App.css'

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
  retrievalDiagnostics?: {
    tmdbEnabled: boolean
    usedTmdb: boolean
    usedOmdb: boolean
    omdbFallbackUsed: boolean
  }
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
  turnOperation?: {
    continuity: 'continue' | 'soft_pivot' | 'hard_pivot'
    operation: 'narrow' | 'widen' | 'replace'
    confidence: number
    rationaleTags: string[]
  }
}

function App() {
  const { theme, toggleTheme } = useTheme()
  const conversation = useConversation()
  const [showResetConfirm, setShowResetConfirm] = useState(false)

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
      triggerText?: string
      detectedIntent?: RecommendationResponse['detectedIntent']
      turnOperation?: RecommendationResponse['turnOperation']
      requiresDirectionConfirmation?: boolean
      refinementSuggestions?: string[]
      appliedConstraints?: string[]
      retrievalDiagnostics?: RecommendationResponse['retrievalDiagnostics']
    }
  ) => {
    conversation.addRecommendationPass({
      query: queryText,
      triggerText: options?.triggerText || queryText,
      recommendations,
      detectedIntent: options?.detectedIntent,
      turnOperation: options?.turnOperation,
      requiresDirectionConfirmation: options?.requiresDirectionConfirmation,
      appliedConstraints: options?.appliedConstraints || [],
      refinementSuggestions: options?.refinementSuggestions || [],
      retrievalDiagnostics: options?.retrievalDiagnostics
    })
  }

  const handleStartNewConversation = () => {
    const hasSessionContent =
      conversation.state.messages.length > 0 || conversation.state.recommendationPasses.length > 0

    if (!hasSessionContent) {
      conversation.reset()
      return
    }

    if (showResetConfirm) {
      conversation.reset()
      setShowResetConfirm(false)
      return
    }

    setShowResetConfirm(true)
    window.setTimeout(() => setShowResetConfirm(false), 4000)
  }

  const { recommendationPasses, activePassIndex } = conversation.state
  const activePass =
    activePassIndex >= 0 && activePassIndex < recommendationPasses.length
      ? recommendationPasses[activePassIndex]
      : null

  return (
    <div className="app-shell min-h-screen bg-bg text-text">
      <header className="app-topbar border-b border-border/80 bg-surface/90 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-medium tracking-[-0.03em] text-text">Lumera</h1>
            <p className="text-xs uppercase tracking-[0.14em] text-text-muted">One conversation, evolving curation</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartNewConversation}
              className="rounded-pill border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
              aria-label="Start a new conversation"
            >
              {showResetConfirm ? 'Confirm reset' : 'Start new conversation'}
            </button>
            <button
              onClick={toggleTheme}
              className="rounded-pill border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-focus"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </div>
      </header>

      <main className="app-main mx-auto grid h-[calc(100vh-83px)] w-full max-w-[1400px] gap-4 px-4 py-4 lg:grid-cols-[1.45fr_1fr]">
        <section className="min-h-0 overflow-hidden rounded-lg border border-border bg-surface">
          <ConversationalHome
            conversation={conversation}
            onSubmit={handleConversationSubmit}
            onNavigateToResults={handleNavigateToResults}
          />
        </section>

        <section className="min-h-0 overflow-hidden rounded-lg border border-border bg-surface">
          <ResultsPage
            results={activePass?.recommendations || []}
            query={activePass?.query || ''}
            passIndex={activePassIndex}
            passCount={recommendationPasses.length}
            triggerText={activePass?.triggerText}
            turnOperation={activePass?.turnOperation}
            requiresDirectionConfirmation={activePass?.requiresDirectionConfirmation}
            directionConfirmationChoice={activePass?.directionConfirmationChoice}
            confirmationTrace={activePass?.confirmationTrace}
            activeConstraints={activePass?.appliedConstraints || []}
            refinementSuggestions={activePass?.refinementSuggestions || []}
            retrievalDiagnostics={activePass?.retrievalDiagnostics}
            onPreviousPass={() => conversation.setActivePassIndex(activePassIndex - 1)}
            onNextPass={() => conversation.setActivePassIndex(activePassIndex + 1)}
          />
        </section>
      </main>
    </div>
  )
}

export default App
