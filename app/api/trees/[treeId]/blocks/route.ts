import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'
import { checkTreePermission } from '@/lib/permission-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params

    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    let userId: string | undefined

    if (authHeader) {
      // Extract the token
      const token = authHeader.replace('Bearer ', '')
      
      // Verify the token and get user
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
      }
    }

    // Check tree permissions
    const permissions = await checkTreePermission(treeId, userId)
    
    if (!permissions.canView) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    // Fetch custom blocks
    const { data: customBlocks, error: blocksError } = await supabase
      .from('custom_blocks')
      .select('*')
      .eq('tree_id', treeId)
      .order('position', { ascending: true })

    if (blocksError) {
      console.error('Error fetching custom blocks:', blocksError)
      return NextResponse.json({ error: 'Failed to fetch custom blocks' }, { status: 500 })
    }

    // Fetch block order
    const { data: blockOrder, error: orderError } = await supabase
      .from('block_order')
      .select('*')
      .eq('tree_id', treeId)
      .order('position', { ascending: true })

    if (orderError) {
      console.error('Error fetching block order:', orderError)
      return NextResponse.json({ error: 'Failed to fetch block order' }, { status: 500 })
    }

    return NextResponse.json({ 
      customBlocks: customBlocks || [],
      blockOrder: blockOrder || []
    })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/blocks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params
    const { name, blockType } = await request.json()

    if (!name || !blockType) {
      return NextResponse.json({ error: 'Name and block type are required' }, { status: 400 })
    }

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    // Check tree permissions - only members can create blocks
    const permissions = await checkTreePermission(treeId, user.id)
    
    if (!permissions.canEdit) {
      return NextResponse.json(
        { message: 'You do not have permission to create blocks in this experiment tree' },
        { status: 403 }
      )
    }

    // Get the next position
    const { data: lastBlock, error: positionError } = await supabase
      .from('custom_blocks')
      .select('position')
      .eq('tree_id', treeId)
      .order('position', { ascending: false })
      .limit(1)

    const nextPosition = lastBlock && lastBlock.length > 0 ? lastBlock[0].position + 1 : 0

    // Create the custom block
    const { data: newBlock, error: createError } = await supabase
      .from('custom_blocks')
      .insert({
        tree_id: treeId,
        name,
        block_type: blockType,
        position: nextPosition
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating custom block:', createError)
      return NextResponse.json({ error: 'Failed to create custom block' }, { status: 500 })
    }

    // Add to block order
    const { error: orderError } = await supabase
      .from('block_order')
      .insert({
        tree_id: treeId,
        block_type: newBlock.id,
        position: nextPosition
      })

    if (orderError) {
      console.error('Error adding to block order:', orderError)
      // Continue anyway, the block was created
    }

    return NextResponse.json({ block: newBlock })
  } catch (error) {
    console.error('Error in POST /api/trees/[treeId]/blocks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
