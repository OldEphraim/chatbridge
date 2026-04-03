'use client'

import PluginUIRenderer from './PluginUIRenderer'

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'tool'
  content: string
  type?: 'text' | 'app_ui' | 'tool_result'
  pluginId?: string
  pluginState?: any
  conversationId?: string
}

export default function MessageBubble({
  role,
  content,
  type = 'text',
  pluginId,
  pluginState,
  conversationId,
}: MessageBubbleProps) {
  console.log('[MessageBubble] RENDERING:', { type, pluginId, hasPluginState: !!pluginState })

  if (type === 'tool_result') return null

  if (type === 'app_ui' && pluginId) {
    return (
      <div className="my-2 w-full">
        <PluginUIRenderer
          pluginId={pluginId}
          state={pluginState}
          conversationId={conversationId}
        />
      </div>
    )
  }

  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-2`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm">{content}</p>
      </div>
    </div>
  )
}
