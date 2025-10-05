import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string } }
) {
  try {
    const { nodeId } = params

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Get attachments for the node
    const { data: attachments, error: attachmentsError } = await supabase
      .from('node_attachments')
      .select('*')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: true })

    if (attachmentsError) {
      console.error('Error fetching attachments:', attachmentsError)
      return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 })
    }

    return NextResponse.json({ attachments })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/nodes/[nodeId]/attachments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { treeId: string; nodeId: string } }
) {
  try {
    const { nodeId } = params
    const body = await request.json()
    const { name, file_type, file_size, file_url, description } = body

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Create the attachment
    const { data: newAttachment, error: attachmentError } = await supabase
      .from('node_attachments')
      .insert({
        node_id: nodeId,
        name,
        file_type,
        file_size,
        file_url,
        description
      })
      .select()
      .single()

    if (attachmentError) {
      console.error('Error creating attachment:', attachmentError)
      return NextResponse.json({ error: 'Failed to create attachment' }, { status: 500 })
    }

    return NextResponse.json({ attachment: newAttachment })
  } catch (error) {
    console.error('Error in POST /api/trees/[treeId]/nodes/[nodeId]/attachments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
