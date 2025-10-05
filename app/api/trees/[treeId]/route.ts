import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
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
    const { treeId } = params
    const body = await request.json()
    const { name, description, category } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
    const { treeId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
