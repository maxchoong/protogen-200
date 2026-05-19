import { useState } from 'react'
import { useConversation, ClarificationQuestion, DetectedIntent } from '../hooks/useConversation'
import './ConversationalHome.css'

interface ConversationalHomeProps {
  onSubmit: (description: string, clarificationContext?: any) => Promise<{
    recommendations?: any[]
    requiresClarification?: {
      questions: ClarificationQuestion[]
      context: string
      confidenceScore?: number
    }
    detectedIntent?: DetectedIntent
  }>
  loading?: boolean
  error?: string | null
  onNavigateToResults?: (recommendations: any[], query: string) => void
}

export default function ConversationalHome({
  onSubmit,
  loading = false,
  error = null,
  onNavigateToResults
}: ConversationalHomeProps) {
  const conversation = useConversation()
  const { state } = conversation
  const [inputValue, setInputValue] = useState('')

  const handleSubmitMessage = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    // Add user message
    conversation.addMessage({
      role: 'user',
      text: trimmed,
      timestamp: Date.now()
    })

    conversation.setLoading(true)
    conversation.setError(null)
    setInputValue('')

    try {
      const response = await onSubmit(
        state.clarificationRound === 0 ? trimmed : state.lastQuery,
        state.clarificationRound > 0
          ? {
              clarificationRound: state.clarificationRound,
              userClarification: trimmed
            }
          : undefined
      )

      if (response.requiresClarification) {
        // Add clarification prompt
        conversation.addMessage({
          role: 'assistant',
          text: response.requiresClarification.context,
          timestamp: Date.now(),
          clarificationQuestions: response.requiresClarification.questions,
          detectedIntent: response.detectedIntent
        })
        conversation.updateClarificationRound(1)
      } else if (response.recommendations && response.recommendations.length > 0) {
        // Add results message
        conversation.addMessage({
          role: 'assistant',
          text: `Found ${response.recommendations.length} recommendations for you!`,
          timestamp: Date.now(),
          recommendations: response.recommendations,
          detectedIntent: response.detectedIntent
        })

        // Navigate to results page
        if (onNavigateToResults) {
          onNavigateToResults(
            response.recommendations,
            state.lastQuery || trimmed
          )
        }
      }

      if (state.clarificationRound === 0) {
        conversation.updateLastQuery(trimmed)
      }

      if (response.detectedIntent) {
        conversation.updateLastIntent(response.detectedIntent)
      }
    } catch (err) {
      conversation.setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      conversation.setLoading(false)
    }
  }

  const handleClarificationSelect = (optionText: string) => {
    setInputValue(optionText)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmitMessage()
    }
  }

  const latestMessage = state.messages[state.messages.length - 1]
  const showClarification =
    latestMessage?.role === 'assistant' && latestMessage?.clarificationQuestions

  return (
    <div className="conversational-home min-h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white">🎬 Film & TV Advisor</h1>
          <p className="text-slate-400 text-sm mt-1">
            Tell me what you're looking for and I'll find the perfect thing to watch
          </p>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {state.messages.length === 0 && (
            <div className="text-center text-slate-400 mt-12">
              <p className="text-lg mb-4">👋 Start by telling me what you're in the mood for</p>
              <p className="text-sm">Examples:</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {[
                  '🎭 Something funny with Ryan Gosling',
                  '🎬 Like Inception but more relaxing',
                  '☀️ A cozy weekend movie',
                  '🎪 Surprising indie gems'
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setInputValue(example.substring(2).trim())}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
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
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-slate-700 text-slate-100 rounded-bl-none'
                }`}
              >
                <p className="text-sm">{msg.text}</p>

                {msg.detectedIntent && (
                  <div className="mt-2 text-xs text-slate-300">
                    <p>
                      🎯 Intent: <span className="font-semibold">{msg.detectedIntent.mode}</span>{' '}
                      ({(msg.detectedIntent.confidence * 100).toFixed(0)}%)
                    </p>
                  </div>
                )}

                {msg.clarificationQuestions && msg.clarificationQuestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.clarificationQuestions.map(q => (
                      <div key={q.id}>
                        <p className="font-semibold mb-1">{q.question}</p>
                        {q.type === 'select' && q.options && (
                          <div className="space-y-1">
                            {q.options.map((option, i) => (
                              <button
                                key={i}
                                onClick={() => handleClarificationSelect(option)}
                                disabled={loading}
                                className="w-full text-left px-3 py-1 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors disabled:opacity-50"
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

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg rounded-bl-none">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm">
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-700 bg-slate-900 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                showClarification
                  ? 'Select or type your answer...'
                  : 'Tell me what you want to watch...'
              }
              disabled={loading}
              rows={3}
              className="flex-1 px-4 py-2 bg-slate-800 text-white rounded-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
            />
            <button
              onClick={handleSubmitMessage}
              disabled={!inputValue.trim() || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed h-fit"
            >
              {loading ? '...' : 'Send'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}
