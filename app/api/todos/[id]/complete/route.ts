import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';

export const dynamic = 'force-dynamic';

// POST /api/todos/[id]/complete
// Toggles completion status
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase } = auth;

    // Get current todo
    const { data: currentTodo, error: fetchError } = await supabase
      .from('todos')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !currentTodo) {
      return NextResponse.json(
        { error: 'Todo not found or access denied' },
        { status: 404 }
      );
    }

    // Toggle completion
    const newStatus = currentTodo.status === 'completed' ? 'not_started' : 'completed';

    const { data: todo, error } = await supabase
      .from('todos')
      .update({ status: newStatus })
      .eq('id', id)
      .select(`
        *,
        todo_list:todo_lists(*),
        assignees:todo_assignments(
          user_id,
          user_profile:profiles!todo_assignments_user_id_fkey(id, full_name, avatar_url)
        ),
        project_assignments:todo_project_assignments(
          project_id,
          project:projects(id, name)
        ),
        created_by_profile:profiles!todos_created_by_fkey(id, full_name, avatar_url),
        completed_by_profile:profiles!todos_completed_by_fkey(id, full_name, avatar_url),
        tree_node:tree_nodes(id, name)
      `)
      .single();

    if (error) {
      console.error('Error toggling todo completion:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ todo });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/todos/[id]/complete:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

