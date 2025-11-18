import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';

export const dynamic = 'force-dynamic';

// POST /api/todos/[id]/unassign
// Body: { user_id: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    const { supabase } = auth;

    const { user_id } = await request.json();

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('todo_assignments')
      .delete()
      .eq('todo_id', id)
      .eq('user_id', user_id);

    if (error) {
      console.error('Error removing assignment:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Assignment removed successfully' });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/todos/[id]/unassign:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

