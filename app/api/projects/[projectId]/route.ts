import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkProjectPermission } from '@/lib/permission-utils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    
    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    let userId: string | undefined

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
      }
    }

    // Check if projectId is a UUID or slug/name
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug or name, try to find the project
      // First try by slug
      let { data: projectBySlug, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      // If not found by slug, try by name
      if (projectError || !projectBySlug) {
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
        actualProjectId = projectBySlug.id
      }
    }

    // Check user permissions for this project
    const permissions = await checkProjectPermission(actualProjectId, userId)
    
    if (!permissions.canView) {
      return NextResponse.json(
        { message: 'Access denied. This project is private.' },
        { status: 403 }
      )
    }

    // Get the specific project
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', actualProjectId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Project not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to fetch project: ${error.message}`)
    }

    // Get experiment trees for this project
    const { data: trees, error: treesError } = await supabase
      .from('experiment_trees')
      .select('*')
      .eq('project_id', actualProjectId)
      .order('created_at', { ascending: false })

    // Transform project to include related data
    const transformedProject = {
      ...project,
      members: [],
      past_members: [],
      related_projects: [],
      experiment_trees: trees || [],
      software: [],
      datasets: [],
      outputs: [],
      stats: {
        total_trees: trees?.length || 0,
        active_trees: trees?.filter(t => t.status === 'active').length || 0,
        completed_trees: trees?.filter(t => t.status === 'completed').length || 0,
        total_nodes: trees?.reduce((sum, t) => sum + t.node_count, 0) || 0,
        total_software: 0,
        total_datasets: 0,
        total_outputs: 0,
        total_publications: 0,
        total_citations: 0
      }
    }

    return NextResponse.json({ project: transformedProject })
  } catch (error: any) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { message: 'Failed to fetch project', error: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    
    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'No authorization header' },
        { status: 401 }
      )
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }
    

    const body = await request.json()
    const { name, description, institution, department, status, visibility } = body

    // Check if user is creator or team member
    const { data: projectCheck } = await supabase
      .from('projects')
      .select('created_by')
      .eq('id', projectId)
      .single()

    if (!projectCheck) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if user is creator
    const isCreator = projectCheck.created_by === user.id
    
    // Check if user is a team member
    const { data: teamMemberCheck } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .is('left_at', null)
      .single()
    
    const isTeamMember = !!teamMemberCheck
    
    if (!isCreator && !isTeamMember) {
      return NextResponse.json(
        { message: 'You do not have permission to update this project' },
        { status: 403 }
      )
    }

    // Update the project
    const { data: updatedProject, error } = await supabase
      .from('projects')
      .update({
        name,
        description,
        institution,
        department,
        status,
        visibility,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Project not found or you are not the creator' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to update project: ${error.message}`)
    }

    return NextResponse.json({ project: updatedProject })
  } catch (error: any) {
    console.error('Error updating project:', error)
    return NextResponse.json(
      { message: 'Failed to update project', error: error.message },
      { status: 500 }
    )
  }
}
