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
  interpretationNote?: string
  retrievalDiagnostics?: {
    tmdbEnabled: boolean
    usedTmdb: boolean
    usedOmdb: boolean
    omdbFallbackUsed: boolean
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
      const nextPass: RecommendationPass = {
        ...pass,
        id: generateMessageId(),
        timestamp: Date.now()
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
    reset
  }
}

export type ConversationController = ReturnType<typeof useConversation>
