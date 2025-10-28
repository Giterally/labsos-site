import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Verify profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
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
        type: type || 'other',
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
