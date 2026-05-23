import { useState, useCallback } from 'react'

export type MessageRole = 'user' | 'assistant'

export interface ClarificationQuestion {
  id: string
  question: string
  type: 'select' | 'text' | 'boolean'
  options?: string[]
}

export interface DetectedIntent {
  mode: 'mood' | 'reference' | 'talent' | 'mixed'
  confidence: number
}

export interface TurnOperation {
  continuity: 'continue' | 'soft_pivot' | 'hard_pivot'
  operation: 'narrow' | 'widen' | 'replace'
  confidence: number
  rationaleTags: string[]
}

export interface RecommendationPass {
  id: string
  query: string
  triggerText: string
  timestamp: number
  recommendations: any[]
  detectedIntent?: DetectedIntent
  turnOperation?: TurnOperation
  appliedConstraints?: string[]
  refinementSuggestions?: string[]
  retrievalDiagnostics?: {
    tmdbEnabled: boolean
    usedTmdb: boolean
    usedOmdb: boolean
    omdbFallbackUsed: boolean
  }
  requiresDirectionConfirmation?: boolean
  directionConfirmationChoice?: 'keep_direction' | 'pivot_direction'
  directionConfirmationResolvedAt?: number
  confirmationTrace?: {
    fromChoice: 'keep_direction' | 'pivot_direction'
    outcomeContinuity?: TurnOperation['continuity']
    aligned: boolean
  }
}

export interface ConversationMessage {
  id: string
  role: MessageRole
  text: string
  timestamp: number
  detectedIntent?: DetectedIntent
  clarificationQuestions?: ClarificationQuestion[]
  recommendations?: any[]
  turnOperation?: TurnOperation
}

export interface ConversationState {
  messages: ConversationMessage[]
  isLoading: boolean
  error: string | null
  hasCompletedInitialRequest: boolean
  clarificationRound: number
  lastQuery: string
  lastIntent?: DetectedIntent
  recommendationPasses: RecommendationPass[]
  activePassIndex: number
}

const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

export function useConversation() {
  const [state, setState] = useState<ConversationState>({
    messages: [],
    isLoading: false,
    error: null,
    hasCompletedInitialRequest: false,
    clarificationRound: 0,
    lastQuery: '',
    recommendationPasses: [],
    activePassIndex: -1
  })

  const addMessage = useCallback((message: Omit<ConversationMessage, 'id'>) => {
    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          ...message,
          id: generateMessageId()
        }
      ]
    }))
  }, [])

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }))
  }, [])

  const updateClarificationRound = useCallback((round: number) => {
    setState(prev => ({ ...prev, clarificationRound: round }))
  }, [])

  const updateLastQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, lastQuery: query }))
  }, [])

  const updateLastIntent = useCallback((intent: DetectedIntent | undefined) => {
    setState(prev => ({ ...prev, lastIntent: intent }))
  }, [])

  const markInitialRequestComplete = useCallback(() => {
    setState(prev => ({ ...prev, hasCompletedInitialRequest: true }))
  }, [])

  const addRecommendationPass = useCallback((pass: Omit<RecommendationPass, 'id' | 'timestamp'>) => {
    setState(prev => {
      const previousPass =
        prev.recommendationPasses.length > 0
          ? prev.recommendationPasses[prev.recommendationPasses.length - 1]
          : undefined

      const previousChoice = previousPass?.directionConfirmationChoice
      const outcomeContinuity = pass.turnOperation?.continuity

      const confirmationTrace = previousChoice && outcomeContinuity
        ? {
            fromChoice: previousChoice,
            outcomeContinuity,
            aligned:
              (previousChoice === 'keep_direction' && outcomeContinuity === 'continue') ||
              (previousChoice === 'pivot_direction' && outcomeContinuity !== 'continue')
          }
        : undefined

      const nextPass: RecommendationPass = {
        ...pass,
        id: generateMessageId(),
        timestamp: Date.now(),
        confirmationTrace
      }

      const recommendationPasses = [...prev.recommendationPasses, nextPass]

      return {
        ...prev,
        recommendationPasses,
        activePassIndex: recommendationPasses.length - 1
      }
    })
  }, [])

  const setActivePassIndex = useCallback((index: number) => {
    setState(prev => {
      if (index < 0 || index >= prev.recommendationPasses.length) {
        return prev
      }
      return {
        ...prev,
        activePassIndex: index
      }
    })
  }, [])

  const resolveLatestDirectionConfirmation = useCallback(
    (choice: 'keep_direction' | 'pivot_direction') => {
      setState(prev => {
        const recommendationPasses = [...prev.recommendationPasses]

        for (let idx = recommendationPasses.length - 1; idx >= 0; idx -= 1) {
          const pass = recommendationPasses[idx]
          if (pass.requiresDirectionConfirmation && !pass.directionConfirmationChoice) {
            recommendationPasses[idx] = {
              ...pass,
              directionConfirmationChoice: choice,
              directionConfirmationResolvedAt: Date.now()
            }
            break
          }
        }

        return {
          ...prev,
          recommendationPasses
        }
      })
    },
    []
  )

  const reset = useCallback(() => {
    setState({
      messages: [],
      isLoading: false,
      error: null,
      hasCompletedInitialRequest: false,
      clarificationRound: 0,
      lastQuery: '',
      lastIntent: undefined,
      recommendationPasses: [],
      activePassIndex: -1
    })
  }, [])

  return {
    state,
    addMessage,
    setLoading,
    setError,
    updateClarificationRound,
    updateLastQuery,
    updateLastIntent,
    markInitialRequestComplete,
    addRecommendationPass,
    setActivePassIndex,
    resolveLatestDirectionConfirmation,
    reset
  }
}

export type ConversationController = ReturnType<typeof useConversation>
