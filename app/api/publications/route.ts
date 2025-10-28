import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, AuthContext } from '@/lib/auth-middleware'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      profileId,
      title,
      authors,
      journal_title,
      year,
      month,
      day,
      doi,
      url,
      type,
      abstract
    } = body

    // Validate required fields
    if (!profileId) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 })
    }

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    if (!year || year < 1800 || year > new Date().getFullYear() + 1) {
      return NextResponse.json({ error: 'Valid year is required' }, { status: 400 })
    }

    // Authenticate request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    // Verify profile exists and belongs to authenticated user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, user_id')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify ownership
    if (profile.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to add publication to this profile' }, { status: 403 })
    }

    // Create publication
    const { data: newPub, error: createError } = await supabase
      .from('publications')
      .insert({
        profile_id: profileId,
        user_id: profileId, // Keep for compatibility
        title: title.trim(),
        authors: authors || [],
        journal_title: journal_title?.trim() || null,
        year: parseInt(year),
        month: month ? parseInt(month) : null,
        day: day ? parseInt(day) : null,
        doi: doi?.trim() || null,
        url: url?.trim() || null,
        type: type === 'None' ? null : (type || 'other'),
        abstract: abstract?.trim() || null,
        source: 'manual'
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating publication:', createError)
      return NextResponse.json({ error: 'Failed to create publication' }, { status: 500 })
    }

    return NextResponse.json({ publication: newPub })
  } catch (error: any) {
    console.error('Error in POST /api/publications:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
