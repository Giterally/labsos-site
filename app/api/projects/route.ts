import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function GET(request: Request) {
  try {
    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)
    
    // DEBUG: Log to verify the fix is working
    console.log('DEBUG: API authentication successful for user:', auth.user.email)

    // Get user's projects (both owned and team member projects)
    // First get owned projects
    const { data: ownedProjects, error: ownedError } = await auth.supabase
      .from('projects')
      .select('*')
      .eq('created_by', auth.user.id)
      .order('created_at', { ascending: false })

    if (ownedError) {
      throw new Error(`Failed to fetch owned projects: ${ownedError.message}`)
    }

    // Get project IDs where user is a member
    const { data: memberships, error: membershipError } = await auth.supabase
      .from('project_members')
      .select('project_id, role, joined_at')
      .eq('user_id', auth.user.id)
      .is('left_at', null)

    console.log('DEBUG: Memberships for user:', auth.user.email, 'Count:', memberships?.length || 0)
    console.log('DEBUG: Membership data:', memberships)

    if (membershipError) {
      throw new Error(`Failed to fetch project memberships: ${membershipError.message}`)
    }

    // Get all those projects directly
    const memberProjectIds = memberships?.map(m => m.project_id) || []
    console.log('DEBUG: Member project IDs:', memberProjectIds)
    
    let memberProjects = []
    let memberProjectsWithRoles = []

    if (memberProjectIds.length > 0) {
      const { data: memberProjectsData, error: memberError } = await auth.supabase
        .from('projects')
        .select('*')
        .in('id', memberProjectIds)

      console.log('DEBUG: Member projects query result:', memberProjectsData?.length || 0, 'projects')
      console.log('DEBUG: Member projects data:', memberProjectsData)

      if (memberError) {
        throw new Error(`Failed to fetch member projects: ${memberError.message}`)
      }

      memberProjects = memberProjectsData || []
      
      // Create a map of project_id to role for easy lookup
      const roleMap = new Map()
      memberships?.forEach(membership => {
        roleMap.set(membership.project_id, membership.role)
      })

      // Add role information to member projects
      memberProjectsWithRoles = memberProjects.map(project => ({
        ...project,
        user_role: roleMap.get(project.id) || 'Team Member'
      }))
    }

    // Combine and deduplicate projects
    const allProjects = [...(ownedProjects || [])]
    const existingIds = new Set((ownedProjects || []).map(p => p.id))

    console.log('DEBUG: Owned projects count:', ownedProjects?.length || 0)
    console.log('DEBUG: Member projects count before deduplication:', memberProjectsWithRoles?.length || 0)

    // Add member projects that aren't already included
    memberProjectsWithRoles?.forEach(project => {
      if (!existingIds.has(project.id)) {
        allProjects.push(project)
      }
    })

    const projects = allProjects
    console.log('DEBUG: Final combined projects count:', projects.length)

    // DEBUG: Log the projects being returned
    console.log('DEBUG: Returning projects for user:', auth.user.email, 'Count:', projects.length)
    console.log('DEBUG: Project names:', projects.map(p => p.name))

    // Transform projects to include empty related data and user role
    const transformedProjects = (projects || []).map(project => {
      const isOwner = project.created_by === auth.user.id
      
      // All project members are Admin
      let userRole = 'Admin'
      
      return {
        ...project,
        user_role: userRole,
        is_owner: isOwner,
        members: [],
        past_members: [],
        related_projects: [],
        experiment_trees: [],
        software: [],
        datasets: [],
        outputs: [],
        stats: {
          total_trees: 0,
          active_trees: 0,
          completed_trees: 0,
          total_nodes: 0,
          total_software: 0,
          total_datasets: 0,
          total_outputs: 0,
          total_publications: 0,
          total_citations: 0
        }
      }
    })

    return NextResponse.json({ projects: transformedProjects })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error fetching user projects:', error)
    return NextResponse.json(
      { message: 'Failed to fetch user projects', error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)
    
    // DEBUG: Log authentication details
    console.log('DEBUG: API authentication successful for user:', auth.user.email)
    console.log('DEBUG: User ID:', auth.user.id)
    console.log('DEBUG: User metadata:', auth.user.user_metadata)
    
    // DEBUG: Check if user has a profile
    const { data: profile, error: profileError } = await auth.supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', auth.user.id)
      .single()
    
    console.log('DEBUG: Profile lookup result:', { profile, profileError })
    
    if (profileError) {
      console.error('DEBUG: Profile not found for user:', auth.user.id, 'Error:', profileError)
      throw new Error(`User profile not found: ${profileError.message}`)
    }

    const body = await request.json()
    
    // Create the project
    const { data: project, error } = await auth.supabase
      .from('projects')
      .insert([{
        ...body,
        created_by: auth.user.id
      }])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`)
    }

    // Add the creator as a team member with "Lead Researcher" role
    // Use upsert to avoid duplicate key constraint violations
    const { error: memberError } = await auth.supabase
      .from('project_members')
      .upsert([{
        project_id: project.id,
        user_id: auth.user.id,
        role: 'Admin',
        initials: auth.user.user_metadata?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U',
        left_at: null // Ensure they're active
      }], {
        onConflict: 'project_id,user_id'
      })

    if (memberError) {
      console.warn('Failed to add creator as team member:', memberError)
      // Don't fail the project creation if team member addition fails
    }

    // Transform project to include empty related data
    const transformedProject = {
      ...project,
      members: [],
      past_members: [],
      related_projects: [],
      experiment_trees: [],
      software: [],
      datasets: [],
      outputs: [],
      stats: {
        total_trees: 0,
        active_trees: 0,
        completed_trees: 0,
        total_nodes: 0,
        total_software: 0,
        total_datasets: 0,
        total_outputs: 0,
        total_publications: 0,
        total_citations: 0
      }
    }

    return NextResponse.json({ project: transformedProject }, { status: 201 })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating project:', error)
    return NextResponse.json(
      { message: 'Failed to create project', error: error.message },
      { status: 500 }
    )
  }
}
