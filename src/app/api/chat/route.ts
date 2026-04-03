import { streamText, stepCountIs, UIMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createClient } from '@/lib/supabase/server'
import { getAllTools, getPluginForTool } from '@/plugins/registry'

export async function POST(req: Request) {
  const body = await req.json()
  const messages: UIMessage[] = body.messages || []
  const conversationId = body.conversationId

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Save the latest user message to DB
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === 'user') {
    const content = lastMessage.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') || ''
    if (content) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content,
        type: 'text',
      })
    }
  }

  // Load conversation history from DB
  const { data: dbMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(50)

  const history = (dbMessages || [])
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .filter((m: any) => m.type !== 'tool_result')
    .map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  // Load active app sessions for context
  const { data: appSessions } = await supabase
    .from('app_sessions')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')

  let appContext = ''
  if (appSessions && appSessions.length > 0) {
    appContext = '\n\nActive apps and their current state:\n'
    for (const session of appSessions) {
      if (session.plugin_id === 'chess') {
        const state = session.state as any
        const turn = state.fen?.split(' ')[1] === 'w' ? 'White' : 'Black'
        appContext += `[Chess - active] FEN: ${state.fen}. ${turn} to move. Moves played: ${state.moveHistory?.length || 0}.\n`
      }
    }
  }

  const systemPrompt = `You are ChatBridge, a helpful AI assistant with access to third-party apps.
When a user wants to use an app, call the appropriate tool. When they ask about an app's state, use the context provided.
Only invoke app tools when the user's request is clearly related to that app.
For general questions, respond normally without using any tools.${appContext}`

  const context = { conversationId, userId: user.id }
  const tools = getAllTools(context)

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages: history,
    tools,
    stopWhen: stepCountIs(5),
    onStepFinish: async ({ toolResults }) => {
      if (toolResults) {
        for (const toolResult of toolResults) {
          const resultData = (toolResult as any).output as any
          console.log('[onStepFinish] toolResult:', {
            toolName: (toolResult as any).toolName,
            hasOutput: !!resultData,
            showUI: resultData?.showUI,
            dataKeys: resultData?.data ? Object.keys(resultData.data) : null,
          })
          if (resultData?.showUI) {
            const plugin = getPluginForTool((toolResult as any).toolName)
            if (plugin) {
              const insertResult = await supabase.from('messages').insert({
                conversation_id: conversationId,
                role: 'assistant',
                content: JSON.stringify(resultData.data),
                type: 'app_ui',
                plugin_id: plugin.id,
                plugin_state: resultData.data,
                tool_name: (toolResult as any).toolName,
              })
              console.log('[onStepFinish] SAVING APP_UI MESSAGE:', {
                type: 'app_ui',
                plugin_id: plugin.id,
                plugin_state: resultData.data,
                insertError: insertResult.error,
              })
            }
          }
        }
      }
    },
    onFinish: async ({ text }) => {
      if (text) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: text,
          type: 'text',
        })

        // Auto-title the conversation if it's early
        if (dbMessages && dbMessages.length <= 2) {
          const titleWords = text.split(' ').slice(0, 5).join(' ')
          await supabase
            .from('conversations')
            .update({ title: titleWords, updated_at: new Date().toISOString() })
            .eq('id', conversationId)
        } else {
          await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId)
        }
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
