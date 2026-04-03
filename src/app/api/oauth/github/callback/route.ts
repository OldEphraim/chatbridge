import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    return new NextResponse('Missing code parameter', { status: 400 })
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      return new NextResponse(`OAuth error: ${tokenData.error_description || tokenData.error}`, {
        status: 400,
      })
    }

    const accessToken = tokenData.access_token

    // Get authenticated Supabase user
    const supabase = createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return new NextResponse('Not authenticated', { status: 401 })
    }

    // Upsert the token into oauth_tokens
    const { error: upsertError } = await supabase
      .from('oauth_tokens')
      .upsert(
        {
          user_id: user.id,
          provider: 'github',
          access_token: accessToken,
          refresh_token: tokenData.refresh_token || null,
          expires_at: tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
            : null,
        },
        { onConflict: 'user_id,provider' }
      )

    if (upsertError) {
      console.error('Failed to save OAuth token:', upsertError)
      return new NextResponse('Failed to save token', { status: 500 })
    }

    // Return HTML that closes the popup
    const html = `
<!DOCTYPE html>
<html>
<head><title>GitHub Connected</title></head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;background:#fafafa;margin:0;">
  <div style="text-align:center;padding:2rem;">
    <h2 style="margin-bottom:0.5rem;">GitHub Connected!</h2>
    <p style="color:#666;">You can close this window and try your request again.</p>
    <script>
      if (window.opener) {
        window.close();
      }
    </script>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error) {
    console.error('GitHub OAuth callback error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
