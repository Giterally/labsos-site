import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'
import { checkTreePermission } from '@/lib/permission-utils'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; blockId: string }> }
) {
  try {
    const { treeId, blockId } = await params
    const { name } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
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

    // Check tree permissions - only members can edit blocks
    const permissions = await checkTreePermission(treeId, user.id)
    
    if (!permissions.canEdit) {
      return NextResponse.json(
        { message: 'You do not have permission to edit blocks in this experiment tree' },
        { status: 403 }
      )
    }

    // Update the custom block
    const { data: updatedBlock, error: updateError } = await supabase
      .from('custom_blocks')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', blockId)
      .eq('tree_id', treeId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating custom block:', updateError)
      return NextResponse.json({ error: 'Failed to update custom block' }, { status: 500 })
    }

    return NextResponse.json({ block: updatedBlock })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/blocks/[blockId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; blockId: string }> }
) {
  try {
    const { treeId, blockId } = await params

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

    // Check tree permissions - only members can delete blocks
    const permissions = await checkTreePermission(treeId, user.id)
    
    if (!permissions.canEdit) {
      return NextResponse.json(
        { message: 'You do not have permission to delete blocks in this experiment tree' },
        { status: 403 }
      )
    }

    // Delete from block order first
    const { error: orderError } = await supabase
      .from('block_order')
      .delete()
      .eq('tree_id', treeId)
      .eq('block_type', blockId)

    if (orderError) {
      console.error('Error deleting from block order:', orderError)
    }

    // Delete the custom block
    const { error: deleteError } = await supabase
      .from('custom_blocks')
      .delete()
      .eq('id', blockId)
      .eq('tree_id', treeId)

    if (deleteError) {
      console.error('Error deleting custom block:', deleteError)
      return NextResponse.json({ error: 'Failed to delete custom block' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]/blocks/[blockId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
