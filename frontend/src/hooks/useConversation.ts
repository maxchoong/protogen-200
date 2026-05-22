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

export interface ConversationMessage {
  id: string
  role: MessageRole
  text: string
  timestamp: number
  detectedIntent?: DetectedIntent
  clarificationQuestions?: ClarificationQuestion[]
  recommendations?: any[]
}

export interface ConversationState {
  messages: ConversationMessage[]
  isLoading: boolean
  error: string | null
  clarificationRound: number
  lastQuery: string
  lastIntent?: DetectedIntent
}

const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

export function useConversation() {
  const [state, setState] = useState<ConversationState>({
    messages: [],
    isLoading: false,
    error: null,
    clarificationRound: 0,
    lastQuery: ''
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

  const reset = useCallback(() => {
    setState({
      messages: [],
      isLoading: false,
      error: null,
      clarificationRound: 0,
      lastQuery: '',
      lastIntent: undefined
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
    reset
  }
}

export type ConversationController = ReturnType<typeof useConversation>
