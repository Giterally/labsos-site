import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';

export const dynamic = 'force-dynamic';

// POST /api/todos/[id]/assign
// Body: { user_id: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const { user_id } = await request.json();

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    // Check if already assigned
    const { data: existing } = await supabase
      .from('todo_assignments')
      .select('id')
      .eq('todo_id', id)
      .eq('user_id', user_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'User already assigned to this todo' },
        { status: 400 }
      );
    }

    // Create assignment
    const { data: assignment, error } = await supabase
      .from('todo_assignments')
      .insert({
        todo_id: id,
        user_id,
        assigned_by: user.id,
      })
      .select(`
        *,
        user_profile:profiles!todo_assignments_user_id_fkey(id, full_name, avatar_url)
      `)
      .single();

    if (error) {
      console.error('Error creating assignment:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/todos/[id]/assign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

