import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; treeId: string }> }
) {
  try {
    const { projectId, treeId } = await params
    
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
    const { name, description, status, category } = body

    // Update the experiment tree
    const { data: tree, error } = await supabase
      .from('experiment_trees')
      .update({
        name,
        description,
        status,
        category,
        updated_at: new Date().toISOString()
      })
      .eq('id', treeId)
      .eq('project_id', projectId)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Experiment tree not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to update experiment tree: ${error.message}`)
    }

    return NextResponse.json({ tree })
  } catch (error: any) {
    console.error('Error updating experiment tree:', error)
    return NextResponse.json(
      { message: 'Failed to update experiment tree', error: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; treeId: string }> }
) {
  try {
    const { projectId, treeId } = await params
    
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

    // Delete the experiment tree (this will cascade delete nodes)
    const { error } = await supabase
      .from('experiment_trees')
      .delete()
      .eq('id', treeId)
      .eq('project_id', projectId)
      .eq('created_by', user.id)

    if (error) {
      throw new Error(`Failed to delete experiment tree: ${error.message}`)
    }

    return NextResponse.json({ message: 'Experiment tree deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting experiment tree:', error)
    return NextResponse.json(
      { message: 'Failed to delete experiment tree', error: error.message },
      { status: 500 }
    )
  }
}
