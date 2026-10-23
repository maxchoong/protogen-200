import { useState } from 'react'
import ConversationalHome from './pages/ConversationalHome'
import ResultsPage from './pages/ResultsPage'
import AmbientBackground from './components/AmbientBackground'
import LensTweakPanel from './components/LensTweakPanel'
import { isTweakPanelEnabled } from './lensTweaks'
import { useTheme } from './hooks/useTheme'
import { useConversation, type ClarificationQuestion, type LLMUsageDiagnostics, type RequestDiagnostics } from './hooks/useConversation'
import { buttonClass } from './buttonStyles'
import './App.css'
import { readRecommendationStream, type RecommendationProgress } from './recommendationStream'

interface RecommendationRequest {
  description: string
  region?: string
  clarificationContext?: {
    clarificationRound: number
    userClarification: string
    askedQuestionIds?: string[]
    previousRecommendationIds?: string[]
    cumulativeConstraints?: string[]
    userTurns?: string[]
  }
  spec?: unknown
  selectedOptionToken?: string
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
  assistantMessage?: string
  llmDiagnostics?: LLMUsageDiagnostics
  requestDiagnostics?: RequestDiagnostics
  spec?: unknown
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
    questions: ClarificationQuestion[]
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
    },
    spec?: unknown,
    selectedOptionToken?: string,
    signal?: AbortSignal,
    onProgress?: (progress: RecommendationProgress) => void
  ): Promise<RecommendationResponse> => {
    const payload: RecommendationRequest = {
      description,
      region: inferStreamingRegion(),
      clarificationContext,
      spec,
      selectedOptionToken
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
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(payload),
        signal,
      })

      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        return await readRecommendationStream<RecommendationResponse>(response, onProgress, signal)
      }
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
      llmDiagnostics?: LLMUsageDiagnostics
      requestDiagnostics?: RequestDiagnostics
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
      llmDiagnostics: options?.llmDiagnostics,
      requestDiagnostics: options?.requestDiagnostics,
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
    <div className="app-shell relative isolate min-h-screen bg-bg text-text">
      <AmbientBackground theme={theme} />
      {isTweakPanelEnabled() && <LensTweakPanel theme={theme} />}
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
                size: 'md',
                className: `${showResetConfirm ? 'glass--accent' : ''} whitespace-nowrap`
              })}
              aria-label="Start a new conversation"
            >
              {showResetConfirm ? 'Confirm reset' : 'New chat'}
            </button>
            <button
              onClick={toggleTheme}
              className={buttonClass({ variant: 'subtle', size: 'switch', className: 'theme-switch' })}
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Dark mode"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              data-theme-mode={theme}
            >
              <span className="theme-switch__thumb" aria-hidden="true" />
              <svg
                className="theme-switch__icon theme-switch__icon--sun"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
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
              <svg
                className="theme-switch__icon theme-switch__icon--moon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20.3 15.4A8.5 8.5 0 0 1 8.6 3.7a8.7 8.7 0 1 0 11.7 11.7Z" />
              </svg>
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
