'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createClient } from '@/lib/supabase/client'

interface Conversation {
  id: string
  title: string
  updated_at: string
}

export default function ChatSidebar() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    loadConversations()
  }, [pathname])

  async function loadConversations() {
    const res = await fetch('/api/conversations')
    if (res.ok) {
      const data = await res.json()
      setConversations(data)
    }
  }

  async function createNewChat() {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/conversations', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        router.push(`/chat/${data.id}`)
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const activeId = pathname.split('/chat/')[1]

  return (
    <div className="w-64 border-r bg-gray-50 dark:bg-gray-900 flex flex-col h-full">
      <div className="p-4 border-b">
        <Button onClick={createNewChat} disabled={creating} className="w-full">
          {creating ? 'Creating...' : '+ New Chat'}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => router.push(`/chat/${conv.id}`)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors text-gray-900 dark:text-gray-200 ${
                activeId === conv.id
                  ? 'bg-gray-200 dark:bg-gray-700'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {conv.title}
            </button>
          ))}
        </div>
      </ScrollArea>
      <div className="p-4 border-t">
        <Button variant="outline" onClick={handleLogout} className="w-full text-sm">
          Sign Out
        </Button>
      </div>
    </div>
  )
}
