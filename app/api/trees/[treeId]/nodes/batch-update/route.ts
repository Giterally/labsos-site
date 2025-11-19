import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params
    const body = await request.json()
    const { positionUpdates } = body

    if (!positionUpdates || !Array.isArray(positionUpdates)) {
      return NextResponse.json({ error: 'positionUpdates array is required' }, { status: 400 })
    }

    // Validate position updates
    for (const update of positionUpdates) {
      if (!update.nodeId || typeof update.position !== 'number' || update.position < 1) {
        return NextResponse.json({ 
          error: 'Each update must have nodeId (string) and position (number >= 1)' 
        }, { status: 400 })
      }
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

    // Check tree permissions - only members can update nodes
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to update nodes in this experiment tree' },
        { status: 403 }
      )
    }

    // Update all node positions in a transaction
    const updatePromises = positionUpdates.map(({ nodeId, position }) =>
      supabase
        .from('tree_nodes')
        .update({ 
          position,
          updated_at: new Date().toISOString(),
          updated_by: user.id
        })
        .eq('id', nodeId)
        .eq('tree_id', treeId)
    )

    const results = await Promise.all(updatePromises)

    // Check for errors
    const errors = results.filter(result => result.error)
    if (errors.length > 0) {
      console.error('Error updating node positions:', errors)
      return NextResponse.json({ 
        error: 'Failed to update some node positions',
        details: errors.map(e => e.error)
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      updatedCount: positionUpdates.length 
    })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/nodes/batch-update:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
