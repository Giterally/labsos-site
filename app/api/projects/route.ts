import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create a Supabase client with anon key for server-side operations
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  try {
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

    // Get user's projects (both owned and team member projects)
    // First get owned projects
    const { data: ownedProjects, error: ownedError } = await supabase
      .from('projects')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (ownedError) {
      throw new Error(`Failed to fetch owned projects: ${ownedError.message}`)
    }

    // Then get projects where user is a team member
    const { data: memberProjects, error: memberError } = await supabase
      .from('project_members')
      .select(`
        project_id,
        role,
        joined_at,
        projects!project_members_project_id_fkey (*)
      `)
      .eq('user_id', user.id)
      .is('left_at', null)

    if (memberError) {
      throw new Error(`Failed to fetch member projects: ${memberError.message}`)
    }

    // Combine and deduplicate projects
    const allProjects = [...(ownedProjects || [])]
    const memberProjectIds = new Set((ownedProjects || []).map(p => p.id))
    
    ;(memberProjects || []).forEach(member => {
      const project = Array.isArray(member.projects) ? member.projects[0] : member.projects
      if (project && !memberProjectIds.has(project.id)) {
        allProjects.push(project)
      }
    })

    const projects = allProjects

    // Transform projects to include empty related data and user role
    const transformedProjects = (projects || []).map(project => {
      const isOwner = project.created_by === user.id
      
      // Find user's role in member projects
      let userRole = 'Team Member'
      if (isOwner) {
        userRole = 'Lead Researcher'
      } else {
        const memberProject = memberProjects?.find(mp => {
          const proj = Array.isArray(mp.projects) ? mp.projects[0] : mp.projects
          return proj?.id === project.id
        })
        if (memberProject) {
          userRole = memberProject.role
        }
      }
      
      return {
        ...project,
        user_role: userRole,
        is_owner: isOwner,
        members: [],
        past_members: [],
        related_projects: [],
        experiment_trees: [],
        software: [],
        datasets: [],
        outputs: [],
        stats: {
          total_trees: 0,
          active_trees: 0,
          completed_trees: 0,
          total_nodes: 0,
          total_software: 0,
          total_datasets: 0,
          total_outputs: 0,
          total_publications: 0,
          total_citations: 0
        }
      }
    })

    return NextResponse.json({ projects: transformedProjects })
  } catch (error: any) {
    console.error('Error fetching user projects:', error)
    return NextResponse.json(
      { message: 'Failed to fetch user projects', error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
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
    
    // Create the project
    const { data: project, error } = await supabase
      .from('projects')
      .insert([{
        ...body,
        created_by: user.id
      }])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`)
    }

    // Add the creator as a team member with "Lead Researcher" role
    const { error: memberError } = await supabase
      .from('project_members')
      .insert([{
        project_id: project.id,
        user_id: user.id,
        role: 'Lead Researcher',
        initials: user.user_metadata?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U'
      }])

    if (memberError) {
      console.warn('Failed to add creator as team member:', memberError)
      // Don't fail the project creation if team member addition fails
    }

    // Transform project to include empty related data
    const transformedProject = {
      ...project,
      members: [],
      past_members: [],
      related_projects: [],
      experiment_trees: [],
      software: [],
      datasets: [],
      outputs: [],
      stats: {
        total_trees: 0,
        active_trees: 0,
        completed_trees: 0,
        total_nodes: 0,
        total_software: 0,
        total_datasets: 0,
        total_outputs: 0,
        total_publications: 0,
        total_citations: 0
      }
    }

    return NextResponse.json({ project: transformedProject }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating project:', error)
    return NextResponse.json(
      { message: 'Failed to create project', error: error.message },
      { status: 500 }
    )
  }
}
