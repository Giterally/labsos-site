import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { fetchNodeAndGenerateEmbedding } from '@/lib/embedding-helpers'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string; linkId: string }> }
) {
  try {
    const { treeId, nodeId, linkId } = await params
    const body = await request.json()
    const { name, url, description, link_type } = body

    if (!name || !url) {
      return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 })
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

    // Check tree permissions - only members can edit links
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to edit links in this experiment tree' },
        { status: 403 }
      )
    }

    // Update the link
    const { data: updatedLink, error: linkError } = await supabase
      .from('node_links')
      .update({
        name,
        url,
        description,
        link_type,
        updated_at: new Date().toISOString()
      })
      .eq('id', linkId)
      .select()
      .single()

    if (linkError) {
      console.error('Error updating link:', linkError)
      return NextResponse.json({ error: 'Failed to update link' }, { status: 500 })
    }

    // Trigger embedding update (non-blocking)
    fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(err => {
      console.error('Embedding update failed:', err);
    });

    return NextResponse.json({ link: updatedLink })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/nodes/[nodeId]/links/[linkId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string; linkId: string }> }
) {
  try {
    const { treeId, nodeId, linkId } = await params

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

    // Check tree permissions - only members can delete links
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to delete links in this experiment tree' },
        { status: 403 }
      )
    }

    // Delete the link
    const { error: linkError } = await supabase
      .from('node_links')
      .delete()
      .eq('id', linkId)

    if (linkError) {
      console.error('Error deleting link:', linkError)
      return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 })
    }

    // Trigger embedding update (non-blocking)
    fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(err => {
      console.error('Embedding update failed:', err);
    });

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]/nodes/[nodeId]/links/[linkId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
