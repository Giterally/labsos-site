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

    // Get links for the node
    const { data: links, error: linksError } = await supabase
      .from('node_links')
      .select('*')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: true })

    if (linksError) {
      console.error('Error fetching links:', linksError)
      return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 })
    }

    return NextResponse.json({ links })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/nodes/[nodeId]/links:', error)
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
    const { name, url, description, link_type } = body

    // For now, use the anon client without authentication
    // TODO: Implement proper project ownership and member system
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Create the link
    const { data: newLink, error: linkError } = await supabase
      .from('node_links')
      .insert({
        node_id: nodeId,
        name,
        url,
        description,
        link_type: link_type || 'external'
      })
      .select()
      .single()

    if (linkError) {
      console.error('Error creating link:', linkError)
      return NextResponse.json({ error: 'Failed to create link' }, { status: 500 })
    }

    return NextResponse.json({ link: newLink })
  } catch (error) {
    console.error('Error in POST /api/trees/[treeId]/nodes/[nodeId]/links:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
