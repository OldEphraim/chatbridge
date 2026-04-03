import { createServerClient } from '@supabase/ssr'
import { ToolResult } from '../types'

interface HandlerContext {
  conversationId: string
  userId: string
}

const GITHUB_API = 'https://api.github.com'
const GITHUB_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'ChatBridge',
}

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

async function getGitHubToken(userId: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('oauth_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .single()

  if (error || !data) return null
  return data.access_token
}

function authRequiredResult(): ToolResult {
  return {
    success: false,
    showUI: true,
    data: {
      needsAuth: true,
      authUrl: '/api/oauth/github/authorize',
    },
  }
}

export async function listGithubRepos(
  params: { sort?: string },
  context: HandlerContext
): Promise<ToolResult> {
  try {
    const token = await getGitHubToken(context.userId)
    if (!token) return authRequiredResult()

    const sort = params.sort || 'updated'
    const response = await fetch(
      `${GITHUB_API}/user/repos?sort=${sort}&per_page=10`,
      {
        headers: {
          ...GITHUB_HEADERS,
          'Authorization': `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 401) return authRequiredResult()
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const repos = await response.json()
    const mappedRepos = repos.map((repo: any) => ({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      language: repo.language,
      stargazers_count: repo.stargazers_count,
      updated_at: repo.updated_at,
      html_url: repo.html_url,
      private: repo.private,
    }))

    return {
      success: true,
      data: { type: 'repos', repos: mappedRepos },
      showUI: true,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list repos',
    }
  }
}

export async function getRepoDetails(
  params: { owner: string; repo: string },
  context: HandlerContext
): Promise<ToolResult> {
  try {
    const token = await getGitHubToken(context.userId)
    if (!token) return authRequiredResult()

    const response = await fetch(
      `${GITHUB_API}/repos/${params.owner}/${params.repo}`,
      {
        headers: {
          ...GITHUB_HEADERS,
          'Authorization': `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 401) return authRequiredResult()
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const repo = await response.json()

    return {
      success: true,
      data: {
        type: 'repo_details',
        repo: {
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          language: repo.language,
          stargazers_count: repo.stargazers_count,
          forks_count: repo.forks_count,
          open_issues_count: repo.open_issues_count,
          html_url: repo.html_url,
          default_branch: repo.default_branch,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
        },
      },
      showUI: true,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get repo details',
    }
  }
}

export async function searchGithubIssues(
  params: { owner: string; repo: string; state?: string },
  context: HandlerContext
): Promise<ToolResult> {
  try {
    const token = await getGitHubToken(context.userId)
    if (!token) return authRequiredResult()

    const state = params.state || 'open'
    const response = await fetch(
      `${GITHUB_API}/repos/${params.owner}/${params.repo}/issues?state=${state}&per_page=20`,
      {
        headers: {
          ...GITHUB_HEADERS,
          'Authorization': `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 401) return authRequiredResult()
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const issues = await response.json()
    const mappedIssues = issues.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      user: issue.user?.login || 'unknown',
      created_at: issue.created_at,
      html_url: issue.html_url,
      labels: issue.labels?.map((l: any) => ({
        name: l.name,
        color: l.color,
      })) || [],
    }))

    return {
      success: true,
      data: {
        type: 'issues',
        owner: params.owner,
        repo: params.repo,
        issues: mappedIssues,
      },
      showUI: true,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search issues',
    }
  }
}

export const githubHandlers: Record<string, (params: any, context: HandlerContext) => Promise<ToolResult>> = {
  list_github_repos: listGithubRepos,
  get_repo_details: getRepoDetails,
  search_github_issues: searchGithubIssues,
}
