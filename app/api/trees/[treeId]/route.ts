import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkTreePermission } from '@/lib/permission-utils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params

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

    // Check tree permissions
    const permissions = await checkTreePermission(treeId, userId)
    
    if (!permissions.canView) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Get the experiment tree information
    const { data, error: treeError } = await supabase
      .from('experiment_trees')
      .select('id, name, description, status, category, node_count, created_at, updated_at')
      .eq('id', treeId)
      .single()

    if (treeError) {
      console.error('Error fetching experiment tree:', treeError)
      return NextResponse.json({ error: 'Failed to fetch experiment tree' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Experiment tree not found' }, { status: 404 })
    }

    return NextResponse.json({ tree: data })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params
    const body = await request.json()
    const { name, description, category } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

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

    // Check tree permissions - only members can edit trees
    const permissions = await checkTreePermission(treeId, user.id)
    
    if (!permissions.canEdit) {
      return NextResponse.json(
        { message: 'You do not have permission to edit this experiment tree' },
        { status: 403 }
      )
    }

    // Update the experiment tree
    const { data, error: treeError } = await supabase
      .from('experiment_trees')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        category: category || 'protocol',
        updated_at: new Date().toISOString()
      })
      .eq('id', treeId)
      .select()
      .single()

    if (treeError) {
      console.error('Error updating experiment tree:', treeError)
      return NextResponse.json({ 
        error: 'Failed to update experiment tree',
        details: treeError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ tree: data })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params

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

    // Check tree permissions - only members can delete trees
    const permissions = await checkTreePermission(treeId, user.id)
    
    if (!permissions.canEdit) {
      return NextResponse.json(
        { message: 'You do not have permission to delete this experiment tree' },
        { status: 403 }
      )
    }

    // Delete the experiment tree (this will cascade delete all related nodes, content, attachments, and links)
    const { error: treeError } = await supabase
      .from('experiment_trees')
      .delete()
      .eq('id', treeId)

    if (treeError) {
      console.error('Error deleting experiment tree:', treeError)
      return NextResponse.json({ error: 'Failed to delete experiment tree' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
