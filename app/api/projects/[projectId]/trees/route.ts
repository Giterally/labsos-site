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
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    const { data: project } = await supabaseServer
      .from('projects')
      .select('id, visibility')
      [isUUID ? 'eq' : 'eq'](isUUID ? 'id' : 'slug', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 })
    }

    // Get the actual project ID (in case projectId was a slug)
    let actualProjectId = projectId
    
    if (!isUUID) {
      actualProjectId = project.id
    }

    // If public project, allow unauthenticated access using service client
    const supa = project.visibility === 'public' ? supabaseServer : null

    // For private projects, authenticate and enforce permissions
    let authedSupabase = null as any
    if (project.visibility !== 'public') {
      const authContext = await authenticateRequest(request)
      authedSupabase = authContext.supabase
      const permissionService = new PermissionService(authedSupabase, authContext.user.id)
      const access = await permissionService.checkProjectAccess(actualProjectId)
      if (!access.canRead) {
        return NextResponse.json({ message: 'Access denied' }, { status: 403 })
      }
    }

    const client = supa || authedSupabase

    // Get experiment trees for the project with real-time counts
    const { data: trees, error: treesError } = await client
      .from('experiment_trees')
      .select(`
        id,
        name,
        description,
        status,
        node_count,
        created_at,
        updated_at,
        tree_blocks(
          id
        ),
        tree_nodes(
          id
        )
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

    // Calculate both node count and block count in real-time
    const treesWithRealTimeCounts = trees?.map(tree => {
      // Count actual nodes from the tree_nodes table
      const nodeCount = tree.tree_nodes?.length || 0
      
      // Count actual blocks from the tree_blocks table
      const blockCount = tree.tree_blocks?.length || 0
      
      console.log(`Tree "${tree.name}": real-time node_count=${nodeCount}, block_count=${blockCount}`)
      
      return {
        ...tree,
        node_count: nodeCount,  // Override the stale node_count
        block_count: blockCount,
        // Remove the joined data from the response to keep it clean
        tree_blocks: undefined,
        tree_nodes: undefined
      }
    }) || []

    return NextResponse.json({ trees: treesWithRealTimeCounts })
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
    const { name, description, status } = body

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