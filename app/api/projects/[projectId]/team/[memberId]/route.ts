import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  try {
    const { projectId, memberId } = await params

    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)

    // Check if projectId is a UUID or slug
    let actualProjectId = projectId
    if (!projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug, get the actual UUID
      const { data: project, error: projectError } = await auth.supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single()

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      actualProjectId = project.id
    }

    // Check project access and permissions
    const access = await permissions.checkProjectAccess(actualProjectId)
    if (!access.hasAccess) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    if (!access.canManageMembers) {
      return NextResponse.json(
        { message: 'Only project owners and admins can remove team members' },
        { status: 403 }
      )
    }

    // Remove the team member by setting left_at timestamp
    const { error: removeError } = await auth.supabase
      .from('project_members')
      .update({
        left_at: new Date().toISOString()
      })
      .eq('id', memberId)
      .eq('project_id', actualProjectId)

    if (removeError) {
      console.error('Error removing team member:', removeError)
      return NextResponse.json({ 
        error: 'Failed to remove team member',
        details: removeError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in DELETE /api/projects/[projectId]/team/[memberId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
