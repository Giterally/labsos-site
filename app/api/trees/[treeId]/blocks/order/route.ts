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

    console.log('Block order update request:', { treeId, blockOrder })

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

    // Update block positions in tree_blocks table
    if (blockOrder.length > 0) {
      // Update positions for each block
      const updatePromises = blockOrder.map((blockId, index) => 
        supabase
          .from('tree_blocks')
          .update({ position: index })
          .eq('id', blockId)
          .eq('tree_id', treeId)
      )

      const results = await Promise.all(updatePromises)
      const failedUpdates = results.filter(result => result.error)
      
      if (failedUpdates.length > 0) {
        console.error('Error updating block positions:', failedUpdates)
        return NextResponse.json({ error: 'Failed to update block order' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/blocks/order:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
