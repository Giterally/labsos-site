import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'No authorization header' },
        { status: 401 }
      )
    }

    // Extract the token and create authenticated client
    const token = authHeader.replace('Bearer ', '')
    const { client: supabase, user } = await createAuthenticatedClient(token)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '10')
    const projectId = searchParams.get('projectId') || ''

    if (!search.trim()) {
      return NextResponse.json({ users: [] })
    }

    // Get all users matching the search
    const { data: allUsers, error: searchError } = await supabase
      .from('profiles')
      .select('id, full_name, email, lab_name')
      .or(`full_name.ilike.%${search}%,email.ilike.%${search}%,lab_name.ilike.%${search}%`)
      .limit(limit * 2) // Get more to account for filtering

    if (searchError) {
      throw new Error(`Failed to search users: ${searchError.message}`)
    }

    // If no projectId provided, return all results without member status
    if (!projectId) {
      const transformedUsers = (allUsers || []).slice(0, limit).map(user => ({
        id: user.id,
        name: user.full_name || 'Unknown',
        email: user.email || 'Unknown',
        lab_name: user.lab_name || 'Unknown Lab',
        initials: (user.full_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
        isMember: false
      }))
      return NextResponse.json({ users: transformedUsers })
    }

    // Get existing team members for this project
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug, get the actual UUID
      const { data: projectBySlug, error: slugError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      if (slugError || !projectBySlug) {
        console.error('Error fetching project by slug:', slugError)
        // Return all users if we can't get project info
        const transformedUsers = (allUsers || []).slice(0, limit).map(user => ({
          id: user.id,
          name: user.full_name || 'Unknown',
          email: user.email || 'Unknown',
          lab_name: user.lab_name || 'Unknown Lab',
          initials: (user.full_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
          isMember: false
        }))
        return NextResponse.json({ users: transformedUsers })
      }
      actualProjectId = projectBySlug.id
    }

    // Get existing ACTIVE team members (exclude those who have left)
    const { data: existingMembers, error: membersError } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', actualProjectId)
      .is('left_at', null)

    if (membersError) {
      console.error('Error fetching existing members:', membersError)
      // Return all users if we can't get member info
      const transformedUsers = (allUsers || []).slice(0, limit).map(user => ({
        id: user.id,
        name: user.full_name || 'Unknown',
        email: user.email || 'Unknown',
        lab_name: user.lab_name || 'Unknown Lab',
        initials: (user.full_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
        isMember: false
      }))
      return NextResponse.json({ users: transformedUsers })
    }

    // Create a set of existing member IDs for quick lookup
    const existingUserIds = new Set((existingMembers || []).map(member => member.user_id))

    // Transform the data with member status (return ALL users, not just non-members)
    const transformedUsers = (allUsers || []).slice(0, limit).map(user => ({
      id: user.id,
      name: user.full_name || 'Unknown',
      email: user.email || 'Unknown',
      lab_name: user.lab_name || 'Unknown Lab',
      initials: (user.full_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
      isMember: existingUserIds.has(user.id)
    }))

    return NextResponse.json({ users: transformedUsers })
  } catch (error: any) {
    console.error('Error searching users:', error)
    return NextResponse.json(
      { message: 'Failed to search users', error: error.message },
      { status: 500 }
    )
  }
}
