import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params

    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)

    // Check tree permissions
    const access = await permissions.checkTreeAccess(treeId)
    
    if (!access.canRead) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    // Get the experiment tree information
    const { data, error: treeError } = await auth.supabase
      .from('experiment_trees')
      .select('id, name, description, status, category, node_count, created_at, updated_at')
      .eq('id', treeId)
      .single()

    if (treeError) {
      console.error('Error fetching experiment tree:', treeError)
      return NextResponse.json({ error: 'Failed to fetch experiment tree' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Experiment tree not found' }, { status: 404 })
    }

    return NextResponse.json({ tree: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in GET /api/trees/[treeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params
    const body = await request.json()
    const { name, description, status } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)

    // Check tree permissions - only members can edit trees
    const access = await permissions.checkTreeAccess(treeId)
    
    if (!access.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to edit this experiment tree' },
        { status: 403 }
      )
    }

    // Update the experiment tree
    const { data, error: treeError } = await auth.supabase
      .from('experiment_trees')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        status: status || 'draft',
        updated_at: new Date().toISOString()
      })
      .eq('id', treeId)
      .select()
      .single()

    if (treeError) {
      console.error('Error updating experiment tree:', treeError)
      return NextResponse.json({ 
        error: 'Failed to update experiment tree',
        details: treeError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ tree: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in PUT /api/trees/[treeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params

    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)

    // Check tree permissions - only members can delete trees
    const access = await permissions.checkTreeAccess(treeId)
    
    if (!access.canDelete) {
      return NextResponse.json(
        { message: 'You do not have permission to delete this experiment tree' },
        { status: 403 }
      )
    }

    // Delete the experiment tree (this will cascade delete all related nodes, content, attachments, and links)
    const { error: treeError } = await auth.supabase
      .from('experiment_trees')
      .delete()
      .eq('id', treeId)

    if (treeError) {
      console.error('Error deleting experiment tree:', treeError)
      return NextResponse.json({ error: 'Failed to delete experiment tree' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in DELETE /api/trees/[treeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
