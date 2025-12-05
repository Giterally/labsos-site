import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { UpdateTodoRequest, TodoWithRelations, CreateTodoRequest } from '@/types/activity-tracker';

export const dynamic = 'force-dynamic';

// GET /api/todos/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase } = auth;

    const { data: todo, error } = await supabase
      .from('todos')
      .select(`
        *,
        todo_list:todo_lists(*),
        assignees:todo_assignments(
          user_id,
          assigned_at,
          assigned_by,
          user_profile:profiles!todo_assignments_user_id_fkey(id, full_name, avatar_url)
        ),
        project_assignments:todo_project_assignments(
          project_id,
          project:projects(id, name)
        ),
        created_by_profile:profiles!todos_created_by_fkey(id, full_name, avatar_url),
        completed_by_profile:profiles!todos_completed_by_fkey(id, full_name, avatar_url),
        tree_node:tree_nodes(id, name),
        comments:todo_comments(
          id,
          content,
          created_at,
          user_id,
          user_profile:profiles!todo_comments_user_id_fkey(id, full_name, avatar_url)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !todo) {
      return NextResponse.json(
        { error: 'Todo not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({ todo });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/todos/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/todos/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const body: UpdateTodoRequest & { project_ids?: string[]; assignee_ids?: string[] } = await request.json();

    // Build update object (only include provided fields)
    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.tree_node_id !== undefined) updates.tree_node_id = body.tree_node_id;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.position !== undefined) updates.position = body.position;
    if (body.is_recurring_meeting !== undefined) updates.is_recurring_meeting = body.is_recurring_meeting;
    if (body.linked_project_id !== undefined) updates.linked_project_id = body.linked_project_id; // For personal task project tracking

    // Handle project assignments if provided
    if (body.project_ids !== undefined) {
      // Get current project assignments
      const { data: currentProjectAssignments } = await supabase
        .from('todo_project_assignments')
        .select('project_id')
        .eq('todo_id', id);

      const currentProjectIds = (currentProjectAssignments || []).map(pa => pa.project_id);
      const newProjectIds = body.project_ids || [];

      // Remove project assignments that are no longer selected
      const toRemove = currentProjectIds.filter(id => !newProjectIds.includes(id));
      if (toRemove.length > 0) {
        await supabase
          .from('todo_project_assignments')
          .delete()
          .eq('todo_id', id)
          .in('project_id', toRemove);
      }

      // Add new project assignments
      const toAdd = newProjectIds.filter(id => !currentProjectIds.includes(id));
      if (toAdd.length > 0) {
        const projectAssignments = toAdd.map(project_id => ({
          todo_id: id,
          project_id,
          assigned_by: user.id,
        }));

        await supabase
          .from('todo_project_assignments')
          .insert(projectAssignments);
      }
    }

    // Handle individual user assignments if provided
    if (body.assignee_ids !== undefined) {
      // Get current assignments
      const { data: currentAssignments } = await supabase
        .from('todo_assignments')
        .select('user_id')
        .eq('todo_id', id);

      const currentUserIds = (currentAssignments || []).map(a => a.user_id);
      const newUserIds = body.assignee_ids || [];

      // Remove assignments that are no longer selected
      const toRemove = currentUserIds.filter(id => !newUserIds.includes(id));
      if (toRemove.length > 0) {
        await supabase
          .from('todo_assignments')
          .delete()
          .eq('todo_id', id)
          .in('user_id', toRemove);
      }

      // Add new assignments
      const toAdd = newUserIds.filter(id => !currentUserIds.includes(id));
      if (toAdd.length > 0) {
        const assignments = toAdd.map(user_id => ({
          todo_id: id,
          user_id,
          assigned_by: user.id,
        }));

        await supabase
          .from('todo_assignments')
          .insert(assignments);
      }
    }

    if (Object.keys(updates).length === 0 && body.project_ids === undefined && body.assignee_ids === undefined) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Update todo if there are field changes
    let todo;
    if (Object.keys(updates).length > 0) {
      const { data: updatedTodo, error } = await supabase
        .from('todos')
        .update(updates)
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
        console.error('Error updating todo:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      todo = updatedTodo;
    } else {
      // Just fetch the todo with relations
      const { data: fetchedTodo, error } = await supabase
        .from('todos')
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
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching todo:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      todo = fetchedTodo;
    }

    if (!todo) {
      return NextResponse.json(
        { error: 'Todo not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({ todo });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in PATCH /api/todos/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/todos/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase } = auth;

    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting todo:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Todo deleted successfully' });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in DELETE /api/todos/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

