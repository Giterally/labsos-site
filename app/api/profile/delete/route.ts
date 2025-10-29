import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const auth = await authenticateRequest(request)
    const { user, supabase } = auth
    
    // 2. Get confirmation token from request body
    const { confirmationText } = await request.json()
    if (confirmationText !== 'DELETE') {
      return NextResponse.json({ error: 'Invalid confirmation' }, { status: 400 })
    }

    // 3. Get user's projects with member counts
    const { data: projectMemberships, error: membershipsError } = await supabase
      .from('project_members')
      .select('project_id, left_at')
      .eq('user_id', user.id)
      .is('left_at', null)

    if (membershipsError) {
      console.error('Error fetching project memberships:', membershipsError)
      throw new Error('Failed to fetch project memberships')
    }

    // 4. Identify solo projects (only 1 active member)
    const projectIds = projectMemberships?.map(pm => pm.project_id) || []
    const soloProjectIds: string[] = []

    if (projectIds.length > 0) {
      // Get all members for each project
      const { data: allMembers, error: allMembersError } = await supabase
        .from('project_members')
        .select('project_id, user_id, left_at')
        .in('project_id', projectIds)

      if (allMembersError) {
        console.error('Error fetching all project members:', allMembersError)
        throw new Error('Failed to fetch project members')
      }

      // Group by project and count active members
      const projectMemberCounts = new Map<string, number>()
      allMembers?.forEach(member => {
        if (!member.left_at) {
          const count = projectMemberCounts.get(member.project_id) || 0
          projectMemberCounts.set(member.project_id, count + 1)
        }
      })

      // Find projects with only 1 active member (solo projects)
      projectMemberCounts.forEach((count, projectId) => {
        if (count === 1) {
          soloProjectIds.push(projectId)
        }
      })
    }

    // 5. Delete solo projects (CASCADE will handle trees, nodes, etc.)
    if (soloProjectIds.length > 0) {
      const { error: deleteProjectsError } = await supabase
        .from('projects')
        .delete()
        .in('id', soloProjectIds)

      if (deleteProjectsError) {
        console.error('Error deleting solo projects:', deleteProjectsError)
        throw new Error('Failed to delete solo projects')
      }
    }

    // 6. Remove user from collaborative projects (soft delete with timestamp)
    const collaborativeProjectIds = projectIds.filter(id => !soloProjectIds.includes(id))
    if (collaborativeProjectIds.length > 0) {
      const { error: removeMembersError } = await supabase
        .from('project_members')
        .update({ left_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .in('project_id', collaborativeProjectIds)

      if (removeMembersError) {
        console.error('Error removing from collaborative projects:', removeMembersError)
        // Don't throw here - continue with user deletion even if this fails
      }
    }

    // 7. Delete user from auth.users (CASCADE handles everything else)
    // Need admin client for this
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    
    if (deleteError) {
      console.error('Error deleting user:', deleteError)
      throw new Error(`Failed to delete user: ${deleteError.message}`)
    }

    return NextResponse.json({ 
      success: true,
      message: 'Profile deleted successfully',
      deletedProjects: soloProjectIds.length
    })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error deleting profile:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to delete profile' 
    }, { status: 500 })
  }
}
