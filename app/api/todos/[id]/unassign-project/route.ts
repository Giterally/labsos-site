import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';

export const dynamic = 'force-dynamic';

// POST /api/todos/[id]/unassign-project
// Body: { project_id: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase } = auth;

    const { project_id } = await request.json();

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('todo_project_assignments')
      .delete()
      .eq('todo_id', id)
      .eq('project_id', project_id);

    if (error) {
      console.error('Error removing project assignment:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Project assignment removed successfully' });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/todos/[id]/unassign-project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

