import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authenticateRequest, AuthError, AuthContext } from '@/lib/auth-middleware'
import { ORCIDProfileChanges } from '@/lib/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { profileId, changes } = await request.json()

    if (!profileId || !changes) {
      return NextResponse.json({ error: 'Profile ID and changes are required' }, { status: 400 })
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
      .select('id, bio')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify ownership
    if (profile.id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to update this profile' }, { status: 403 })
    }

    // Build update object with only selected changes
    const updateData: Partial<Record<string, any>> = {}

    if (changes.bio) {
      // Bio is already merged in the changes object, so just use it directly
      updateData.bio = changes.bio
    }
    if (changes.institution) {
      updateData.institution = changes.institution
    }
    if (changes.department) {
      updateData.department = changes.department
    }
    if (changes.website) {
      updateData.website = changes.website
    }
    if (changes.linkedin) {
      updateData.linkedin = changes.linkedin
    }
    if (changes.github) {
      updateData.github = changes.github
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString()

    // Update profile with selected changes
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', profileId)

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Profile changes applied successfully'
    })
  } catch (error: any) {
    console.error('Error applying profile changes:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to apply profile changes' },
      { status: 500 }
    )
  }
}








