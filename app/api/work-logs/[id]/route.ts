import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { UpdateWorkLogRequest } from '@/types/activity-tracker';

export const dynamic = 'force-dynamic';

// GET /api/work-logs/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase } = auth;

    const { data: workLog, error } = await supabase
      .from('work_logs')
      .select(`
        *,
        user_profile:profiles!work_logs_user_id_fkey(id, full_name, avatar_url),
        project:projects(id, name),
        todo:todos(id, title),
        tree_node:tree_nodes(id, name)
      `)
      .eq('id', id)
      .single();

    if (error || !workLog) {
      return NextResponse.json(
        { error: 'Work log not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({ workLog });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/work-logs/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/work-logs/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    // First check if work log exists and user is the creator
    const { data: existingLog, error: fetchError } = await supabase
      .from('work_logs')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingLog) {
      return NextResponse.json(
        { error: 'Work log not found' },
        { status: 404 }
      );
    }

    // Check ownership - only creator can update
    if (existingLog.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only edit your own work logs' },
        { status: 403 }
      );
    }

    const body: UpdateWorkLogRequest = await request.json();

    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.log_date !== undefined) updates.log_date = body.log_date;
    if (body.todo_id !== undefined) updates.todo_id = body.todo_id;
    if (body.tree_node_id !== undefined) updates.tree_node_id = body.tree_node_id;
    if (body.is_meeting_note !== undefined) updates.is_meeting_note = body.is_meeting_note;
    if (body.tags !== undefined) updates.tags = body.tags;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: workLog, error } = await supabase
      .from('work_logs')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        user_profile:profiles!work_logs_user_id_fkey(id, full_name, avatar_url),
        project:projects(id, name),
        todo:todos(id, title),
        tree_node:tree_nodes(id, name)
      `)
      .single();

    if (error) {
      console.error('Error updating work log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!workLog) {
      return NextResponse.json(
        { error: 'Work log not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({ workLog });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in PATCH /api/work-logs/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/work-logs/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    // First check if work log exists and user is the creator
    const { data: existingLog, error: fetchError } = await supabase
      .from('work_logs')
      .select('user_id, project_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingLog) {
      return NextResponse.json(
        { error: 'Work log not found' },
        { status: 404 }
      );
    }

    // Check ownership - only creator can delete (RLS also enforces this)
    if (existingLog.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only delete your own work logs' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('work_logs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting work log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Work log deleted successfully' });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in DELETE /api/work-logs/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

