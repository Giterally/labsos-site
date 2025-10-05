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

    // Get outputs associated with this project
    const { data: projectOutputs, error: projectOutputsError } = await supabase
      .from('project_outputs')
      .select(`
        output:output_id (
          id,
          type,
          title,
          description,
          authors,
          status,
          date,
          url,
          doi,
          journal
        )
      `)
      .eq('project_id', actualProjectId)

    if (projectOutputsError) {
      console.error('Error fetching project outputs:', projectOutputsError)
      return NextResponse.json({ error: 'Failed to fetch outputs' }, { status: 500 })
    }

    const outputs = projectOutputs?.map(item => item.output).filter(Boolean) || []

    return NextResponse.json({ outputs })
  } catch (error) {
    console.error('Error in GET /api/projects/[projectId]/outputs:', error)
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

    // Create the output entry
    const { data: output, error: outputError } = await supabase
      .from('outputs')
      .insert({
        type: type || 'publication',
        title: title.trim(),
        description: description?.trim() || null,
        authors: authors || [],
        status: status || 'draft',
        date: date || null,
        url: url?.trim() || null,
        doi: doi?.trim() || null,
        journal: journal?.trim() || null,
        created_by: null // No authentication for now
      })
      .select()
      .single()

    if (outputError) {
      console.error('Error creating output:', outputError)
      return NextResponse.json({ 
        error: 'Failed to create output',
        details: outputError.message 
      }, { status: 500 })
    }

    // Link output to project
    const { error: linkError } = await supabase
      .from('project_outputs')
      .insert({
        project_id: actualProjectId,
        output_id: output.id
      })

    if (linkError) {
      console.error('Error linking output to project:', linkError)
      // Clean up the output entry
      await supabase.from('outputs').delete().eq('id', output.id)
      return NextResponse.json({ 
        error: 'Failed to link output to project',
        details: linkError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ output })
  } catch (error) {
    console.error('Error in POST /api/projects/[projectId]/outputs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}