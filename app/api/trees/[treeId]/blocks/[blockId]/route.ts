import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'
import { checkTreePermission } from '@/lib/permission-utils'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; blockId: string }> }
) {
  try {
    const { treeId, blockId } = await params
    const body = await request.json()
    const { name, position } = body

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

    // Update tree_block (unified system)
    const updateData: any = { updated_at: new Date().toISOString() }
    
    if (name !== undefined) {
      updateData.name = name
    }
    
    if (position !== undefined) {
      updateData.position = position
    }

    const { data: updatedBlock, error: updateError } = await supabase
      .from('tree_blocks')
      .update(updateData)
      .eq('id', blockId)
      .eq('tree_id', treeId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating tree block:', updateError)
      return NextResponse.json({ error: 'Failed to update tree block' }, { status: 500 })
    }

    if (!updatedBlock) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
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

    // Delete the tree block (cascade will handle related nodes)
    const { error: deleteError } = await supabase
      .from('tree_blocks')
      .delete()
      .eq('id', blockId)
      .eq('tree_id', treeId)

    if (deleteError) {
      console.error('Error deleting tree block:', deleteError)
      return NextResponse.json({ error: 'Failed to delete tree block' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]/blocks/[blockId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
