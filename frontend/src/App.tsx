import { useState } from 'react'
import ConversationalHome from './pages/ConversationalHome'
import ResultsPage from './pages/ResultsPage'
import { useTheme } from './hooks/useTheme'
import { useConversation } from './hooks/useConversation'
import { buttonClass } from './buttonStyles'
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
  appliedConstraints?: string[]
  interpretationNote?: string
  retrievalDiagnostics?: {
    tmdbEnabled: boolean
    usedTmdb: boolean
    usedOmdb: boolean
    omdbFallbackUsed: boolean
    streaming?: {
      enabled: boolean
      country: string
      status: 'ok' | 'rate_limited' | 'error' | 'disabled' | 'not_requested'
    }
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

  const inferStreamingRegion = (): string => {
    const configuredRegion = import.meta.env.VITE_STREAMING_REGION?.trim().toUpperCase()
    if (configuredRegion) {
      return configuredRegion === 'UK' ? 'GB' : configuredRegion
    }

    const locale = navigator.language || 'en-US'
    const normalizedLocale = locale.replace('_', '-')
    const localeParts = normalizedLocale.split('-')
    const localeRegion = localeParts.length > 1 ? localeParts[localeParts.length - 1] : ''
    if (localeRegion.length === 2) {
      const region = localeRegion.toUpperCase()
      return region === 'UK' ? 'GB' : region
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
      region: inferStreamingRegion(),
      clarificationContext
    }

    const connectivityMessage = "We couldn't connect to our recommendation service just now. Please try again."

    try {
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL ||
        (import.meta.env.DEV
          ? 'http://localhost:3000'
          : 'https://protogen-backend-1bvp.onrender.com')
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
      // Keep technical details in console, but surface user-safe copy in the UI.
      if (error instanceof TypeError) {
        console.error('Recommendation request connectivity error:', error)
        throw new Error(connectivityMessage)
      }

      if (error instanceof Error && error.message.toLowerCase().includes('failed to fetch')) {
        console.error('Recommendation request fetch failure:', error)
        throw new Error(connectivityMessage)
      }

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
      appliedConstraints?: string[]
      interpretationNote?: string
      retrievalDiagnostics?: RecommendationResponse['retrievalDiagnostics']
    }
  ) => {
    conversation.addRecommendationPass({
      query: queryText,
      triggerText: options?.triggerText || queryText,
      recommendations,
      detectedIntent: options?.detectedIntent,
      turnOperation: options?.turnOperation,
      appliedConstraints: options?.appliedConstraints || [],
      interpretationNote: options?.interpretationNote,
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
            <h1 className="font-serif text-2xl font-extrabold leading-none tracking-[-0.028em] text-text">Lumera</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted/80">One conversation, evolving curation</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartNewConversation}
              className={buttonClass({
                variant: showResetConfirm ? 'secondary' : 'subtle',
                size: 'sm',
                className: `${showResetConfirm ? 'border-accent' : ''} whitespace-nowrap`
              })}
              aria-label="Start a new conversation"
            >
              {showResetConfirm ? 'Confirm reset' : 'New chat'}
            </button>
            <button
              onClick={toggleTheme}
              className={buttonClass({ variant: 'subtle', size: 'icon' })}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="app-main editorial-main mx-auto grid h-[calc(100vh-83px)] w-full max-w-[1400px] px-4 lg:grid-cols-[1fr_1fr]">
        <section className="editorial-left-column">
          <ConversationalHome
            conversation={conversation}
            onSubmit={handleConversationSubmit}
            onNavigateToResults={handleNavigateToResults}
          />
        </section>

        <section className="editorial-right-divider">
          <ResultsPage
            results={activePass?.recommendations || []}
            query={activePass?.query || ''}
            passIndex={activePassIndex}
            passCount={recommendationPasses.length}
            triggerText={activePass?.triggerText}
            turnOperation={activePass?.turnOperation}
            activeConstraints={activePass?.appliedConstraints || []}
            interpretationNote={activePass?.interpretationNote}
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
