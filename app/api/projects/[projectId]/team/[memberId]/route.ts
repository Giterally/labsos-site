import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  try {
    const { projectId, memberId } = await params

    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'No authorization header' },
        { status: 401 }
      )
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '')
    
    // Create authenticated client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    
    // Verify the token and get user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    // Check if projectId is a UUID or slug
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug, get the actual UUID
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      actualProjectId = project.id
    }

    // Check if the requesting user is a team member with admin access
    const { data: memberCheck, error: memberError } = await supabase
      .from('project_members')
      .select('id, role')
      .eq('project_id', actualProjectId)
      .eq('user_id', authUser.id)
      .is('left_at', null)
      .single()

    if (memberError || !memberCheck) {
      return NextResponse.json(
        { message: 'You must be a team member to remove other members' },
        { status: 403 }
      )
    }

    // Remove the team member by setting left_at timestamp
    const { error: removeError } = await supabase
      .from('project_members')
      .update({
        left_at: new Date().toISOString()
      })
      .eq('id', memberId)
      .eq('project_id', actualProjectId)

    if (removeError) {
      console.error('Error removing team member:', removeError)
      return NextResponse.json({ 
        error: 'Failed to remove team member',
        details: removeError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/projects/[projectId]/team/[memberId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
