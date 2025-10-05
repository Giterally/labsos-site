import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function PUT(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string; attachmentId: string } }
) {
  try {
    const { attachmentId } = params
    const body = await request.json()
    const { name, file_type, file_size, file_url, description } = body

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Update the attachment
    const { data: updatedAttachment, error: attachmentError } = await supabase
      .from('node_attachments')
      .update({
        name,
        file_type,
        file_size,
        file_url,
        description,
        updated_at: new Date().toISOString()
      })
      .eq('id', attachmentId)
      .select()
      .single()

    if (attachmentError) {
      console.error('Error updating attachment:', attachmentError)
      return NextResponse.json({ error: 'Failed to update attachment' }, { status: 500 })
    }

    return NextResponse.json({ attachment: updatedAttachment })
  } catch (error) {
    console.error('Error in PUT /api/trees/[treeId]/nodes/[nodeId]/attachments/[attachmentId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string; attachmentId: string } }
) {
  try {
    const { attachmentId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Delete the attachment
    const { error: attachmentError } = await supabase
      .from('node_attachments')
      .delete()
      .eq('id', attachmentId)

    if (attachmentError) {
      console.error('Error deleting attachment:', attachmentError)
      return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/trees/[treeId]/nodes/[nodeId]/attachments/[attachmentId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
