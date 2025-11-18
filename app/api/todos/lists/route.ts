import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { CreateTodoListRequest } from '@/types/activity-tracker';

export const dynamic = 'force-dynamic';

// GET /api/todos/lists
// Query params: listType, projectId
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const listType = searchParams.get('listType');
    const projectId = searchParams.get('projectId');

    let query = supabase
      .from('todo_lists')
      .select('*')
      .order('created_at', { ascending: false });

    if (listType) {
      query = query.eq('list_type', listType);
    }

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data: lists, error } = await query;

    if (error) {
      console.error('Error fetching todo lists:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lists });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/todos/lists:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/todos/lists
export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const { supabase, user } = auth;

    const body: CreateTodoListRequest = await request.json();

    if (!body.title || !body.list_type) {
      return NextResponse.json(
        { error: 'title and list_type are required' },
        { status: 400 }
      );
    }

    if (body.list_type === 'shared' && !body.project_id) {
      return NextResponse.json(
        { error: 'project_id is required for shared lists' },
        { status: 400 }
      );
    }

    const insertData: any = {
      title: body.title,
      description: body.description || null,
      list_type: body.list_type,
    };

    if (body.list_type === 'personal') {
      insertData.user_id = user.id;
    } else {
      insertData.project_id = body.project_id;
    }

    const { data: list, error } = await supabase
      .from('todo_lists')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating todo list:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ list }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/todos/lists:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

