import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string }> }
) {
  try {
    const { treeId, nodeId } = await params

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

    return NextResponse.json({ node })
  } catch (error: any) {
    console.error('Error fetching node:', error)
    return NextResponse.json(
      { message: 'Failed to fetch node', error: error.message },
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

    const body = await request.json()
    
    // Only update fields that exist in the database schema
    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    // Add fields that are provided and exist in the schema
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.node_type !== undefined) updateData.node_type = body.node_type
    if (body.position !== undefined) updateData.position = body.position
    if (body.parent_id !== undefined) updateData.parent_id = body.parent_id

    const { data: updatedNode, error } = await supabase
      .from('tree_nodes')
      .update(updateData)
      .eq('id', nodeId)
      .eq('tree_id', treeId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update node: ${error.message}`)
    }

    return NextResponse.json({ node: updatedNode })
  } catch (error: any) {
    console.error('Error updating node:', error)
    return NextResponse.json(
      { message: 'Failed to update node', error: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ treeId: string; nodeId: string }> }
) {
  try {
    const { treeId, nodeId } = await params

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

    // Fetch the node to get its type before deleting
    const { data: nodeToDelete, error: fetchError } = await supabase
      .from('tree_nodes')
      .select('node_type')
      .eq('id', nodeId)
      .eq('tree_id', treeId)
      .single()

    if (fetchError || !nodeToDelete) {
      throw new Error(`Failed to fetch node for deletion: ${fetchError?.message || 'Node not found'}`)
    }

    const { error } = await supabase
      .from('tree_nodes')
      .delete()
      .eq('id', nodeId)
      .eq('tree_id', treeId)

    if (error) {
      throw new Error(`Failed to delete node: ${error.message}`)
    }

    // Update node_count and node_types in experiment_trees table
    const { data: tree, error: fetchTreeError } = await supabase
      .from('experiment_trees')
      .select('node_count, node_types')
      .eq('id', treeId)
      .single()

    if (fetchTreeError) {
      console.error('Error fetching tree for node count update after deletion:', fetchTreeError)
      // Continue without updating tree stats if fetch fails
    } else if (tree) {
      const updatedNodeTypes = { ...tree.node_types as any }
      if (updatedNodeTypes[nodeToDelete.node_type] > 0) {
        updatedNodeTypes[nodeToDelete.node_type] -= 1
      }

      await supabase
        .from('experiment_trees')
        .update({
          node_count: Math.max(0, (tree.node_count || 0) - 1),
          node_types: updatedNodeTypes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', treeId)
    }

    return NextResponse.json({ message: 'Node deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting node:', error)
    return NextResponse.json(
      { message: 'Failed to delete node', error: error.message },
      { status: 500 }
    )
  }
}
