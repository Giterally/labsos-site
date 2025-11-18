import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';

export const dynamic = 'force-dynamic';

// POST /api/todos/[id]/assign-project
// Body: { project_id: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const { project_id } = await request.json();

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Verify user is a member of the project
    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', project_id)
      .eq('user_id', user.id)
      .is('left_at', null)
      .single();

    if (!projectMember) {
      return NextResponse.json(
        { error: 'You must be a member of the project to assign tasks to it' },
        { status: 403 }
      );
    }

    // Check if already assigned
    const { data: existing } = await supabase
      .from('todo_project_assignments')
      .select('id')
      .eq('todo_id', id)
      .eq('project_id', project_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Project already assigned to this todo' },
        { status: 400 }
      );
    }

    // Create project assignment (trigger will sync user assignments)
    const { data: assignment, error } = await supabase
      .from('todo_project_assignments')
      .insert({
        todo_id: id,
        project_id,
        assigned_by: user.id,
      })
      .select(`
        *,
        project:projects(id, name)
      `)
      .single();

    if (error) {
      console.error('Error creating project assignment:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/todos/[id]/assign-project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

