'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isToolUIPart, getToolName } from 'ai'
import ChatMessages from '@/components/ChatMessages'
import { PluginProvider, usePlugin } from '@/lib/plugin-context'

interface DBMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  type?: 'text' | 'app_ui' | 'tool_result'
  plugin_id?: string
  plugin_state?: any
}

function ConversationContent() {
  const params = useParams()
  const conversationId = params.conversationId as string
  const [initialMessages, setInitialMessages] = useState<DBMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const { setSendHandler } = usePlugin()

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: { conversationId },
  }), [conversationId])

  const { messages, sendMessage, status, setMessages } = useChat({
    id: conversationId,
    transport,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // Register send handler for plugin components
  useEffect(() => {
    setSendHandler((msg: string) => {
      sendMessage({ text: msg })
    })
  }, [sendMessage, setSendHandler])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadMessages()
  }, [conversationId])

  async function loadMessages() {
    setLoaded(false)
    const res = await fetch(`/api/conversations/${conversationId}`)
    if (res.ok) {
      const data: DBMessage[] = await res.json()
      setInitialMessages(data)
      const chatMsgs = data
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.type !== 'tool_result')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          parts: m.type === 'app_ui'
            ? [{ type: 'text' as const, text: m.content }]
            : [{ type: 'text' as const, text: m.content }],
          createdAt: new Date(),
        }))
      setMessages(chatMsgs)
    }
    setLoaded(true)
  }

  // Build display messages including app_ui from DB
  const displayMessages: Array<{
    id: string
    role: 'user' | 'assistant' | 'tool'
    content: string
    type: 'text' | 'app_ui' | 'tool_result'
    plugin_id?: string
    plugin_state?: any
  }> = []

  // Add DB messages that have app_ui type (not in streaming messages)
  const streamingIds = new Set(messages.map((m) => m.id))

  for (const dbMsg of initialMessages) {
    if (dbMsg.type === 'app_ui' && !streamingIds.has(dbMsg.id)) {
      displayMessages.push({
        id: dbMsg.id,
        role: dbMsg.role as 'user' | 'assistant' | 'tool',
        content: dbMsg.content,
        type: 'app_ui' as const,
        plugin_id: dbMsg.plugin_id,
        plugin_state: dbMsg.plugin_state,
      })
    }
  }

  // Add streaming messages
  for (const m of messages) {
    const dbMsg = initialMessages.find((db) => db.id === m.id)

    // Check if this message has tool invocation parts
    const toolParts = m.parts?.filter((p) => isToolUIPart(p as any)) || []
    const textParts = m.parts?.filter((p): p is { type: 'text'; text: string } => p.type === 'text') || []

    // Add text content
    const textContent = textParts.map((p) => p.text).join('')

    if (dbMsg?.type === 'app_ui') {
      displayMessages.push({
        id: dbMsg.id,
        role: dbMsg.role as 'user' | 'assistant' | 'tool',
        content: dbMsg.content,
        type: 'app_ui' as const,
        plugin_id: dbMsg.plugin_id,
        plugin_state: dbMsg.plugin_state,
      })
    } else if (textContent || toolParts.length === 0) {
      displayMessages.push({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'tool',
        content: textContent,
        type: 'text',
      })
    }

    // Render tool results as app_ui
    for (const toolPart of toolParts) {
      const tp = toolPart as any
      console.log('[ConversationPage] Tool part:', { type: tp.type, state: tp.state, hasOutput: !!tp.output, outputShowUI: tp.output?.showUI })
      if (tp.state === 'output-available' && tp.output?.showUI) {
        const toolName = getToolName(tp)
        const pluginId = getPluginIdForTool(toolName)
        if (pluginId) {
          displayMessages.push({
            id: `${m.id}-${tp.toolCallId}`,
            role: 'assistant',
            content: JSON.stringify(tp.output.data),
            type: 'app_ui',
            plugin_id: pluginId,
            plugin_state: tp.output.data,
          })
        }
      }
    }
  }

  // Remove empty messages
  const filteredMessages = displayMessages.filter(
    (m) => m.type === 'app_ui' || m.content.trim()
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    sendMessage({ text: trimmed })
    setInput('')
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ChatMessages
        messages={filteredMessages}
        isLoading={isLoading}
        conversationId={conversationId}
      />
      <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}

function getPluginIdForTool(toolName: string): string | null {
  const toolToPlugin: Record<string, string> = {
    start_chess_game: 'chess',
    make_chess_move: 'chess',
    get_chess_hint: 'chess',
    get_board_state: 'chess',
    get_current_weather: 'weather',
    get_weather_forecast: 'weather',
    list_github_repos: 'github',
    get_repo_details: 'github',
    search_github_issues: 'github',
  }
  return toolToPlugin[toolName] || null
}

export default function ConversationPage() {
  return (
    <PluginProvider>
      <ConversationContent />
    </PluginProvider>
  )
}
