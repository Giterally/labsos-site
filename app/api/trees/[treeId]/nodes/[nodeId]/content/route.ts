import { NextResponse, NextRequest } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { fetchNodeAndGenerateEmbedding } from '@/lib/embedding-helpers'


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string }> }
) {
  try {
    const { treeId, nodeId } = await params

    // Authenticate the request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(req)
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

    // Check node permissions
    const permissions = await permissionService.checkNodeAccess(nodeId)
    
    if (!permissions.canRead) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    // Get the node content from the database
    const { data: node, error } = await supabase
      .from('tree_nodes')
      .select('*')
      .eq('id', nodeId)
      .eq('tree_id', treeId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Node not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to fetch node: ${error.message}`)
    }

    // Return the content data (we'll store it in description for now, but could be expanded)
    return NextResponse.json({ 
      content: {
        text: node.description || '',
        attachments: [],
        links: [],
        metadata: {
          type: node.node_type,
          position: node.position,
          created_at: node.created_at,
          updated_at: node.updated_at
        }
      }
    })
  } catch (error: any) {
    console.error('Error fetching node content:', error)
    return NextResponse.json(
      { message: 'Failed to fetch node content', error: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
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

    // Check node permissions - only members can edit node content
    const permissions = await permissionService.checkNodeAccess(nodeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to edit this node content' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // Update the node with the new content
    const updateData: any = {
      updated_at: new Date().toISOString(),
      updated_by: user.id
    }

    // Update description with the content text
    if (body.text !== undefined) {
      updateData.description = body.text
    }

    const { data: updatedNode, error } = await supabase
      .from('tree_nodes')
      .update(updateData)
      .eq('id', nodeId)
      .eq('tree_id', treeId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update node content: ${error.message}`)
    }

    // Trigger embedding update (non-blocking)
    fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(err => {
      console.error('Embedding update failed:', err);
    });

    return NextResponse.json({ 
      content: {
        text: updatedNode.description || '',
        attachments: [],
        links: [],
        metadata: {
          type: updatedNode.node_type,
          position: updatedNode.position,
          created_at: updatedNode.created_at,
          updated_at: updatedNode.updated_at
        }
      }
    })
  } catch (error: any) {
    console.error('Error updating node content:', error)
    return NextResponse.json(
      { message: 'Failed to update node content', error: error.message },
      { status: 500 }
    )
  }
}
