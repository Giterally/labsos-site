import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function PUT(
  request: NextRequest,
  { params }: { params: { outputId: string } }
) {
  try {
    const { outputId } = params
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

    // Update the output entry
    const { data, error: outputError } = await supabase
      .from('outputs')
      .update({
        type: type || 'publication',
        title: title.trim(),
        description: description?.trim() || null,
        authors: authors || [],
        status: status || 'draft',
        date: date || null,
        url: url?.trim() || null,
        doi: doi?.trim() || null,
        journal: journal?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', outputId)
      .select()
      .single()

    if (outputError) {
      console.error('Error updating output:', outputError)
      return NextResponse.json({ 
        error: 'Failed to update output',
        details: outputError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ output: data })
  } catch (error) {
    console.error('Error in PUT /api/outputs/[outputId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { outputId: string } }
) {
  try {
    const { outputId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Delete the output entry (this will cascade delete project_outputs links)
    const { error: outputError } = await supabase
      .from('outputs')
      .delete()
      .eq('id', outputId)

    if (outputError) {
      console.error('Error deleting output:', outputError)
      return NextResponse.json({ error: 'Failed to delete output' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/outputs/[outputId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
