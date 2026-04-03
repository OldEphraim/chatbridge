'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface GitHubComponentProps {
  state: any
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function AuthPrompt({ authUrl }: { authUrl: string }) {
  const [checking, setChecking] = useState(false)
  const [connected, setConnected] = useState(false)

  const handleConnect = () => {
    const width = 600
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(
      authUrl,
      'github-oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    )

    // Poll for popup close, then check auth status
    const interval = setInterval(async () => {
      if (popup && popup.closed) {
        clearInterval(interval)
        setChecking(true)
        try {
          const res = await fetch('/api/oauth/github/status')
          if (res.ok) {
            const data = await res.json()
            if (data.connected) {
              setConnected(true)
            }
          }
        } finally {
          setChecking(false)
        }
      }
    }, 500)
  }

  if (connected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <p className="text-sm text-green-600 font-medium">GitHub connected! Send your request again to continue.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-8">
        <svg
          className="h-12 w-12 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
        </svg>
        <p className="text-sm text-muted-foreground">
          Connect your GitHub account to access repos and issues.
        </p>
        <button
          onClick={handleConnect}
          disabled={checking}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Connect GitHub'}
        </button>
      </CardContent>
    </Card>
  )
}

function ReposList({ repos }: { repos: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Repositories</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {repos.map((repo) => (
          <a
            key={repo.full_name}
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{repo.name}</span>
              {repo.private && (
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  Private
                </span>
              )}
            </div>
            {repo.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {repo.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              {repo.language && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
                  {repo.language}
                </span>
              )}
              <span>&#9733; {repo.stargazers_count}</span>
              <span>Updated {formatDate(repo.updated_at)}</span>
            </div>
          </a>
        ))}
      </CardContent>
    </Card>
  )
}

function RepoDetails({ repo }: { repo: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {repo.full_name}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {repo.description && (
          <p className="text-sm text-muted-foreground">{repo.description}</p>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-md border p-2 text-center">
            <div className="text-lg font-semibold">{repo.stargazers_count}</div>
            <div className="text-xs text-muted-foreground">Stars</div>
          </div>
          <div className="rounded-md border p-2 text-center">
            <div className="text-lg font-semibold">{repo.forks_count}</div>
            <div className="text-xs text-muted-foreground">Forks</div>
          </div>
          <div className="rounded-md border p-2 text-center">
            <div className="text-lg font-semibold">{repo.open_issues_count}</div>
            <div className="text-xs text-muted-foreground">Issues</div>
          </div>
          <div className="rounded-md border p-2 text-center">
            <div className="text-sm font-medium">{repo.language || 'N/A'}</div>
            <div className="text-xs text-muted-foreground">Language</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Branch: {repo.default_branch}</span>
          <span>Created: {formatDate(repo.created_at)}</span>
          <span>Updated: {formatDate(repo.updated_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function IssuesList({ owner, repo, issues }: { owner: string; repo: string; issues: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Issues - {owner}/{repo}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues found.</p>
        ) : (
          issues.map((issue) => (
            <a
              key={issue.number}
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <span
                className={`mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full ${
                  issue.state === 'open'
                    ? 'bg-green-500'
                    : 'bg-red-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">#{issue.number}</span>
                  <span className="font-medium text-sm truncate">{issue.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{issue.user}</span>
                  <span>{formatDate(issue.created_at)}</span>
                  {issue.labels.map((label: any) => (
                    <span
                      key={label.name}
                      className="rounded-full border px-2 py-0.5"
                      style={{
                        backgroundColor: `#${label.color}20`,
                        borderColor: `#${label.color}`,
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            </a>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export default function GitHubComponent({ state }: GitHubComponentProps) {
  if (!state) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">No GitHub data available.</p>
        </CardContent>
      </Card>
    )
  }

  if (state.needsAuth) {
    return <AuthPrompt authUrl={state.authUrl || '/api/oauth/github/authorize'} />
  }

  switch (state.type) {
    case 'repos':
      return <ReposList repos={state.repos || []} />
    case 'repo_details':
      return <RepoDetails repo={state.repo} />
    case 'issues':
      return <IssuesList owner={state.owner} repo={state.repo} issues={state.issues || []} />
    default:
      return (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">Unknown GitHub data type.</p>
          </CardContent>
        </Card>
      )
  }
}
