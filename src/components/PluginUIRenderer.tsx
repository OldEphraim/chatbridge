'use client'

import dynamic from 'next/dynamic'

const ChessComponent = dynamic(() => import('@/plugins/chess/component'), { ssr: false })
const WeatherComponent = dynamic(() => import('@/plugins/weather/component'), { ssr: false })
const GitHubComponent = dynamic(() => import('@/plugins/github/component'), { ssr: false })

interface PluginUIRendererProps {
  pluginId: string
  state: any
  conversationId?: string
}

export default function PluginUIRenderer({ pluginId, state, conversationId }: PluginUIRendererProps) {
  console.log('[PluginUIRenderer] CALLED:', { pluginId, state, conversationId })
  switch (pluginId) {
    case 'chess':
      return <ChessComponent state={state} conversationId={conversationId} />
    case 'weather':
      return <WeatherComponent state={state} />
    case 'github':
      return <GitHubComponent state={state} />
    default:
      return (
        <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">Unknown plugin: {pluginId}</p>
        </div>
      )
  }
}
