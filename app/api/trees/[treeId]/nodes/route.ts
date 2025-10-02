import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TablesInsert } from '@/lib/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params
    
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'No authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    const { data: nodes, error } = await supabase
      .from('tree_nodes')
      .select('*')
      .eq('tree_id', treeId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch nodes: ${error.message}`)
    }

    return NextResponse.json({ nodes })
  } catch (error: any) {
    console.error('Error fetching nodes:', error)
    return NextResponse.json(
      { message: 'Failed to fetch nodes', error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params
    
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'No authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    const { name, description, node_type, parent_id, content, metadata, attachments, links } = await request.json()

    const newNodeData: TablesInsert<'tree_nodes'> = {
      tree_id: treeId,
      name,
      description,
      node_type,
      parent_id: parent_id || null,
      content: content || {},
      metadata: metadata || {},
      attachments: attachments || [],
      links: links || [],
      created_by: user.id,
    }

    const { data: newNode, error } = await supabase
      .from('tree_nodes')
      .insert(newNodeData)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create node: ${error.message}`)
    }

    // Update node_count and node_types in experiment_trees table
    const { data: tree, error: fetchTreeError } = await supabase
      .from('experiment_trees')
      .select('node_count, node_types')
      .eq('id', treeId)
      .single()

    if (fetchTreeError) {
      console.error('Error fetching tree for node count update:', fetchTreeError)
      // Continue without updating tree stats if fetch fails
    } else if (tree) {
      const updatedNodeTypes = { ...tree.node_types as any }
      updatedNodeTypes[node_type] = (updatedNodeTypes[node_type] || 0) + 1

      await supabase
        .from('experiment_trees')
        .update({
          node_count: (tree.node_count || 0) + 1,
          node_types: updatedNodeTypes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', treeId)
    }

    return NextResponse.json({ node: newNode }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating node:', error)
    return NextResponse.json(
      { message: 'Failed to create node', error: error.message },
      { status: 500 }
    )
  }
}
