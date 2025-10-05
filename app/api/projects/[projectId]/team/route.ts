import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

    // Get team members for this project
    const { data: teamMembers, error: teamError } = await supabase
      .from('project_members')
      .select(`
        id,
        user_id,
        role,
        initials,
        joined_at,
        left_at,
        profile:user_id (
          id,
          full_name,
          email
        )
      `)
      .eq('project_id', actualProjectId)
      .is('left_at', null) // Only active members

    if (teamError) {
      console.error('Error fetching team members:', teamError)
      return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
    }

    return NextResponse.json({ teamMembers: teamMembers || [] })
  } catch (error) {
    console.error('Error in GET /api/projects/[projectId]/team:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params
    const body = await request.json()
    const { email, role } = body

    // Validate required fields
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!role || !role.trim()) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 })
    }

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

    // Find the user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('email', email.trim().toLowerCase())
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found with this email address' }, { status: 404 })
    }

    // Check if user is already a member of this project
    const { data: existingMember, error: existingError } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', actualProjectId)
      .eq('user_id', profile.id)
      .is('left_at', null)
      .single()

    if (existingMember) {
      return NextResponse.json({ error: 'User is already a member of this project' }, { status: 400 })
    }

    // Generate initials from full name
    const initials = profile.full_name
      ? profile.full_name
          .split(' ')
          .map(name => name.charAt(0).toUpperCase())
          .join('')
          .substring(0, 2)
      : profile.email.substring(0, 2).toUpperCase()

    // Add the team member
    const { data: teamMember, error: memberError } = await supabase
      .from('project_members')
      .insert({
        project_id: actualProjectId,
        user_id: profile.id,
        role: role.trim(),
        initials: initials
      })
      .select(`
        id,
        user_id,
        role,
        initials,
        joined_at,
        left_at,
        profile:user_id (
          id,
          full_name,
          email
        )
      `)
      .single()

    if (memberError) {
      console.error('Error adding team member:', memberError)
      return NextResponse.json({ 
        error: 'Failed to add team member',
        details: memberError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ teamMember })
  } catch (error) {
    console.error('Error in POST /api/projects/[projectId]/team:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
