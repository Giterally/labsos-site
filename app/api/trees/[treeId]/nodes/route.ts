import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Get nodes for the tree with their content, attachments, and links
    const { data: nodes, error: nodesError } = await supabase
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
    }))

    return NextResponse.json({ nodes: transformedNodes })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/nodes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = params
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

    // Validate node_type against allowed values
    const allowedNodeTypes = ['protocol', 'data_creation', 'analysis', 'results']
    if (node_type && !allowedNodeTypes.includes(node_type)) {
      return NextResponse.json({ 
        error: `Invalid node type. Must be one of: ${allowedNodeTypes.join(', ')}` 
      }, { status: 400 })
    }

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Create the node
    const { data: newNode, error: nodeError } = await supabase
      .from('tree_nodes')
      .insert({
        tree_id: treeId,
        name: name.trim(),
        description: description?.trim() || null,
        node_type: node_type || 'protocol',
        position: position || 1
      })
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
          error: `Invalid node type. Must be one of: ${allowedNodeTypes.join(', ')}` 
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
      const { error: contentError } = await supabase
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
    console.error('Error in POST /api/trees/[treeId]/nodes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}