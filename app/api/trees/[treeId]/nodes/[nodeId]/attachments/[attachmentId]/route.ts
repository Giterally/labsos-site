import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { fetchNodeAndGenerateEmbedding } from '@/lib/embedding-helpers'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string; attachmentId: string }> }
) {
  try {
    const { treeId, nodeId, attachmentId } = await params
    const body = await request.json()
    const { name, file_type, file_size, file_url, description } = body

    if (!name || !file_type || !file_url) {
      return NextResponse.json({ error: 'Name, file type, and file URL are required' }, { status: 400 })
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

    // Check tree permissions - only members can edit attachments
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to edit attachments in this experiment tree' },
        { status: 403 }
      )
    }

    // Update the attachment
    const { data: updatedAttachment, error: attachmentError } = await supabase
      .from('node_attachments')
      .update({
        name,
        file_type,
        file_size,
        file_url,
        description,
        updated_at: new Date().toISOString()
      })
      .eq('id', attachmentId)
      .select()
      .single()

    if (attachmentError) {
      console.error('Error updating attachment:', attachmentError)
      return NextResponse.json({ error: 'Failed to update attachment' }, { status: 500 })
    }

    // Trigger embedding update (non-blocking)
    fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(err => {
      console.error('Embedding update failed:', err);
    });

    return NextResponse.json({ attachment: updatedAttachment })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/nodes/[nodeId]/attachments/[attachmentId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string; attachmentId: string }> }
) {
  try {
    const { treeId, nodeId, attachmentId } = await params

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

    // Check tree permissions - only members can delete attachments
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to delete attachments in this experiment tree' },
        { status: 403 }
      )
    }

    // Delete the attachment
    const { error: attachmentError } = await supabase
      .from('node_attachments')
      .delete()
      .eq('id', attachmentId)

    if (attachmentError) {
      console.error('Error deleting attachment:', attachmentError)
      return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
    }

    // Trigger embedding update (non-blocking)
    fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(err => {
      console.error('Embedding update failed:', err);
    });

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]/nodes/[nodeId]/attachments/[attachmentId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
