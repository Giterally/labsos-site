import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; blockId: string }> }
) {
  try {
    const { treeId, blockId } = await params
    const body = await request.json()
    const { name, position, blockType } = body

    // Authenticate the request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { message: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check tree permissions - only members can edit blocks
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
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
    
    if (blockType !== undefined) {
      updateData.block_type = blockType
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

    // Authenticate the request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { message: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check tree permissions - only members can delete blocks
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
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
