import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params

    // Resolve parent project visibility using server client
    const { data: treeMeta, error: treeMetaErr } = await supabaseServer
      .from('experiment_trees')
      .select('id, project_id')
      .eq('id', treeId)
      .single()

    if (treeMetaErr || !treeMeta) {
      return NextResponse.json({ error: 'Experiment tree not found' }, { status: 404 })
    }

    const { data: proj, error: projErr } = await supabaseServer
      .from('projects')
      .select('visibility')
      .eq('id', treeMeta.project_id)
      .single()

    if (projErr || !proj) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    let client: any = supabaseServer
    if (proj.visibility === 'private') {
      const auth = await authenticateRequest(request)
      const permissions = new PermissionService(auth.supabase, auth.user.id)
      const access = await permissions.checkTreeAccess(treeId)
      if (!access.canRead) {
        return NextResponse.json({ message: 'Access denied' }, { status: 403 })
      }
      client = auth.supabase
    }

    // Get nodes for the tree with their content, attachments, and links
    const { data: nodes, error: nodesError } = await client
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
      .eq('tree_id', treeId)
      .order('position', { ascending: true })

    if (nodesError) {
      console.error('Error fetching nodes:', nodesError)
      return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 })
    }

    // Transform the data to match the expected format
    const transformedNodes = nodes.map(node => ({
      id: node.id,
      title: node.name,
      description: node.description,
      type: node.block_id || node.node_type, // Use block_id if available, fallback to node_type
      status: node.node_content?.[0]?.status || 'draft',
      position: node.position,
      content: node.node_content?.[0]?.content || '',
      attachments: node.node_attachments || [],
      links: node.node_links || [],
      metadata: {
        created: node.created_at,
        updated: node.updated_at,
        type: node.node_type, // Keep original node_type in metadata
        position: node.position
      }
    }))

    return NextResponse.json({ nodes: transformedNodes })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in GET /api/trees/[treeId]/nodes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params
    const body = await request.json()
    const { name, description, node_type, position, content } = body

    // Enhanced logging for debugging
    console.log('Creating node with data:', {
      treeId,
      name,
      description,
      node_type,
      position,
      content
    })

    // Input validation
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Node name is required' }, { status: 400 })
    }

    if (!treeId) {
      return NextResponse.json({ error: 'Tree ID is required' }, { status: 400 })
    }

    // Validate node_type against allowed values or custom block IDs
    const allowedNodeTypes = ['protocol', 'data_creation', 'analysis', 'results']
    
    // Check if it's a custom block ID (UUID format)
    const isCustomBlockId = node_type && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node_type)
    
    
    if (node_type && !allowedNodeTypes.includes(node_type) && !isCustomBlockId) {
      return NextResponse.json({ 
        error: `Invalid node type. Must be one of: ${allowedNodeTypes.join(', ')} or a valid custom block ID` 
      }, { status: 400 })
    }

    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)

    // Check tree permissions - only members can create nodes
    const access = await permissions.checkTreeAccess(treeId)
    
    if (!access.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to create nodes in this experiment tree' },
        { status: 403 }
      )
    }

    // Create the node with unified system support
    const nodeData: any = {
      tree_id: treeId,
      name: name.trim(),
      description: description?.trim() || null,
      position: position || 1
    }

    // Handle unified system: if node_type is a UUID (block ID), use it as block_id
    if (node_type && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node_type)) {
      nodeData.block_id = node_type
      nodeData.node_type = 'protocol' // Default node type
    } else {
      nodeData.node_type = node_type || 'protocol'
      // For regular node types, we'll need to find the corresponding block
      // This is a temporary solution until migration is run
    }

    const { data: newNode, error: nodeError } = await auth.supabase
      .from('tree_nodes')
      .insert(nodeData)
      .select()
      .single()

    if (nodeError) {
      console.error('Database error creating node:', nodeError)
      console.error('Error details:', {
        code: nodeError.code,
        message: nodeError.message,
        details: nodeError.details,
        hint: nodeError.hint
      })
      
      // Return specific error messages based on the error type
      if (nodeError.code === '23503') {
        return NextResponse.json({ 
          error: 'Invalid tree ID. The experiment tree does not exist.' 
        }, { status: 400 })
      } else if (nodeError.code === '23514') {
        return NextResponse.json({ 
          error: `Invalid node type. Must be one of: ${allowedNodeTypes.join(', ')} or a valid custom block ID` 
        }, { status: 400 })
      } else {
        return NextResponse.json({ 
          error: `Failed to create node: ${nodeError.message}`,
          details: nodeError.details || nodeError.hint
        }, { status: 500 })
      }
    }

    // Create the node content if provided
    if (content) {
      const { error: contentError } = await auth.supabase
        .from('node_content')
        .insert({
          node_id: newNode.id,
          content,
          status: 'draft'
        })

      if (contentError) {
        console.error('Error creating node content:', contentError)
        // Don't fail the entire operation if content creation fails
      }
    }

    return NextResponse.json({ node: newNode })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in POST /api/trees/[treeId]/nodes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}