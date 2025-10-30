import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function PUT(
  request: NextRequest,
  { params }: { params: { softwareId: string } }
) {
  try {
    const { softwareId } = params
    const body = await request.json()
    const { 
      name, 
      type, 
      category, 
      description, 
      version, 
      license_type, 
      license_cost, 
      license_period, 
      repository_url, 
      documentation_url 
    } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Authenticate
    const authContext = await authenticateRequest(request)
    const { user, supabase } = authContext

    // Determine linked projects
    const { data: links, error: linkError } = await supabase
      .from('project_software')
      .select('project_id')
      .eq('software_id', softwareId)

    if (linkError) {
      console.error('Error reading project_software links:', linkError)
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
    }
    if (!links || links.length === 0) {
      return NextResponse.json({ error: 'Software not found' }, { status: 404 })
    }

    // Check canWrite against at least one linked project
    const permissionService = new PermissionService(supabase, user.id)
    let hasWrite = false
    for (const l of links) {
      const perms = await permissionService.checkProjectAccess(l.project_id)
      if (perms.canWrite) { hasWrite = true; break }
    }
    if (!hasWrite) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 })
    }

    // Update the software entry
    const { data, error: softwareError } = await supabase
      .from('software')
      .update({
        name: name.trim(),
        type: type || 'external',
        category: category || 'other',
        description: description?.trim() || null,
        version: version?.trim() || null,
        license_type: license_type || 'free',
        license_cost: license_cost || null,
        license_period: license_period || 'one_time',
        repository_url: repository_url?.trim() || null,
        documentation_url: documentation_url?.trim() || null,
        last_updated: new Date().toISOString()
      })
      .eq('id', softwareId)
      .select()
      .single()

    if (softwareError) {
      console.error('Error updating software:', softwareError)
      return NextResponse.json({ 
        error: 'Failed to update software',
        details: softwareError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ software: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in PUT /api/software/[softwareId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { softwareId: string } }
) {
  try {
    const { softwareId } = params

    // Authenticate
    const authContext = await authenticateRequest(request)
    const { user, supabase } = authContext

    // Determine linked projects
    const { data: links, error: linkError } = await supabase
      .from('project_software')
      .select('project_id')
      .eq('software_id', softwareId)

    if (linkError) {
      console.error('Error reading project_software links:', linkError)
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
    }
    if (!links || links.length === 0) {
      return NextResponse.json({ error: 'Software not found' }, { status: 404 })
    }

    // Check canWrite against at least one linked project
    const permissionService = new PermissionService(supabase, user.id)
    let hasWrite = false
    for (const l of links) {
      const perms = await permissionService.checkProjectAccess(l.project_id)
      if (perms.canWrite) { hasWrite = true; break }
    }
    if (!hasWrite) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 })
    }

    // Delete the software entry (this will cascade delete project_software links)
    const { error: softwareError } = await supabase
      .from('software')
      .delete()
      .eq('id', softwareId)

    if (softwareError) {
      console.error('Error deleting software:', softwareError)
      return NextResponse.json({ error: 'Failed to delete software' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in DELETE /api/software/[softwareId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
