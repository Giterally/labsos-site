import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(
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

    // Get the specific project
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('created_by', user.id)
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
      .eq('project_id', projectId)
      .eq('created_by', user.id)
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
