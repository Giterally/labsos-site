import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'

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
