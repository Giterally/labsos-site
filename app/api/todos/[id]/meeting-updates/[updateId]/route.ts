import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';

export const dynamic = 'force-dynamic';

// PATCH /api/todos/[id]/meeting-updates/[updateId]
// Update a meeting update
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; updateId: string }> }
) {
  try {
    const { id, updateId } = await params;
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const { content } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Get the update and verify access
    const { data: update, error: fetchError } = await supabase
      .from('todo_meeting_updates')
      .select(`
        *,
        todo:todos!inner(
          id,
          is_recurring_meeting,
          list_id,
          todo_list:todo_lists!inner(
            list_type,
            project_id
          )
        )
      `)
      .eq('id', updateId)
      .eq('todo_id', id)
      .single();

    if (fetchError || !update) {
      return NextResponse.json({ error: 'Meeting update not found' }, { status: 404 });
    }

    // Check if user can edit (created by user or member of shared task)
    const isCreator = update.created_by === user.id;
    
    let isMember = false;
    if (update.todo.todo_list?.list_type === 'shared') {
      const { data: assignment } = await supabase
        .from('todo_assignments')
        .select('id')
        .eq('todo_id', id)
        .eq('user_id', user.id)
        .single();
      
      let hasProjectAccess = false;
      if (update.todo.todo_list?.project_id) {
        const { data: projectMember } = await supabase
          .from('project_members')
          .select('id')
          .eq('project_id', update.todo.todo_list.project_id)
          .eq('user_id', user.id)
          .is('left_at', null)
          .single();
        hasProjectAccess = !!projectMember;
      }
      
      isMember = !!assignment || hasProjectAccess;
    }

    if (!isCreator && !isMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update the meeting update
    const { data: updated, error } = await supabase
      .from('todo_meeting_updates')
      .update({
        content: content.trim(),
      })
      .eq('id', updateId)
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
      console.error('Error updating meeting update:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ update: updated });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in PATCH /api/todos/[id]/meeting-updates/[updateId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/todos/[id]/meeting-updates/[updateId]
// Delete a meeting update
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; updateId: string }> }
) {
  try {
    const { id, updateId } = await params;
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    // Get the update and verify access
    const { data: update, error: fetchError } = await supabase
      .from('todo_meeting_updates')
      .select(`
        *,
        todo:todos!inner(
          id,
          list_id,
          todo_list:todo_lists!inner(
            list_type
          )
        )
      `)
      .eq('id', updateId)
      .eq('todo_id', id)
      .single();

    if (fetchError || !update) {
      return NextResponse.json({ error: 'Meeting update not found' }, { status: 404 });
    }

    // Check if user can delete (created by user or member of shared task)
    const isCreator = update.created_by === user.id;
    
    let isMember = false;
    if (update.todo.todo_list?.list_type === 'shared') {
      const { data: assignment } = await supabase
        .from('todo_assignments')
        .select('id')
        .eq('todo_id', id)
        .eq('user_id', user.id)
        .single();
      
      let hasProjectAccess = false;
      if (update.todo.todo_list?.project_id) {
        const { data: projectMember } = await supabase
          .from('project_members')
          .select('id')
          .eq('project_id', update.todo.todo_list.project_id)
          .eq('user_id', user.id)
          .is('left_at', null)
          .single();
        hasProjectAccess = !!projectMember;
      }
      
      isMember = !!assignment || hasProjectAccess;
    }

    if (!isCreator && !isMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete the meeting update
    const { error } = await supabase
      .from('todo_meeting_updates')
      .delete()
      .eq('id', updateId);

    if (error) {
      console.error('Error deleting meeting update:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in DELETE /api/todos/[id]/meeting-updates/[updateId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

