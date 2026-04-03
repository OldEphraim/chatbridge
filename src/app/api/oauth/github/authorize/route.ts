import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID!
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/oauth/github/callback`
  const scope = 'read:user repo'
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`
  return NextResponse.redirect(url)
}
