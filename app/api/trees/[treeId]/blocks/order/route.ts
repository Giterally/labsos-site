import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'
import { checkTreePermission } from '@/lib/permission-utils'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params
    const { blockOrder } = await request.json()

    if (!Array.isArray(blockOrder)) {
      return NextResponse.json({ error: 'Block order must be an array' }, { status: 400 })
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

    // Check tree permissions - only members can reorder blocks
    const permissions = await checkTreePermission(treeId, user.id)
    
    if (!permissions.canEdit) {
      return NextResponse.json(
        { message: 'You do not have permission to reorder blocks in this experiment tree' },
        { status: 403 }
      )
    }

    // Delete existing block order
    const { error: deleteError } = await supabase
      .from('block_order')
      .delete()
      .eq('tree_id', treeId)

    if (deleteError) {
      console.error('Error deleting existing block order:', deleteError)
      return NextResponse.json({ error: 'Failed to update block order' }, { status: 500 })
    }

    // Insert new block order
    const orderData = blockOrder.map((blockType, index) => ({
      tree_id: treeId,
      block_type: blockType,
      position: index
    }))

    const { error: insertError } = await supabase
      .from('block_order')
      .insert(orderData)

    if (insertError) {
      console.error('Error inserting new block order:', insertError)
      return NextResponse.json({ error: 'Failed to update block order' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/blocks/order:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
