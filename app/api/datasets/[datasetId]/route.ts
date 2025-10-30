import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const { datasetId } = await params
    const body = await request.json()
    const { 
      name, 
      type, 
      description, 
      format, 
      file_size, 
      size_unit, 
      access_level, 
      repository_url 
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
      .from('project_datasets')
      .select('project_id')
      .eq('dataset_id', datasetId)

    if (linkError) {
      console.error('Error reading project_datasets links:', linkError)
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
    }
    if (!links || links.length === 0) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
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

    // Validate access_level
    const validAccessLevels = ['public', 'restricted', 'private']
    const finalAccessLevel = validAccessLevels.includes(access_level) ? access_level : 'public'
    
    // Validate size_unit
    const validSizeUnits = ['B', 'KB', 'MB', 'GB', 'TB']
    const finalSizeUnit = validSizeUnits.includes(size_unit) ? size_unit : 'bytes'
    
    // Validate dataset type
    const validDatasetTypes = ['raw_data', 'processed_data', 'training_data', 'validation_data']
    const finalDatasetType = validDatasetTypes.includes(type) ? type : 'raw_data'

    // Update the dataset entry
    const { data, error: datasetError } = await supabase
      .from('datasets')
      .update({
        name: name.trim(),
        type: finalDatasetType,
        description: description?.trim() || null,
        format: format?.trim() || null,
        file_size: file_size || null,
        size_unit: finalSizeUnit,
        access_level: finalAccessLevel,
        repository_url: repository_url?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', datasetId)
      .select()
      .single()

    if (datasetError) {
      console.error('Error updating dataset:', datasetError)
      return NextResponse.json({ 
        error: 'Failed to update dataset',
        details: datasetError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ dataset: data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in PUT /api/datasets/[datasetId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ datasetId: string }> }
) {
  try {
    const { datasetId } = await params

    // Authenticate
    const authContext = await authenticateRequest(request)
    const { user, supabase } = authContext

    // Determine linked projects
    const { data: links, error: linkError } = await supabase
      .from('project_datasets')
      .select('project_id')
      .eq('dataset_id', datasetId)

    if (linkError) {
      console.error('Error reading project_datasets links:', linkError)
      return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
    }
    if (!links || links.length === 0) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
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

    // Delete the dataset entry (this will cascade delete project_datasets links)
    const { error: datasetError } = await supabase
      .from('datasets')
      .delete()
      .eq('id', datasetId)

    if (datasetError) {
      console.error('Error deleting dataset:', datasetError)
      return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in DELETE /api/datasets/[datasetId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
