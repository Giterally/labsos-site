import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function POST(request: Request) {
  try {
    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)

    const body = await request.json()
    
    // Check project access if project_id is provided
    if (body.project_id) {
      const access = await permissions.checkProjectAccess(body.project_id)
      if (!access.canWrite) {
        return NextResponse.json(
          { message: 'You do not have permission to add outputs to this project' },
          { status: 403 }
        )
      }
    }
    
    const { data: output, error } = await auth.supabase
      .from('outputs')
      .insert([{
        ...body,
        created_by: auth.user.id
      }])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create output: ${error.message}`)
    }

    return NextResponse.json({ output }, { status: 201 })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error creating output:', error)
    return NextResponse.json(
      { message: 'Failed to create output', error: error.message },
      { status: 500 }
    )
  }
}
