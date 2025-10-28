import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, AuthContext } from '@/lib/auth-middleware'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ publicationId: string }> }
) {
  try {
    const { publicationId } = await params
    const body = await request.json()
    
    const {
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

    // Verify publication exists and belongs to authenticated user
    const { data: existingPub, error: fetchError } = await supabase
      .from('publications')
      .select('user_id')
      .eq('id', publicationId)
      .single()

    if (fetchError || !existingPub) {
      return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
    }

    // Verify ownership
    if (existingPub.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to update this publication' }, { status: 403 })
    }

    // Update publication
    const { data: updatedPub, error: updateError } = await supabase
      .from('publications')
      .update({
        title: title.trim(),
        authors: authors || [],
        journal_title: journal_title?.trim() || null,
        year: parseInt(year),
        month: month ? parseInt(month) : null,
        day: day ? parseInt(day) : null,
        doi: doi?.trim() || null,
        url: url?.trim() || null,
        type: type || 'other',
        abstract: abstract?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', publicationId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating publication:', updateError)
      return NextResponse.json({ error: 'Failed to update publication' }, { status: 500 })
    }

    return NextResponse.json({ publication: updatedPub })
  } catch (error: any) {
    console.error('Error in PUT /api/publications/[publicationId]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ publicationId: string }> }
) {
  try {
    const { publicationId } = await params

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

    // Verify publication exists and belongs to authenticated user
    const { data: existingPub, error: fetchError } = await supabase
      .from('publications')
      .select('user_id')
      .eq('id', publicationId)
      .single()

    if (fetchError || !existingPub) {
      return NextResponse.json({ error: 'Publication not found' }, { status: 404 })
    }

    // Verify ownership
    if (existingPub.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to delete this publication' }, { status: 403 })
    }

    // Delete publication
    const { error: deleteError } = await supabase
      .from('publications')
      .delete()
      .eq('id', publicationId)

    if (deleteError) {
      console.error('Error deleting publication:', deleteError)
      return NextResponse.json({ error: 'Failed to delete publication' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/publications/[publicationId]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
