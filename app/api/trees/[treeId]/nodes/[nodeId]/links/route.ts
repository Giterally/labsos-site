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

    // Get links for the node
    const { data: links, error: linksError } = await supabase
      .from('node_links')
      .select('*')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: true })

    if (linksError) {
      console.error('Error fetching links:', linksError)
      return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 })
    }

    return NextResponse.json({ links })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/nodes/[nodeId]/links:', error)
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

    // Check tree permissions - only members can create links
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to create links in this experiment tree' },
        { status: 403 }
      )
    }

    // Create the link
    const { data: newLink, error: linkError } = await supabase
      .from('node_links')
      .insert({
        node_id: nodeId,
        name,
        url,
        description,
        link_type: link_type || 'external'
      })
      .select()
      .single()

    if (linkError) {
      console.error('Error creating link:', linkError)
      return NextResponse.json({ error: 'Failed to create link' }, { status: 500 })
    }

    return NextResponse.json({ link: newLink })
  } catch (error) {
    console.error('Error in POST /api/trees/[treeId]/nodes/[nodeId]/links:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
