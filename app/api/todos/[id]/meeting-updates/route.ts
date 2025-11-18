import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// GET /api/todos/[id]/meeting-updates
// Get all meeting updates for a recurring meeting todo
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase } = auth;

    // Verify todo exists and is a recurring meeting
    const { data: todo, error: todoError } = await supabase
      .from('todos')
      .select('id, is_recurring_meeting')
      .eq('id', id)
      .single();

    if (todoError || !todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    if (!todo.is_recurring_meeting) {
      return NextResponse.json({ error: 'This todo is not a recurring meeting' }, { status: 400 });
    }

    // Get all meeting updates ordered by creation date
    const { data: updates, error } = await supabase
      .from('todo_meeting_updates')
      .select(`
        *,
        created_by_profile:profiles!todo_meeting_updates_created_by_fkey(
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('todo_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching meeting updates:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ updates: updates || [] });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/todos/[id]/meeting-updates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/todos/[id]/meeting-updates
// Create a new meeting update
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const { content } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Verify todo exists, is a recurring meeting, and user has access
    const { data: todo, error: todoError } = await supabase
      .from('todos')
      .select(`
        id,
        is_recurring_meeting,
        list_id,
        todo_list:todo_lists!inner(
          list_type,
          project_id
        )
      `)
      .eq('id', id)
      .single();

    if (todoError || !todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    if (!todo.is_recurring_meeting) {
      return NextResponse.json({ error: 'This todo is not a recurring meeting' }, { status: 400 });
    }

    // Check if user has access (member of shared task or assigned to task)
    const { data: assignment } = await supabase
      .from('todo_assignments')
      .select('id')
      .eq('todo_id', id)
      .eq('user_id', user.id)
      .single();

    // Check project access via todo_list project_id
    let hasProjectAccess = false;
    if (todo.todo_list?.project_id) {
      const { data: projectMember } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', todo.todo_list.project_id)
        .eq('user_id', user.id)
        .is('left_at', null)
        .single();
      hasProjectAccess = !!projectMember;
    }

    // Check project access via todo_project_assignments
    if (!hasProjectAccess) {
      const { data: projectAssignments } = await supabase
        .from('todo_project_assignments')
        .select('project_id')
        .eq('todo_id', id);

      if (projectAssignments && projectAssignments.length > 0) {
        const projectIds = projectAssignments.map(pa => pa.project_id);
        const { data: projectMember } = await supabase
          .from('project_members')
          .select('id')
          .in('project_id', projectIds)
          .eq('user_id', user.id)
          .is('left_at', null)
          .single();
        hasProjectAccess = !!projectMember;
      }
    }

    // For shared tasks, allow if user is assigned or is a project member
    // For personal tasks, only allow if assigned
    const hasAccess = todo.todo_list?.list_type === 'shared' 
      ? (!!assignment || hasProjectAccess)
      : !!assignment;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied. You must be assigned to this task or be a member of the project.' }, { status: 403 });
    }

    // Create the meeting update
    const { data: update, error } = await supabase
      .from('todo_meeting_updates')
      .insert({
        todo_id: id,
        content: content.trim(),
        created_by: user.id,
      })
      .select(`
        *,
        created_by_profile:profiles!todo_meeting_updates_created_by_fkey(
          id,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      console.error('Error creating meeting update:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ update }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/todos/[id]/meeting-updates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

