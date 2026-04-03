export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  tools: ToolDefinition[];
  hasUI: boolean;
  requiresAuth?: boolean;
  authProvider?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  showUI?: boolean;
  needsAuth?: boolean;
  authUrl?: string;
}
