import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create a Supabase client with anon key for server-side operations
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
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
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    const { projectId } = await params

    // Check if projectId is a UUID or slug
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug, get the actual UUID
      const { data: projectBySlug, error: slugError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      if (slugError || !projectBySlug) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      actualProjectId = projectBySlug.id
    }

    // Check if user has access to this project (either as owner or team member)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('created_by')
      .eq('id', actualProjectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if user is project owner or team member
    const isOwner = project.created_by === user.id
    let isTeamMember = false

    if (!isOwner) {
      const { data: membership, error: membershipError } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', actualProjectId)
        .eq('user_id', user.id)
        .is('left_at', null)
        .single()

      isTeamMember = !membershipError && !!membership
    }

    if (!isOwner && !isTeamMember) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    // Get all team members for this project
    const { data: teamMembers, error } = await supabase
      .from('project_members')
      .select(`
        id,
        role,
        initials,
        joined_at,
        left_at,
        profiles!project_members_user_id_fkey (
          id,
          full_name,
          email,
          lab_name
        )
      `)
      .eq('project_id', actualProjectId)
      .is('left_at', null)
      .order('joined_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch team members: ${error.message}`)
    }

    // Transform the data
    const transformedMembers = (teamMembers || []).map(member => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
      return {
        id: member.id,
        user_id: profile?.id,
        name: profile?.full_name || 'Unknown',
        email: profile?.email || 'Unknown',
        lab_name: profile?.lab_name || 'Unknown Lab',
        role: member.role,
        initials: member.initials || (profile?.full_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
        joined_at: member.joined_at
      }
    })

    return NextResponse.json({ members: transformedMembers })
  } catch (error: any) {
    console.error('Error fetching team members:', error)
    return NextResponse.json(
      { message: 'Failed to fetch team members', error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
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
    
    // Verify the token and get user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authUser) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    const { projectId } = await params
    const body = await request.json()
    const { user_id } = body

    if (!user_id) {
      return NextResponse.json(
        { message: 'User ID is required' },
        { status: 400 }
      )
    }

    // Check if projectId is a UUID or slug
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug, get the actual UUID
      const { data: projectBySlug, error: slugError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      if (slugError || !projectBySlug) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      actualProjectId = projectBySlug.id
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
        { message: 'You must be a team member to add other members' },
        { status: 403 }
      )
    }

    // Check if the user to be added exists
    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('id, full_name, email, lab_name')
      .eq('id', user_id)
      .single()

    if (userError || !targetUser) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      )
    }

    // Type assertion to fix TypeScript issues
    const targetUserProfile = targetUser as { id: string; full_name: string; email: string; lab_name: string }

    // Check if user is already an active member
    const { data: existingActiveMember, error: existingError } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', actualProjectId)
      .eq('user_id', user_id)
      .is('left_at', null)
      .single()

    if (existingActiveMember) {
      return NextResponse.json(
        { message: 'User is already a team member' },
        { status: 400 }
      )
    }

    // Check if user was previously a member (has a record with left_at set)
    const { data: existingInactiveMember, error: inactiveError } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', actualProjectId)
      .eq('user_id', user_id)
      .not('left_at', 'is', null)
      .single()

    let newMember
    let addError

    if (existingInactiveMember) {
      // Re-activate the existing member by setting left_at to null
      const { data: reactivatedMember, error: reactivateError } = await supabase
        .from('project_members')
        .update({
          left_at: null,
          role: 'Team Member',
          initials: targetUserProfile.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U'
        })
        .eq('id', existingInactiveMember.id)
        .select()
        .single()
      
      newMember = reactivatedMember
      addError = reactivateError
    } else {
      // Add the user as a new team member
      const { data: insertedMember, error: insertError } = await supabase
        .from('project_members')
        .insert([{
          project_id: actualProjectId,
          user_id: user_id,
          role: 'Team Member',
          initials: targetUserProfile.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U'
        }])
        .select()
        .single()
      
      newMember = insertedMember
      addError = insertError
    }

    if (addError) {
      // Check for duplicate key constraint violation
      if (addError.message?.includes('duplicate key value violates unique constraint') || 
          addError.code === '23505') {
        return NextResponse.json(
          { message: 'This user is already a team member' },
          { status: 400 }
        )
      }
      throw new Error(`Failed to add team member: ${addError.message}`)
    }

    // Return the new member with profile data
    const transformedMember = {
      id: newMember.id,
      user_id: targetUserProfile.id,
      name: targetUserProfile.full_name || 'Unknown',
      email: targetUserProfile.email || 'Unknown',
      lab_name: targetUserProfile.lab_name || 'Unknown Lab',
      role: newMember.role,
      initials: newMember.initials,
      joined_at: newMember.joined_at
    }

    return NextResponse.json({ member: transformedMember }, { status: 201 })
  } catch (error: any) {
    console.error('Error adding team member:', error)
    return NextResponse.json(
      { message: 'Failed to add team member', error: error.message },
      { status: 500 }
    )
  }
}