'use client'

import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import MessageBubble from './MessageBubble'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  type?: 'text' | 'app_ui' | 'tool_result'
  plugin_id?: string
  plugin_state?: any
}

interface ChatMessagesProps {
  messages: Message[]
  isLoading?: boolean
  conversationId?: string
}

export default function ChatMessages({ messages, isLoading, conversationId }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <ScrollArea className="flex-1 min-h-0 overflow-hidden p-4">
      <div className="max-w-3xl mx-auto space-y-1">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            type={msg.type}
            pluginId={msg.plugin_id}
            pluginState={msg.plugin_state}
            conversationId={conversationId}
          />
        ))}
        {isLoading && (
          <div className="flex justify-start my-2">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
