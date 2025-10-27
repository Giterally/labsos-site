import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const authContext = await authenticateRequest(request)
    const { user, supabase } = authContext

    const permissionService = new PermissionService(supabase, user.id)
    const access = await permissionService.checkProjectAccess(projectId)

    if (!access.canRead) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 })
    }

    // Get the actual project ID (in case projectId was a slug)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    let actualProjectId = projectId
    
    if (!isUUID) {
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()
      
      if (project) {
        actualProjectId = project.id
      }
    }

    // Get experiment trees for the project
    const { data: trees, error: treesError } = await supabase
      .from('experiment_trees')
      .select(`
        id,
        name,
        description,
        status,
        category,
        node_count,
        created_at,
        updated_at
      `)
      .eq('project_id', actualProjectId)
      .order('created_at', { ascending: false })

    if (treesError) {
      console.error('Error fetching experiment trees:', treesError)
      return NextResponse.json({ 
        error: 'Failed to fetch experiment trees',
        details: treesError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ trees })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode })
    }
    console.error('Error in GET /api/projects/[projectId]/trees:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const body = await request.json()
    const { name, description, category, status } = body

    const authContext = await authenticateRequest(request)
    const { user, supabase } = authContext

    const permissionService = new PermissionService(supabase, user.id)
    const access = await permissionService.checkProjectAccess(projectId)

    if (!access.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to create experiment trees in this project' },
        { status: 403 }
      )
    }

    // Get the actual project ID (in case projectId was a slug)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    let actualProjectId = projectId
    
    if (!isUUID) {
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()
      
      if (project) {
        actualProjectId = project.id
      }
    }

    // Create the experiment tree
    const { data: newTree, error: treeError } = await supabase
      .from('experiment_trees')
      .insert({
        project_id: actualProjectId,
        name,
        description,
        category,
        status: status || 'draft',
        node_count: 0,
        created_by: user.id
      })
      .select()
      .single()

    if (treeError) {
      console.error('Error creating experiment tree:', treeError)
      return NextResponse.json({ 
        error: 'Failed to create experiment tree',
        details: treeError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ tree: newTree })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode })
    }
    console.error('Error in POST /api/projects/[projectId]/trees:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}