import { NextResponse } from 'next/server'
import { createExperimentTree } from '@/lib/database-service'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { message: 'User not authenticated' },
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
