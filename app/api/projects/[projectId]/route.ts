import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    
    // Authenticate the request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { message: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    // Check if projectId is a UUID or slug/name
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug or name, try to find the project
      // First try by slug
      let { data: projectBySlug, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      // If not found by slug, try by name
      if (projectError || !projectBySlug) {
        const { data: projectByName, error: nameError } = await supabase
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

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check user permissions for this project
    const permissions = await permissionService.checkProjectAccess(actualProjectId)
    
    if (!permissions.canRead) {
      return NextResponse.json(
        { message: 'Access denied. This project is private.' },
        { status: 403 }
      )
    }

    // Get the specific project
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', actualProjectId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Project not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to fetch project: ${error.message}`)
    }

    // Get experiment trees for this project
    const { data: trees, error: treesError } = await supabase
      .from('experiment_trees')
      .select('*')
      .eq('project_id', actualProjectId)
      .order('created_at', { ascending: false })

    // Transform project to include related data
    const transformedProject = {
      ...project,
      members: [],
      past_members: [],
      related_projects: [],
      experiment_trees: trees || [],
      software: [],
      datasets: [],
      outputs: [],
      stats: {
        total_trees: trees?.length || 0,
        active_trees: trees?.filter(t => t.status === 'active').length || 0,
        completed_trees: trees?.filter(t => t.status === 'completed').length || 0,
        total_nodes: trees?.reduce((sum, t) => sum + t.node_count, 0) || 0,
        total_software: 0,
        total_datasets: 0,
        total_outputs: 0,
        total_publications: 0,
        total_citations: 0
      }
    }

    return NextResponse.json({ project: transformedProject })
  } catch (error: any) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { message: 'Failed to fetch project', error: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    
    // Authenticate the request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { message: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    const body = await request.json()
    const { name, description, institution, department, status, visibility } = body

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check user permissions for this project
    const permissions = await permissionService.checkProjectAccess(projectId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to update this project' },
        { status: 403 }
      )
    }

    // Update the project
    const { data: updatedProject, error } = await supabase
      .from('projects')
      .update({
        name,
        description,
        institution,
        department,
        status,
        visibility,
      })
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Project not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to update project: ${error.message}`)
    }

    return NextResponse.json({ project: updatedProject })
  } catch (error: any) {
    console.error('Error updating project:', error)
    return NextResponse.json(
      { message: 'Failed to update project', error: error.message },
      { status: 500 }
    )
  }
}
