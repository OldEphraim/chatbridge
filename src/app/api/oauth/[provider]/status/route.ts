import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ connected: false }, { status: 401 })
    }

    const { provider } = params

    const { data, error } = await supabase
      .from('oauth_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .single()

    return NextResponse.json({ connected: !error && !!data })
  } catch (error) {
    console.error('Provider status check error:', error)
    return NextResponse.json({ connected: false }, { status: 500 })
  }
}
