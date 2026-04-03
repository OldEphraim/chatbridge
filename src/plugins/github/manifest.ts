import { PluginManifest } from '../types'

export const githubManifest: PluginManifest = {
  id: 'github',
  name: 'GitHub',
  description: 'View GitHub repositories and issues',
  hasUI: true,
  requiresAuth: true,
  authProvider: 'github',
  tools: [
    {
      name: 'list_github_repos',
      description: "List the user's GitHub repositories. Requires GitHub authentication.",
      parameters: {
        type: 'object',
        properties: {
          sort: {
            type: 'string',
            enum: ['updated', 'created', 'pushed', 'full_name'],
            description: 'How to sort the repositories. Defaults to updated.',
          },
        },
      },
    },
    {
      name: 'get_repo_details',
      description: 'Get details about a specific GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
        },
        required: ['owner', 'repo'],
      },
    },
    {
      name: 'search_github_issues',
      description: 'Search issues in a GitHub repository.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          state: {
            type: 'string',
            enum: ['open', 'closed', 'all'],
            description: 'Filter by issue state. Defaults to open.',
          },
        },
        required: ['owner', 'repo'],
      },
    },
  ],
}
