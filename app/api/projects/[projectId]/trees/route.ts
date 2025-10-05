import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
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

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
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