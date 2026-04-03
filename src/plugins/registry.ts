import { jsonSchema } from 'ai'
import { chessManifest } from './chess/manifest'
import { chessHandlers } from './chess/handlers'
import { weatherManifest } from './weather/manifest'
import { weatherHandlers } from './weather/handlers'
import { githubManifest } from './github/manifest'
import { githubHandlers } from './github/handlers'
import { PluginManifest, ToolResult } from './types'

interface PluginEntry {
  manifest: PluginManifest
  handlers: Record<string, (params: any, context: any) => Promise<ToolResult>>
}

const plugins: PluginEntry[] = [
  { manifest: chessManifest, handlers: chessHandlers },
  { manifest: weatherManifest, handlers: weatherHandlers },
  { manifest: githubManifest, handlers: githubHandlers },
]

export function getAllTools(context: { conversationId: string; userId: string }) {
  const tools: Record<string, any> = {}

  for (const plugin of plugins) {
    for (const toolDef of plugin.manifest.tools) {
      const handler = plugin.handlers[toolDef.name]
      if (!handler) continue

      // Build JSON Schema with type: "object" guaranteed
      const schema = {
        type: 'object' as const,
        properties: toolDef.parameters?.properties || {},
        ...(toolDef.parameters?.required ? { required: toolDef.parameters.required } : {}),
      }

      tools[toolDef.name] = {
        description: toolDef.description,
        inputSchema: jsonSchema(schema),
        execute: async (params: any) => {
          try {
            const result = await handler(params, context)
            return result
          } catch (error: any) {
            return {
              success: false,
              error: error.message || 'Tool execution failed',
            }
          }
        },
      }
    }
  }

  return tools
}

export function getPluginForTool(toolName: string): PluginManifest | undefined {
  for (const plugin of plugins) {
    if (plugin.manifest.tools.some((t) => t.name === toolName)) {
      return plugin.manifest
    }
  }
  return undefined
}

export function getPluginById(id: string): PluginEntry | undefined {
  return plugins.find((p) => p.manifest.id === id)
}
