import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    // Resolve project and visibility using server client
    let actualProjectId = projectId
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    if (!isUUID) {
      const { data: bySlug } = await supabaseServer
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()
      if (bySlug?.id) {
        actualProjectId = bySlug.id
      } else {
        const { data: byName } = await supabaseServer
          .from('projects')
          .select('id')
          .eq('name', projectId)
          .single()
        if (!byName?.id) {
          return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }
        actualProjectId = byName.id
      }
    }

    const { data: proj, error: projErr } = await supabaseServer
      .from('projects')
      .select('visibility')
      .eq('id', actualProjectId)
      .single()

    if (projErr || !proj) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    let client = supabaseServer as any
    if (proj.visibility === 'private') {
      // Require auth for private projects
      const authContext = await authenticateRequest(request)
      client = authContext.supabase
      const permissionService = new PermissionService(client, authContext.user.id)
      const access = await permissionService.checkProjectAccess(actualProjectId)
      if (!access.canRead) {
        return NextResponse.json({ message: 'Access denied' }, { status: 403 })
      }
    }

    // Get software associated with this project
    const { data: projectSoftware, error: projectSoftwareError } = await client
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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
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

    // Authenticate and enforce write permissions
    const authContext = await authenticateRequest(request)
    const { user, supabase } = authContext

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

    // Verify permissions
    const permissionService = new PermissionService(supabase, user.id)
    const access = await permissionService.checkProjectAccess(actualProjectId)
    if (!access.canWrite) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 })
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
        created_by: user.id
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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in POST /api/projects/[projectId]/software:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}