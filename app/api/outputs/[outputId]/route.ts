import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ outputId: string }> }
) {
  try {
    const { outputId } = await params
    const body = await request.json()
    const { 
      type, 
      title, 
      description, 
      authors, 
      status, 
      date, 
      url, 
      doi, 
      journal 
    } = body

    // Validate required fields
    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Authenticate
    const authContext = await authenticateRequest(request)
    const { user, supabase } = authContext

    // Validate and prepare data
    const validStatuses = ['published', 'submitted', 'in_preparation', 'draft']
    const finalStatus = validStatuses.includes(status) ? status : 'draft'
    
    // Parse date properly - if it's a string that looks like a date, use it, otherwise null
    let finalDate = null
    if (date && typeof date === 'string' && date.trim()) {
      // Check if it's a valid date string
      const parsedDate = new Date(date)
      if (!isNaN(parsedDate.getTime())) {
        finalDate = parsedDate.toISOString()
      }
    }

    // Determine linked projects
    const { data: links, error: linkError } = await supabase
      .from('project_outputs')
      .select('project_id')
      .eq('output_id', outputId)

    if (linkError) {
      console.error('Error reading project_outputs links:', linkError)
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
    }
    if (!links || links.length === 0) {
      return NextResponse.json({ error: 'Output not found' }, { status: 404 })
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

    // Update the output entry
    const { data, error: outputError } = await supabase
      .from('outputs')
      .update({
        type: type || 'publication',
        title: title.trim(),
        description: description?.trim() || null,
        authors: authors || [],
        status: finalStatus,
        date: finalDate,
        url: url?.trim() || null,
        doi: doi?.trim() || null,
        journal: journal?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', outputId)
      .select()
      .single()

    if (outputError) {
      console.error('Error updating output:', outputError)
      return NextResponse.json({ 
        error: 'Failed to update output',
        details: outputError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ output: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in PUT /api/outputs/[outputId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ outputId: string }> }
) {
  try {
    const { outputId } = await params

    // Authenticate
    const authContext = await authenticateRequest(request)
    const { user, supabase } = authContext

    // Determine linked projects
    const { data: links, error: linkError } = await supabase
      .from('project_outputs')
      .select('project_id')
      .eq('output_id', outputId)

    if (linkError) {
      console.error('Error reading project_outputs links:', linkError)
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
    }
    if (!links || links.length === 0) {
      return NextResponse.json({ error: 'Output not found' }, { status: 404 })
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

    // Delete the output entry (this will cascade delete project_outputs links)
    const { error: outputError } = await supabase
      .from('outputs')
      .delete()
      .eq('id', outputId)

    if (outputError) {
      console.error('Error deleting output:', outputError)
      return NextResponse.json({ error: 'Failed to delete output' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in DELETE /api/outputs/[outputId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
