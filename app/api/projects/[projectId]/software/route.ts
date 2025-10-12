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

    // Check if projectId is a UUID or slug/name
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug or name, try to find the project
      // First try by slug
      let { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      // If not found by slug, try by name
      if (projectError || !project) {
        const { data: projectByName, error: nameError } = await supabase
          .from('projects')
          .select('id')
          .eq('name', projectId)
          .single()

        if (nameError || !projectByName) {
          return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }
        actualProjectId = projectByName.id
      } else {
        actualProjectId = project.id
      }
    }

    // Get software associated with this project
    const { data: projectSoftware, error: projectSoftwareError } = await supabase
      .from('project_software')
      .select(`
        software:software_id (
          id,
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
        )
      `)
      .eq('project_id', actualProjectId)

    if (projectSoftwareError) {
      console.error('Error fetching project software:', projectSoftwareError)
      return NextResponse.json({ error: 'Failed to fetch software' }, { status: 500 })
    }

    const software = projectSoftware?.map(item => item.software).filter(Boolean) || []

    return NextResponse.json({ software })
  } catch (error) {
    console.error('Error in GET /api/projects/[projectId]/software:', error)
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

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Check if projectId is a UUID or slug/name
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug or name, try to find the project
      // First try by slug
      let { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      // If not found by slug, try by name
      if (projectError || !project) {
        const { data: projectByName, error: nameError } = await supabase
          .from('projects')
          .select('id')
          .eq('name', projectId)
          .single()

        if (nameError || !projectByName) {
          return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }
        actualProjectId = projectByName.id
      } else {
        actualProjectId = project.id
      }
    }

    // Create the software entry
    const { data: software, error: softwareError } = await supabase
      .from('software')
      .insert({
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
        created_by: null // No authentication for now
      })
      .select()
      .single()

    if (softwareError) {
      console.error('Error creating software:', softwareError)
      return NextResponse.json({ 
        error: 'Failed to create software',
        details: softwareError.message 
      }, { status: 500 })
    }

    // Link software to project
    const { error: linkError } = await supabase
      .from('project_software')
      .insert({
        project_id: actualProjectId,
        software_id: software.id
      })

    if (linkError) {
      console.error('Error linking software to project:', linkError)
      // Clean up the software entry
      await supabase.from('software').delete().eq('id', software.id)
      return NextResponse.json({ 
        error: 'Failed to link software to project',
        details: linkError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ software })
  } catch (error) {
    console.error('Error in POST /api/projects/[projectId]/software:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}