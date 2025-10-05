import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function PUT(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string; linkId: string } }
) {
  try {
    const { linkId } = params
    const body = await request.json()
    const { name, url, description, link_type } = body

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Update the link
    const { data: updatedLink, error: linkError } = await supabase
      .from('node_links')
      .update({
        name,
        url,
        description,
        link_type,
        updated_at: new Date().toISOString()
      })
      .eq('id', linkId)
      .select()
      .single()

    if (linkError) {
      console.error('Error updating link:', linkError)
      return NextResponse.json({ error: 'Failed to update link' }, { status: 500 })
    }

    return NextResponse.json({ link: updatedLink })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/nodes/[nodeId]/links/[linkId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string; linkId: string } }
) {
  try {
    const { linkId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Delete the link
    const { error: linkError } = await supabase
      .from('node_links')
      .delete()
      .eq('id', linkId)

    if (linkError) {
      console.error('Error deleting link:', linkError)
      return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]/nodes/[nodeId]/links/[linkId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
