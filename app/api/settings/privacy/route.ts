import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, AuthContext } from '@/lib/auth-middleware'

export async function GET(request: NextRequest) {
  try {
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

    // Get privacy settings from profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('show_email, show_projects')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({
      showEmail: profile.show_email ?? true, // Default to true if null
      showProjects: profile.show_projects ?? true // Default to true if null
    })
  } catch (error: any) {
    console.error('Error fetching privacy settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { showEmail, showProjects } = body

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

    // Update privacy settings in profile
    const updateData: any = {}
    if (showEmail !== undefined) {
      updateData.show_email = showEmail
    }
    if (showProjects !== undefined) {
      updateData.show_projects = showProjects
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select('show_email, show_projects')
      .single()

    if (error) {
      console.error('Error updating privacy settings:', error)
      return NextResponse.json(
        { error: 'Failed to update privacy settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      showEmail: data.show_email ?? true,
      showProjects: data.show_projects ?? true
    })
  } catch (error: any) {
    console.error('Error updating privacy settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

