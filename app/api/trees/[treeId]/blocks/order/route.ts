import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

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

    // Check tree permissions - only members can reorder blocks
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
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
      const failedUpdates = results.filter((result: any) => result.error)
      
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
