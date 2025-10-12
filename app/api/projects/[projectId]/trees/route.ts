import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkProjectPermission } from '@/lib/permission-utils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    let userId: string | undefined

    if (authHeader) {
      // Extract the token
      const token = authHeader.replace('Bearer ', '')
      
      // Verify the token and get user
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
      }
    }

    // Check project permissions
    const permissions = await checkProjectPermission(projectId, userId)
    
    if (!permissions.canView) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // First, try to find the project by slug or UUID
    let actualProjectId = projectId
    
    // Check if projectId is a slug (not a UUID format)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    
    if (!isUUID) {
      // It's a slug, find the actual project ID
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

    // Get experiment trees for the project
    const { data: trees, error: treesError } = await supabase
      .from('experiment_trees')
      .select(`
        id,
        name,
        description,
        status,
        category,
        node_count,
        created_at,
        updated_at
      `)
      .eq('project_id', actualProjectId)
      .order('created_at', { ascending: false })

    if (treesError) {
      console.error('Error fetching experiment trees:', treesError)
      console.error('Project ID:', projectId)
      return NextResponse.json({ 
        error: 'Failed to fetch experiment trees',
        details: treesError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ trees })
  } catch (error) {
    console.error('Error in GET /api/projects/[projectId]/trees:', error)
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
    const { name, description, category, status } = body

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
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    // Check project permissions - only members can create trees
    const permissions = await checkProjectPermission(projectId, user.id)
    
    if (!permissions.canEdit) {
      return NextResponse.json(
        { message: 'You do not have permission to create experiment trees in this project' },
        { status: 403 }
      )
    }

    // First, try to find the project by slug or UUID
    let actualProjectId = projectId
    
    // Check if projectId is a slug (not a UUID format)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    
    if (!isUUID) {
      // It's a slug, find the actual project ID
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

    // Create the experiment tree
    const { data: newTree, error: treeError } = await supabase
      .from('experiment_trees')
      .insert({
        project_id: actualProjectId,
        name,
        description,
        category,
        status: status || 'draft',
        node_count: 0
        // TODO: Add created_by when implementing proper auth
      })
      .select()
      .single()

    if (treeError) {
      console.error('Error creating experiment tree:', treeError)
      console.error('Project ID:', projectId)
      console.error('Tree data:', { name, description, category, status })
      return NextResponse.json({ 
        error: 'Failed to create experiment tree',
        details: treeError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ tree: newTree })
  } catch (error) {
    console.error('Error in POST /api/projects/[projectId]/trees:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}