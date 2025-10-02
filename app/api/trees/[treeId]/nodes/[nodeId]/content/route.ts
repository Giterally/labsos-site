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
    
    // Update the node with the new content
    const updateData: any = {
      updated_at: new Date().toISOString(),
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
