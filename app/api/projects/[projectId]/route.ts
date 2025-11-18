import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    // Resolve project by id or slug using service client
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    const { data: project, error: projErr } = await supabaseServer
      .from('projects')
      .select('id,name,description,institution,department,status,created_by,created_at,slug,visibility')
      [isUUID ? 'eq' : 'eq'](isUUID ? 'id' : 'slug', projectId)
      .single()

    if (projErr || !project) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 })
    }

    // If public, allow unauthenticated access and return safe fields
    if (project.visibility === 'public') {
      return NextResponse.json({ project })
    }

    // If private or stealth, require auth and membership (stealth projects are never discoverable)
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { message: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext
    const permissionService = new PermissionService(supabase, user.id)
    const permissions = await permissionService.checkProjectAccess(project.id)
    if (!permissions.canRead) {
      return NextResponse.json(
        { message: 'Access denied. This project is private.' },
        { status: 403 }
      )
    }

    // Return full project (safe enough as previously done)
    return NextResponse.json({ project })
  } catch (error: any) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { message: 'Failed to fetch project', error: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    
    // Authenticate the request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { message: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    const body = await request.json()
    const { name, description, institution, department, status, visibility } = body

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check user permissions for this project
    const permissions = await permissionService.checkProjectAccess(projectId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to update this project' },
        { status: 403 }
      )
    }

    // Update the project
    const { data: updatedProject, error } = await supabase
      .from('projects')
      .update({
        name,
        description,
        institution,
        department,
        status,
        visibility,
      })
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Project not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to update project: ${error.message}`)
    }

    return NextResponse.json({ project: updatedProject })
  } catch (error: any) {
    console.error('Error updating project:', error)
    return NextResponse.json(
      { message: 'Failed to update project', error: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    
    // Authenticate the request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { message: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check user permissions for this project - only owners can delete
    const permissions = await permissionService.checkProjectAccess(projectId)
    
    if (!permissions.isOwner) {
      return NextResponse.json(
        { message: 'Only project owners can delete projects' },
        { status: 403 }
      )
    }

    // Get the actual project ID (in case projectId is a slug)
    const actualProjectId = permissions.projectId || projectId

    // Delete the project (hard delete - CASCADE will handle related data)
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', actualProjectId)

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Project not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to delete project: ${error.message}`)
    }

    return NextResponse.json({ message: 'Project deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting project:', error)
    return NextResponse.json(
      { message: 'Failed to delete project', error: error.message },
      { status: 500 }
    )
  }
}
