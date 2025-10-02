import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(
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

    const { data: tree, error } = await supabase
      .from('experiment_trees')
      .select('*')
      .eq('id', treeId)
      .eq('project_id', projectId)
      .eq('created_by', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Experiment tree not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to fetch experiment tree: ${error.message}`)
    }

    return NextResponse.json({ tree })
  } catch (error: any) {
    console.error('Error fetching experiment tree:', error)
    return NextResponse.json(
      { message: 'Failed to fetch experiment tree', error: error.message },
      { status: 500 }
    )
  }
}
