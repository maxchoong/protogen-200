import { useRef, useState, type KeyboardEvent } from 'react'
import { ClarificationQuestion, ConversationController, DetectedIntent } from '../hooks/useConversation'
import { buttonClass } from '../buttonStyles'
import './ConversationalHome.css'

interface ConversationalHomeProps {
  conversation: ConversationController
  onSubmit: (
    description: string,
    clarificationContext?: {
      clarificationRound: number
      userClarification: string
      askedQuestionIds?: string[]
      previousRecommendationIds?: string[]
      cumulativeConstraints?: string[]
      userTurns?: string[]
    }
  ) => Promise<{
    recommendations?: any[]
    requiresClarification?: {
      questions: ClarificationQuestion[]
      context: string
      confidenceScore?: number
    }
    detectedIntent?: DetectedIntent
    turnOperation?: {
      continuity: 'continue' | 'soft_pivot' | 'hard_pivot'
      operation: 'narrow' | 'widen' | 'replace'
      confidence: number
      rationaleTags: string[]
    }
    appliedConstraints?: string[]
    interpretationNote?: string
    assistantMessage?: string
    retrievalDiagnostics?: {
      tmdbEnabled: boolean
      usedTmdb: boolean
      usedOmdb: boolean
      omdbFallbackUsed: boolean
    }
  }>
  onNavigateToResults?: (
    recommendations: any[],
    query: string,
    options?: {
      triggerText?: string
      detectedIntent?: DetectedIntent
      turnOperation?: {
        continuity: 'continue' | 'soft_pivot' | 'hard_pivot'
        operation: 'narrow' | 'widen' | 'replace'
        confidence: number
        rationaleTags: string[]
      }
      appliedConstraints?: string[]
      interpretationNote?: string
      retrievalDiagnostics?: {
        tmdbEnabled: boolean
        usedTmdb: boolean
        usedOmdb: boolean
        omdbFallbackUsed: boolean
      }
    }
  ) => void
}

type PendingPhase = 'initial' | 'slow' | 'delayed' | null

const HARD_PIVOT_CUE_PATTERN = /\b(?:instead|actually|forget that|forget this|different direction|switch gears|new direction|not that|start over)\b/i

