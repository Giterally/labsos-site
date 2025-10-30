import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    // Resolve project (by id or slug) using service client
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    const { data: project } = await supabaseServer
      .from('projects')
      .select('id, visibility')
      [isUUID ? 'eq' : 'eq'](isUUID ? 'id' : 'slug', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const actualProjectId = project.id

    // Public, unauthenticated: return limited team list
    if (project.visibility === 'public') {
      const { data: teamMembers, error } = await supabaseServer
        .from('project_members')
        .select('id,user_id,initials')
        .eq('project_id', actualProjectId)
        .is('left_at', null)
        .order('joined_at', { ascending: true })

      if (error) {
        throw new Error(`Failed to fetch team members: ${error.message}`)
      }

      const userIds = (teamMembers || []).map(m => m.user_id)
      const { data: profiles } = await supabaseServer
        .from('profiles')
        .select('id, full_name, lab_name')
        .in('id', userIds)

      const profileMap = new Map()
      ;(profiles || []).forEach(p => profileMap.set(p.id, p))

      const transformedMembers = (teamMembers || []).map(member => {
        const profile = profileMap.get(member.user_id)
        const computedInitials = (profile?.full_name || 'U')
          .split(' ')
          .filter(Boolean)
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
        const initials = member.initials || computedInitials
        const displayName = (profile?.full_name && profile.full_name.trim())
          || (profile?.lab_name && profile.lab_name.trim())
          || initials
        return {
          id: member.id,
          user_id: member.user_id,
          name: displayName,
          lab_name: profile?.lab_name || 'Unknown Lab',
          initials,
        }
      })

      return NextResponse.json({ 
        members: transformedMembers,
        isOwner: false,
        isTeamMember: false,
        isAuthenticated: false
      })
    }

    // Private project: require auth and membership
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)
    const access = await permissions.checkProjectAccess(actualProjectId)
    if (!access.hasAccess) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 })
    }

    // Get all team members for this project with profile data
    const { data: teamMembers, error } = await auth.supabase
      .from('project_members')
      .select(`
        id,
        user_id,
        role,
        initials,
        joined_at,
        left_at
      `)
      .eq('project_id', actualProjectId)
      .is('left_at', null)
      .order('joined_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch team members: ${error.message}`)
    }

    // Get profile data for all team members
    const userIds = (teamMembers || []).map(member => member.user_id)
    const { data: profiles, error: profilesError } = await auth.supabase
      .from('profiles')
      .select('id, full_name, email, lab_name')
      .in('id', userIds)

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
    }

    // Create a map of user_id to profile data
    const profileMap = new Map()
    ;(profiles || []).forEach(profile => {
      profileMap.set(profile.id, profile)
    })

    // Transform the data
    const transformedMembers = (teamMembers || []).map(member => {
      const profile = profileMap.get(member.user_id)
      return {
        id: member.id,
        user_id: member.user_id,
        name: profile?.full_name || 'Unknown User',
        email: profile?.email || 'Unknown Email',
        lab_name: profile?.lab_name || 'Unknown Lab',
        role: member.role,
        initials: member.initials || (profile?.full_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
        joined_at: member.joined_at
      }
    })

    return NextResponse.json({ 
      members: transformedMembers,
      isOwner: access.isOwner,
      isTeamMember: access.isMember,
      isAuthenticated: true
    })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
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
    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)

    const { projectId } = await params
    const body = await request.json()
    const { user_id } = body
    // Force role to always be 'Admin' - no other roles allowed
    const role = 'Admin'

    if (!user_id) {
      return NextResponse.json(
        { message: 'User ID is required' },
        { status: 400 }
      )
    }

    // Check if projectId is a UUID or slug/name
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug or name, try to find the project
      // First try by slug
      let { data: projectBySlug, error: slugError } = await auth.supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      // If not found by slug, try by name
      if (slugError || !projectBySlug) {
        const { data: projectByName, error: nameError } = await auth.supabase
          .from('projects')
          .select('id')
          .eq('name', projectId)
          .single()

        if (nameError || !projectByName) {
          return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }
        actualProjectId = projectByName.id
      } else {
        actualProjectId = projectBySlug.id
      }
    }

    // Check project access and permissions
    const access = await permissions.checkProjectAccess(actualProjectId)
    if (!access.hasAccess) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    if (!access.canManageMembers) {
      return NextResponse.json(
        { message: 'Only project owners and admins can add team members' },
        { status: 403 }
      )
    }

    // Check if the user to be added exists
    const { data: targetUser, error: userError } = await auth.supabase
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
    const { data: existingActiveMember, error: existingError } = await auth.supabase
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
    const { data: existingInactiveMember, error: inactiveError } = await auth.supabase
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
      const { data: reactivatedMember, error: reactivateError } = await auth.supabase
        .from('project_members')
        .update({
          left_at: null,
          role: role,
          initials: targetUserProfile.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U'
        })
        .eq('id', existingInactiveMember.id)
        .select()
        .single()
      
      newMember = reactivatedMember
      addError = reactivateError
    } else {
      // Add the user as a new team member
      const { data: insertedMember, error: insertError } = await auth.supabase
        .from('project_members')
        .insert([{
          project_id: actualProjectId,
          user_id: user_id,
          role: role,
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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error adding team member:', error)
    return NextResponse.json(
      { message: 'Failed to add team member', error: error.message },
      { status: 500 }
    )
  }
}