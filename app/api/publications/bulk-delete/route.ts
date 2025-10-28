import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { publicationIds } = await request.json()
    
    if (!publicationIds || !Array.isArray(publicationIds) || publicationIds.length === 0) {
      return NextResponse.json({ error: 'Publication IDs array is required' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Verify all publications exist
    const { data: existingPubs, error: fetchError } = await supabase
      .from('publications')
      .select('id')
      .in('id', publicationIds)

    if (fetchError) {
      console.error('Error fetching publications:', fetchError)
      return NextResponse.json({ error: 'Failed to verify publications' }, { status: 500 })
    }

    if (existingPubs.length !== publicationIds.length) {
      return NextResponse.json({ error: 'Some publications not found' }, { status: 404 })
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
