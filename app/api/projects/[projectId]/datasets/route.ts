import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Check if projectId is a UUID or slug
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug, get the actual UUID
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      actualProjectId = project.id
    }

    // Get datasets associated with this project
    const { data: projectDatasets, error: projectDatasetsError } = await supabase
      .from('project_datasets')
      .select(`
        dataset:dataset_id (
          id,
          name,
          type,
          description,
          format,
          file_size,
          size_unit,
          access_level,
          repository_url
        )
      `)
      .eq('project_id', actualProjectId)

    if (projectDatasetsError) {
      console.error('Error fetching project datasets:', projectDatasetsError)
      return NextResponse.json({ error: 'Failed to fetch datasets' }, { status: 500 })
    }

    const datasets = projectDatasets?.map(item => item.dataset).filter(Boolean) || []

    return NextResponse.json({ datasets })
  } catch (error) {
    console.error('Error in GET /api/projects/[projectId]/datasets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params
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

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Check if projectId is a UUID or slug
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug, get the actual UUID
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      actualProjectId = project.id
    }

    // Create the dataset entry
    const { data: dataset, error: datasetError } = await supabase
      .from('datasets')
      .insert({
        name: name.trim(),
        type: type || 'raw_data',
        description: description?.trim() || null,
        format: format?.trim() || null,
        file_size: file_size || null,
        size_unit: size_unit || 'bytes',
        access_level: access_level || 'private',
        repository_url: repository_url?.trim() || null,
        created_by: null // No authentication for now
      })
      .select()
      .single()

    if (datasetError) {
      console.error('Error creating dataset:', datasetError)
      return NextResponse.json({ 
        error: 'Failed to create dataset',
        details: datasetError.message 
      }, { status: 500 })
    }

    // Link dataset to project
    const { error: linkError } = await supabase
      .from('project_datasets')
      .insert({
        project_id: actualProjectId,
        dataset_id: dataset.id
      })

    if (linkError) {
      console.error('Error linking dataset to project:', linkError)
      // Clean up the dataset entry
      await supabase.from('datasets').delete().eq('id', dataset.id)
      return NextResponse.json({ 
        error: 'Failed to link dataset to project',
        details: linkError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ dataset })
  } catch (error) {
    console.error('Error in POST /api/projects/[projectId]/datasets:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
