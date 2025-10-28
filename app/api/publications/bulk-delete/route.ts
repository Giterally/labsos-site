import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, AuthContext } from '@/lib/auth-middleware'

export async function POST(request: NextRequest) {
  try {
    const { publicationIds } = await request.json()
    
    if (!publicationIds || !Array.isArray(publicationIds) || publicationIds.length === 0) {
      return NextResponse.json({ error: 'Publication IDs array is required' }, { status: 400 })
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

    // Verify all publications exist and belong to the authenticated user
    const { data: existingPubs, error: fetchError } = await supabase
      .from('publications')
      .select('id, user_id')
      .in('id', publicationIds)

    if (fetchError) {
      console.error('Error fetching publications:', fetchError)
      return NextResponse.json({ error: 'Failed to verify publications' }, { status: 500 })
    }

    if (existingPubs.length !== publicationIds.length) {
      return NextResponse.json({ error: 'Some publications not found' }, { status: 404 })
    }

    // Verify ownership - all publications must belong to the authenticated user
    const unauthorizedPubs = existingPubs.filter(pub => pub.user_id !== user.id)
    if (unauthorizedPubs.length > 0) {
      return NextResponse.json({ error: 'Unauthorized to delete some publications' }, { status: 403 })
    }

    // Delete all publications
    const { error: deleteError } = await supabase
      .from('publications')
      .delete()
      .in('id', publicationIds)

    if (deleteError) {
      console.error('Error deleting publications:', deleteError)
      return NextResponse.json({ error: 'Failed to delete publications' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      deletedCount: publicationIds.length 
    })
  } catch (error: any) {
    console.error('Error in POST /api/publications/bulk-delete:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
