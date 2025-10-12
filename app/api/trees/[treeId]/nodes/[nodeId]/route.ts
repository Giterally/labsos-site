import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkNodePermission } from '@/lib/permission-utils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string } }
) {
  try {
    const { treeId, nodeId } = params

    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    let userId: string | undefined

    if (authHeader) {
      // Extract the token
      const token = authHeader.replace('Bearer ', '')
      
      // Verify the token and get user
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
      }
    }

    // Check node permissions
    const permissions = await checkNodePermission(nodeId, userId)
    
    if (!permissions.canView) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Get the specific node with its content, attachments, and links
    const { data: node, error: nodeError } = await supabase
      .from('tree_nodes')
      .select(`
        *,
        node_content (
          id,
          content,
          status,
          created_at,
          updated_at
        ),
        node_attachments (
          id,
          name,
          file_type,
          file_size,
          file_url,
          description,
          created_at,
          updated_at
        ),
        node_links (
          id,
          name,
          url,
          description,
          link_type,
          created_at,
          updated_at
        )
      `)
      .eq('id', nodeId)
      .eq('tree_id', treeId)
      .single()

    if (nodeError) {
      console.error('Error fetching node:', nodeError)
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    // Transform the data to match the expected format
    const transformedNode = {
      id: node.id,
      title: node.name,
      description: node.description,
      type: node.node_type,
      status: node.node_content?.[0]?.status || 'draft',
      position: node.position,
      content: node.node_content?.[0]?.content || '',
      attachments: node.node_attachments || [],
      links: node.node_links || [],
      metadata: {
        created: node.created_at,
        updated: node.updated_at,
        type: node.node_type,
        position: node.position
      }
    }

    return NextResponse.json({ node: transformedNode })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/nodes/[nodeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string } }
) {
  try {
    const { treeId, nodeId } = params
    const body = await request.json()
    const { name, description, node_type, position, content, status } = body

    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'No authorization header' },
        { status: 401 }
      )
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get user
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    // Check node permissions - only members can edit nodes
    const permissions = await checkNodePermission(nodeId, user.id)
    
    if (!permissions.canEdit) {
      return NextResponse.json(
        { message: 'You do not have permission to edit this node' },
        { status: 403 }
      )
    }

    // Update the node
    const { data: updatedNode, error: nodeError } = await supabase
      .from('tree_nodes')
      .update({
        name,
        description,
        node_type,
        position,
        updated_at: new Date().toISOString()
      })
      .eq('id', nodeId)
      .eq('tree_id', treeId)
      .select()
      .single()

    if (nodeError) {
      console.error('Error updating node:', nodeError)
      return NextResponse.json({ error: 'Failed to update node' }, { status: 500 })
    }

    // Update or create node content
    if (content !== undefined || status !== undefined) {
      const { data: existingContent } = await supabase
        .from('node_content')
        .select('id')
        .eq('node_id', nodeId)
        .single()

      if (existingContent) {
        // Update existing content
        const { error: contentError } = await supabase
          .from('node_content')
          .update({
            content,
            status,
            updated_at: new Date().toISOString()
          })
          .eq('node_id', nodeId)

        if (contentError) {
          console.error('Error updating node content:', contentError)
        }
      } else {
        // Create new content
        const { error: contentError } = await supabase
          .from('node_content')
          .insert({
            node_id: nodeId,
            content: content || '',
            status: status || 'draft'
          })

        if (contentError) {
          console.error('Error creating node content:', contentError)
        }
      }
    }

    return NextResponse.json({ node: updatedNode })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/nodes/[nodeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string } }
) {
  try {
    const { treeId, nodeId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Delete the node (this will cascade delete content, attachments, and links)
    const { error: nodeError } = await supabase
      .from('tree_nodes')
      .delete()
      .eq('id', nodeId)
      .eq('tree_id', treeId)

    if (nodeError) {
      console.error('Error deleting node:', nodeError)
      return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]/nodes/[nodeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}