import { useRef, useState, type KeyboardEvent } from 'react'
import { useConversation, ClarificationQuestion, DetectedIntent } from '../hooks/useConversation'
import './ConversationalHome.css'

interface ConversationalHomeProps {
  onSubmit: (
    description: string,
    clarificationContext?: {
      clarificationRound: number
      userClarification: string
      askedQuestionIds?: string[]
    }
  ) => Promise<{
    recommendations?: any[]
    requiresClarification?: {
      questions: ClarificationQuestion[]
      context: string
      confidenceScore?: number
    }
    detectedIntent?: DetectedIntent
  }>
  onNavigateToResults?: (recommendations: any[], query: string) => void
}

type PendingPhase = 'initial' | 'slow' | 'delayed' | null

export default function ConversationalHome({
  onSubmit,
  onNavigateToResults
}: ConversationalHomeProps) {
  const conversation = useConversation()
  const { state } = conversation
  const [inputValue, setInputValue] = useState('')
  const [pendingPhase, setPendingPhase] = useState<PendingPhase>(null)
  const [lastSubmittedText, setLastSubmittedText] = useState('')
  const activeRequestRef = useRef(0)
  const slowTimerRef = useRef<number>()
  const delayedTimerRef = useRef<number>()

  const clearPendingTimers = () => {
    if (slowTimerRef.current) {
      window.clearTimeout(slowTimerRef.current)
    }
    if (delayedTimerRef.current) {
      window.clearTimeout(delayedTimerRef.current)
    }
  }

  const startPendingState = () => {
    clearPendingTimers()
    setPendingPhase('initial')
    conversation.setLoading(true)
    slowTimerRef.current = window.setTimeout(() => setPendingPhase('slow'), 2000)
    delayedTimerRef.current = window.setTimeout(() => setPendingPhase('delayed'), 8000)
  }

  const stopPendingState = () => {
    clearPendingTimers()
    setPendingPhase(null)
    conversation.setLoading(false)
  }

  const submitMessage = async (
    rawText: string,
    options: { appendUserMessage?: boolean } = {}
  ) => {
    const trimmed = rawText.trim()
    if (!trimmed) return

    const shouldAppendUserMessage = options.appendUserMessage ?? true

    if (shouldAppendUserMessage) {
      conversation.addMessage({
        role: 'user',
        text: trimmed,
        timestamp: Date.now()
      })
      setInputValue('')
    }

    setLastSubmittedText(trimmed)
    conversation.setError(null)

    const requestId = activeRequestRef.current + 1
    activeRequestRef.current = requestId
    startPendingState()

    const askedQuestionIds = state.messages.flatMap(message =>
      (message.clarificationQuestions || []).map(question => question.id)
    )

    try {
      const response = await onSubmit(
        state.clarificationRound === 0 ? trimmed : state.lastQuery,
        state.clarificationRound > 0
          ? {
              clarificationRound: state.clarificationRound,
              userClarification: trimmed,
              askedQuestionIds
            }
          : undefined
      )

      // Ignore stale responses from canceled or superseded requests.
      if (requestId !== activeRequestRef.current) {
        return
      }

      if (response.requiresClarification) {
        conversation.addMessage({
          role: 'assistant',
          text: response.requiresClarification.context,
          timestamp: Date.now(),
          clarificationQuestions: response.requiresClarification.questions,
          detectedIntent: response.detectedIntent
        })
        conversation.updateClarificationRound(state.clarificationRound + 1)
      } else if (response.recommendations && response.recommendations.length > 0) {
        conversation.addMessage({
          role: 'assistant',
          text: `Found ${response.recommendations.length} recommendations for you.`,
          timestamp: Date.now(),
          recommendations: response.recommendations,
          detectedIntent: response.detectedIntent
        })

        conversation.updateClarificationRound(0)

        if (onNavigateToResults) {
          onNavigateToResults(response.recommendations, state.lastQuery || trimmed)
        }
      } else {
        // Handle empty results (no recommendations, no clarification)
        conversation.addMessage({
          role: 'assistant',
          text: "I couldn't find good matches for that. Could you provide more details? For example, try mentioning a mood, genre, or similar title.",
          timestamp: Date.now(),
          detectedIntent: response.detectedIntent
        })
        conversation.updateClarificationRound(0)
      }

      if (state.clarificationRound === 0) {
        conversation.updateLastQuery(trimmed)
      }

      if (response.detectedIntent) {
        conversation.updateLastIntent(response.detectedIntent)
      }
    } catch (err) {
      if (requestId !== activeRequestRef.current) {
        return
      }
      conversation.setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      if (requestId === activeRequestRef.current) {
        stopPendingState()
      }
    }
  }

  const handleSubmitMessage = async () => {
    await submitMessage(inputValue)
  }

  const handleClarificationSelect = async (optionText: string) => {
    if (state.isLoading) {
      return
    }
    await submitMessage(optionText)
  }

  const handleCancelPending = () => {
    if (!state.isLoading) return
    activeRequestRef.current += 1
    stopPendingState()
    conversation.setError('Request canceled. You can refine your message and try again.')
  }

  const handleRetry = async () => {
    if (!lastSubmittedText || state.isLoading) return
    await submitMessage(lastSubmittedText, { appendUserMessage: false })
  }

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmitMessage()
    }
  }

  const latestMessage = state.messages[state.messages.length - 1]
  const showClarification =
    latestMessage?.role === 'assistant' && latestMessage?.clarificationQuestions
  const pendingLabel =
    pendingPhase === 'delayed'
      ? 'This is taking longer than usual.'
      : pendingPhase === 'slow'
        ? 'Still working on this request.'
        : 'Generating response.'

  return (
    <div className="conversational-home min-h-screen flex flex-col bg-bg text-text">
      {/* Header */}
      <div className="border-b border-border/80 bg-surface/85 px-4 py-4 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-serif text-2xl font-medium tracking-[-0.03em] text-text">Film and TV Advisor</h1>
          <p className="mt-1 text-sm text-text-muted">
            Tell me what you're looking for and I'll find the perfect thing to watch
          </p>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-5">
          {state.messages.length === 0 && (
            <div className="mt-10 rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-card">
              <p className="mb-3 text-lg font-semibold text-text">Start by describing what you want to watch.</p>
              <p className="text-sm text-text-muted">Examples:</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                {[
                  'Something funny with Ryan Gosling',
                  'Like Inception but more relaxing',
                  'A cozy weekend movie',
                  'Surprising indie gems'
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => void submitMessage(example)}
                    disabled={state.isLoading}
                    className="rounded-pill border border-border bg-surface-2 px-4 py-2 text-sm text-text transition-colors hover:border-accent hover:text-text disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg shadow-card ${
                  msg.role === 'user'
                    ? 'bg-accent text-accent-contrast rounded-br-none'
                    : 'bg-surface text-text rounded-bl-none border border-border'
                }`}
              >
                <p className="text-sm">{msg.text}</p>

                {msg.detectedIntent && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                    <span className="rounded-pill border border-border bg-surface-2 px-2.5 py-1">
                      Intent: <span className="font-semibold text-text">{msg.detectedIntent.mode}</span>
                    </span>
                    <span className="rounded-pill border border-border bg-surface-2 px-2.5 py-1">
                      Confidence {(msg.detectedIntent.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                )}

                {msg.clarificationQuestions && msg.clarificationQuestions.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {msg.clarificationQuestions.map(q => (
                      <div key={q.id} className="rounded-lg border border-border bg-surface-2 p-3">
                        <p className="mb-2 text-sm font-semibold text-text">{q.question}</p>
                        {q.type === 'select' && q.options && (
                          <div className="space-y-2">
                            {q.options.map((option, i) => (
                              <button
                                key={i}
                                onClick={() => handleClarificationSelect(option)}
                                disabled={state.isLoading}
                                className="w-full rounded-pill border border-border bg-surface px-3 py-2 text-left text-sm text-text transition-colors hover:border-accent disabled:opacity-50"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {state.isLoading && (
            <div className="flex justify-start">
              <div
                className="max-w-xs rounded-lg rounded-bl-none border border-border bg-surface px-4 py-3 text-text shadow-card"
                aria-live="polite"
                role="status"
              >
                <p className="text-sm">{pendingLabel}</p>
                <div className="mt-2 flex space-x-2" aria-hidden="true">
                  <span className="pending-dot"></span>
                  <span className="pending-dot"></span>
                  <span className="pending-dot"></span>
                </div>

                {pendingPhase === 'delayed' && (
                  <div className="mt-3">
                    <button
                      onClick={handleCancelPending}
                      className="rounded-pill border border-border px-3 py-1 text-xs text-text transition-colors hover:border-accent"
                    >
                      Cancel request
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {state.error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <p>{state.error}</p>
              {lastSubmittedText && (
                <button
                  onClick={handleRetry}
                  disabled={state.isLoading}
                  className="mt-3 rounded-pill border border-border px-3 py-1 text-xs text-text transition-colors hover:border-accent disabled:opacity-50"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border/80 bg-surface/95 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl">
          <div className="flex gap-3 rounded-lg border border-border bg-surface px-3 py-3 shadow-card">
            <textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                showClarification
                  ? 'Select or type your answer...'
                  : 'Tell me what you want to watch...'
              }
              disabled={state.isLoading}
              rows={3}
              className="flex-1 resize-none rounded-lg border border-border bg-surface-2 px-4 py-3 text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-50"
            />
            <button
              onClick={handleSubmitMessage}
              disabled={!inputValue.trim() || state.isLoading}
              className="h-fit rounded-pill border border-border bg-surface-2 px-4 py-2 font-medium text-text transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">Press Enter to send, Shift+Enter for new line.</p>
        </div>
      </div>
    </div>
  )
}