export default function ConversationalHome({
  conversation,
  onSubmit,
  onNavigateToResults
}: ConversationalHomeProps) {
  const { state } = conversation
  const [inputValue, setInputValue] = useState('')
  const [pendingPhase, setPendingPhase] = useState<PendingPhase>(null)
  const [lastSubmittedText, setLastSubmittedText] = useState('')
  const activeRequestRef = useRef(0)
  const inFlightRef = useRef(false)
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
    inFlightRef.current = false
    setPendingPhase(null)
    conversation.setLoading(false)
  }

  const submitMessage = async (
    rawText: string,
    options: { appendUserMessage?: boolean; forceFollowUp?: boolean; questionId?: string } = {}
  ) => {
    const trimmed = rawText.trim()
    if (!trimmed || inFlightRef.current || state.isLoading) return
    inFlightRef.current = true

    const shouldAppendUserMessage = options.appendUserMessage ?? true
    const shouldTreatAsFollowUp = options.forceFollowUp ?? false
    const isFollowUp = state.hasCompletedInitialRequest || shouldTreatAsFollowUp
    const baseQuery = state.lastQuery || trimmed
    const submittedAt = Date.now()

    if (shouldAppendUserMessage) {
      const currentMessage = state.messages[state.messages.length - 1]
      if (currentMessage?.clarificationQuestions?.length && !currentMessage.clarificationResponse) {
        conversation.answerClarification(currentMessage.id, trimmed, options.questionId)
      }
      conversation.addMessage({
        role: 'user',
        text: trimmed,
        timestamp: submittedAt
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
    const latestPass = state.recommendationPasses[state.recommendationPasses.length - 1]
    const previousRecommendationIds = (latestPass?.recommendations || [])
      .map((item: any) => item?.id)
      .filter((id: string | undefined): id is string => !!id)
    const userTurns = [
      ...state.messages.filter(message => message.role === 'user').map(message => message.text),
      ...(shouldAppendUserMessage ? [trimmed] : [])
    ]
    const latestHardPivotTurn = [...userTurns].reverse().find(turn => HARD_PIVOT_CUE_PATTERN.test(turn))
    const latestHardPivotMessage = latestHardPivotTurn
      ? [...state.messages].reverse().find(message => message.role === 'user' && message.text === latestHardPivotTurn)
      : undefined
    const latestHardPivotTimestamp = latestHardPivotTurn
      ? shouldAppendUserMessage && latestHardPivotTurn === trimmed
        ? submittedAt
        : latestHardPivotMessage?.timestamp || 0
      : undefined
    const latestHardPivotPassIndex = state.recommendationPasses.reduce(
      (lastIndex, pass, index) => pass.turnOperation?.continuity === 'hard_pivot' ? index : lastIndex,
      -1
    )
    const latestHardPivotPass = state.recommendationPasses[latestHardPivotPassIndex]
    const hardPivotIsUnresolved = latestHardPivotTimestamp !== undefined &&
      (!latestHardPivotPass || latestHardPivotPass.timestamp < latestHardPivotTimestamp)
    const activePasses = latestHardPivotPassIndex >= 0
      ? state.recommendationPasses.slice(latestHardPivotPassIndex)
      : state.recommendationPasses
    const cumulativeConstraints = Array.from(
      new Set(
        (hardPivotIsUnresolved ? [] : activePasses).flatMap(pass => pass.appliedConstraints || [])
      )
    )

    try {
      const response = await onSubmit(
        isFollowUp ? baseQuery : trimmed,
        isFollowUp
          ? {
              clarificationRound: Math.max(1, state.clarificationRound),
              userClarification: trimmed,
              askedQuestionIds,
              previousRecommendationIds,
              cumulativeConstraints,
              userTurns
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
          text: response.assistantMessage
            ? response.interpretationNote
              ? `${response.assistantMessage} ${response.interpretationNote}`
              : response.assistantMessage
            : response.interpretationNote
            ? `Here are ${response.recommendations.length} recommendations you might like. ${response.interpretationNote}`
            : `Here are ${response.recommendations.length} recommendations you might like.`,
          timestamp: Date.now(),
          recommendations: response.recommendations,
          detectedIntent: response.detectedIntent,
          turnOperation: response.turnOperation
        })

        conversation.updateClarificationRound(0)

        if (onNavigateToResults) {
          onNavigateToResults(response.recommendations, state.lastQuery || trimmed, {
            triggerText: trimmed,
            detectedIntent: response.detectedIntent,
            turnOperation: response.turnOperation,
            appliedConstraints: response.appliedConstraints,
            interpretationNote: response.interpretationNote,
            retrievalDiagnostics: response.retrievalDiagnostics
          })
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

      if (!state.hasCompletedInitialRequest && !shouldTreatAsFollowUp) {
        conversation.updateLastQuery(trimmed)
        conversation.markInitialRequestComplete()
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

  const handleClarificationSelect = async (optionText: string, messageId: string, questionId: string) => {
    const currentMessage = state.messages[state.messages.length - 1]
    if (state.isLoading || inFlightRef.current || currentMessage?.id !== messageId || currentMessage.clarificationResponse) {
      return
    }

    await submitMessage(optionText, { forceFollowUp: true, questionId })
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
      ? 'Still refining your next round of results.'
      : pendingPhase === 'slow'
        ? 'Refining your selections.'
        : 'Finding your best matches.'

  return (
    <div className="conversational-home flex h-full flex-col text-text">

      {/* Messages Container */}
      <div className="editorial-conversation-scroll flex-1 overflow-y-auto px-4">
        <div className="editorial-message-stack mx-auto max-w-4xl">
          {state.messages.length === 0 && (
            <div className="editorial-intro max-w-2xl px-2 py-2 text-left">
              <p className="editorial-hero font-serif font-medium text-text">What are you in the mood for?</p>
              <p className="editorial-kicker font-serif text-base italic text-text-muted">Try a prompt:</p>
              <div className="editorial-chip-row flex flex-wrap">
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
                    className={buttonClass({ variant: 'chip', size: 'sm' })}
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
              className={`flex flex-col gap-3 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-full w-fit lg:max-w-md px-4 py-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'glass glass--accent text-accent-contrast rounded-br-none'
                    : 'glass text-text rounded-bl-none'
                }`}
              >
                <p className="text-sm">{msg.text}</p>
              </div>

              {msg.clarificationQuestions && msg.clarificationQuestions.length > 0 && (
                <div className="w-full max-w-full space-y-3 lg:max-w-md">
                  {msg.clarificationQuestions.map(question => (
                    <div key={question.id} className="space-y-3" role="group" aria-labelledby={`${msg.id}-${question.id}`}>
                      <div className="glass rounded-lg rounded-bl-none px-4 py-3 text-text">
                        <p id={`${msg.id}-${question.id}`} className="text-sm font-medium text-text">{question.question}</p>
                      </div>
                      {question.type === 'select' && question.options && (
                        <div className="space-y-2">
                          {question.options.map((option, optionIndex) => {
                            const isSelected = msg.clarificationResponse?.questionId === question.id &&
                              msg.clarificationResponse.text === option
                            return (
                              <button
                                key={optionIndex}
                                onClick={() => handleClarificationSelect(option, msg.id, question.id)}
                                disabled={state.isLoading || !!msg.clarificationResponse || msg.id !== latestMessage?.id}
                                aria-label={isSelected ? `${option} (selected)` : undefined}
                                className={buttonClass({
                                  variant: 'chip',
                                  size: 'sm',
                                  fullWidth: true,
                                  className: `clarification-option justify-start text-left${isSelected ? ' clarification-option-selected' : ''}`
                                })}
                              >
                                {option}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(msg.detectedIntent || msg.turnOperation) && (
                <div className="flex max-w-full flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-text-muted">
                  {msg.detectedIntent && (
                    <span>Intent: {msg.detectedIntent.mode} / Confidence {(msg.detectedIntent.confidence * 100).toFixed(0)}%</span>
                  )}
                  {msg.turnOperation && (
                    <span>
                      Turn: {msg.turnOperation.continuity.replace('_', ' ')} + {msg.turnOperation.operation}
                      {' '}({Math.round(msg.turnOperation.confidence * 100)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {state.isLoading && (
            <div className="flex justify-start">
              <div
                className="glass max-w-xs rounded-lg rounded-bl-none px-4 py-3 text-text"
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
                      className={buttonClass({ variant: 'chip', size: 'xs' })}
                    >
                      Cancel curation
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {state.error && (
            <div className="rounded-lg border px-4 py-3 text-sm [background-color:var(--color-alert-bg)] [border-color:var(--color-alert-border)] [color:var(--color-alert-text)]">
              <p className="font-medium">Connection issue</p>
              <p className="mt-1">{state.error}</p>
              {lastSubmittedText && (
                <button
                  onClick={handleRetry}
                  disabled={state.isLoading}
                  className={buttonClass({ variant: 'secondary', size: 'xs', className: 'mt-3' })}
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="editorial-composer-band border-t border-border/30 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="editorial-composer-row flex">
            <div className="glass flex-1 rounded-lg focus-within:ring-2 focus-within:ring-focus">
              <textarea
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  showClarification
                    ? 'Add your note or select a direction...'
                    : 'Write your viewing brief...'
                }
                disabled={state.isLoading}
                rows={3}
                className="block w-full resize-none rounded-lg bg-transparent px-4 py-3 text-text placeholder-text-muted focus:outline-none disabled:opacity-50"
              />
            </div>
            <button
              onClick={handleSubmitMessage}
              disabled={!inputValue.trim() || state.isLoading}
              className={buttonClass({ variant: 'secondary', size: 'md' })}
            >
              {state.isLoading ? 'Curating...' : 'Submit'}
            </button>
          </div>
          <p className="editorial-composer-help text-xs text-text-muted">Press Enter to submit, Shift+Enter for a new line.</p>
        </div>
      </div>
    </div>
  )
}
