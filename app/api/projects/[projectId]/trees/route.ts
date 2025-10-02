import { NextResponse } from 'next/server'
import { createExperimentTree } from '@/lib/database-service'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Create a Supabase client with service role key for server-side operations
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    
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

    const { name, description, status, category } = await request.json()

    const newTree = await createExperimentTree({
      project_id: projectId,
      name,
      description,
      status,
      category,
      created_by: user.id,
    })

    return NextResponse.json({ tree: newTree }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating experiment tree:', error)
    return NextResponse.json(
      { message: 'Failed to create experiment tree', error: error.message },
      { status: 500 }
    )
  }
}
