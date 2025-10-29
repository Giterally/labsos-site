import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string }> }
) {
  try {
    const { treeId, nodeId } = await params

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

    // Check tree permissions
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canRead) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    // Get attachments for the node
    const { data: attachments, error: attachmentsError } = await supabase
      .from('node_attachments')
      .select('*')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: true })

    if (attachmentsError) {
      console.error('Error fetching attachments:', attachmentsError)
      return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 })
    }

    return NextResponse.json({ attachments })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/nodes/[nodeId]/attachments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string; nodeId: string }> }
) {
  try {
    const { treeId, nodeId } = await params
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

    // Check tree permissions - only members can create attachments
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to create attachments in this experiment tree' },
        { status: 403 }
      )
    }

    // Create the attachment
    const { data: newAttachment, error: attachmentError } = await supabase
      .from('node_attachments')
      .insert({
        node_id: nodeId,
        name,
        file_type,
        file_size,
        file_url,
        description
      })
      .select()
      .single()

    if (attachmentError) {
      console.error('Error creating attachment:', attachmentError)
      return NextResponse.json({ error: 'Failed to create attachment' }, { status: 500 })
    }

    return NextResponse.json({ attachment: newAttachment })
  } catch (error) {
    console.error('Error in POST /api/trees/[treeId]/nodes/[nodeId]/attachments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
