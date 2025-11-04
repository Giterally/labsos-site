import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string; dependencyId: string }> }
) {
  try {
    const { treeId, nodeId, dependencyId } = await params
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

    // Check tree permissions
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to update dependencies in this experiment tree' },
        { status: 403 }
      )
    }

    // Verify dependency exists and belongs to this node
    const { data: existingDep, error: checkError } = await supabase
      .from('node_dependencies')
      .select('node_id')
      .eq('id', dependencyId)
      .eq('node_id', nodeId)
      .single()

    if (checkError || !existingDep) {
      return NextResponse.json({ error: 'Dependency not found' }, { status: 404 })
    }

    // Verify target node is in the same tree
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

    // Update the dependency
    const { data: updatedDep, error: updateError } = await supabase
      .from('node_dependencies')
      .update({
        depends_on_node_id: to_node_id,
        dependency_type: dependency_type
      })
      .eq('id', dependencyId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating dependency:', updateError)
      if (updateError.code === '23505') {
        return NextResponse.json({ error: 'This dependency already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to update dependency' }, { status: 500 })
    }

    return NextResponse.json({ 
      dependency: {
        id: updatedDep.id,
        node_id: updatedDep.node_id,
        to_node_id: updatedDep.depends_on_node_id,
        to_node_name: targetNode?.name || 'Unknown node',
        dependency_type: updatedDep.dependency_type
      }
    })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/nodes/[nodeId]/dependencies/[dependencyId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string; dependencyId: string }> }
) {
  try {
    const { treeId, nodeId, dependencyId } = await params

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
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to delete dependencies in this experiment tree' },
        { status: 403 }
      )
    }

    // Verify dependency exists and belongs to this node
    const { data: existingDep, error: checkError } = await supabase
      .from('node_dependencies')
      .select('node_id')
      .eq('id', dependencyId)
      .eq('node_id', nodeId)
      .single()

    if (checkError || !existingDep) {
      return NextResponse.json({ error: 'Dependency not found' }, { status: 404 })
    }

    // Delete the dependency
    const { error: deleteError } = await supabase
      .from('node_dependencies')
      .delete()
      .eq('id', dependencyId)

    if (deleteError) {
      console.error('Error deleting dependency:', deleteError)
      return NextResponse.json({ error: 'Failed to delete dependency' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]/nodes/[nodeId]/dependencies/[dependencyId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

