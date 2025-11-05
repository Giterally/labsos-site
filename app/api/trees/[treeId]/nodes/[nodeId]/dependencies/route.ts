import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string }> }
) {
  try {
    const { treeId, nodeId } = await params

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

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check tree permissions
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canRead) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    // Get dependencies for the node (support both old and new schema)
    // Query for new schema first
    const { data: newDeps, error: newDepsError } = await supabase
      .from('node_dependencies')
      .select(`
        id,
        from_node_id,
        to_node_id,
        node_id,
        depends_on_node_id,
        dependency_type,
        evidence_text,
        confidence,
        tree_nodes!node_dependencies_to_node_id_fkey (
          id,
          name
        )
      `)
      .eq('from_node_id', nodeId)
      .order('created_at', { ascending: true })
    
    // Query for old schema (for backwards compatibility)
    const { data: oldDeps, error: oldDepsError } = await supabase
      .from('node_dependencies')
      .select(`
        id,
        from_node_id,
        to_node_id,
        node_id,
        depends_on_node_id,
        dependency_type,
        evidence_text,
        confidence,
        tree_nodes!node_dependencies_depends_on_node_id_fkey (
          id,
          name
        )
      `)
      .eq('node_id', nodeId)
      .is('from_node_id', null)
      .order('created_at', { ascending: true })
    
    // Combine results
    const dependencies = [
      ...(newDeps || []),
      ...(oldDeps || [])
    ]
    const depsError = newDepsError || oldDepsError

    if (depsError) {
      console.error('Error fetching dependencies:', depsError)
      return NextResponse.json({ error: 'Failed to fetch dependencies' }, { status: 500 })
    }

    // Transform to include target node name (support both old and new schema)
    const transformedDeps = dependencies?.map(dep => {
      const toNodeId = dep.to_node_id || dep.depends_on_node_id
      const targetNode = Array.isArray(dep.tree_nodes) 
        ? dep.tree_nodes[0] 
        : dep.tree_nodes
      
      return {
        id: dep.id,
        node_id: dep.from_node_id || dep.node_id,
        to_node_id: toNodeId,
        to_node_name: (targetNode as any)?.name || 'Unknown node',
        dependency_type: dep.dependency_type,
        evidence_text: dep.evidence_text,
        confidence: dep.confidence
      }
    }).filter(dep => dep.to_node_id) || []

    return NextResponse.json({ dependencies: transformedDeps })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/nodes/[nodeId]/dependencies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string }> }
) {
  try {
    const { treeId, nodeId } = await params
    const body = await request.json()
    const { to_node_id, dependency_type } = body

    if (!to_node_id || !dependency_type) {
      return NextResponse.json({ error: 'Target node ID and dependency type are required' }, { status: 400 })
    }

    // Validate dependency type
    const validTypes = ['requires', 'uses_output', 'follows', 'validates']
    if (!validTypes.includes(dependency_type)) {
      return NextResponse.json({ error: `Invalid dependency type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

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

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check tree permissions - only members can create dependencies
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to create dependencies in this experiment tree' },
        { status: 403 }
      )
    }

    // Verify both nodes are in the same tree
    const { data: nodes, error: nodesError } = await supabase
      .from('tree_nodes')
      .select('id, tree_id')
      .in('id', [nodeId, to_node_id])

    if (nodesError || !nodes || nodes.length !== 2) {
      return NextResponse.json({ error: 'One or both nodes not found' }, { status: 404 })
    }

    const nodeTreeIds = nodes.map(n => n.tree_id)
    if (nodeTreeIds[0] !== nodeTreeIds[1]) {
      return NextResponse.json({ error: 'Both nodes must be in the same tree' }, { status: 400 })
    }

    if (nodeId === to_node_id) {
      return NextResponse.json({ error: 'A node cannot depend on itself' }, { status: 400 })
    }

    // Get target node name
    const { data: targetNode } = await supabase
      .from('tree_nodes')
      .select('name')
      .eq('id', to_node_id)
      .single()

    // Create the dependency using new schema (from_node_id, to_node_id)
    const { data: newDep, error: depError } = await supabase
      .from('node_dependencies')
      .insert({
        from_node_id: nodeId,
        to_node_id: to_node_id,
        dependency_type: dependency_type
      })
      .select()
      .single()

    if (depError) {
      console.error('Error creating dependency:', depError)
      if (depError.code === '23505') {
        return NextResponse.json({ error: 'This dependency already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create dependency' }, { status: 500 })
    }

    return NextResponse.json({ 
      dependency: {
        id: newDep.id,
        node_id: newDep.from_node_id || newDep.node_id,
        to_node_id: newDep.to_node_id || newDep.depends_on_node_id,
        to_node_name: targetNode?.name || 'Unknown node',
        dependency_type: newDep.dependency_type
      }
    })
  } catch (error) {
    console.error('Error in POST /api/trees/[treeId]/nodes/[nodeId]/dependencies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

