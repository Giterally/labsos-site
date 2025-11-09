import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';
import { supabaseServer } from '@/lib/supabase-server';
import { generateAnswer } from '@/lib/embeddings';
import { fetchTreeContext, formatTreeContextForLLM } from '@/lib/tree-context';

// Support both GET (backward compatibility) and POST (chat mode)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params;
    return handleAISearch(request, treeId, 'GET');
  } catch (error) {
    console.error('AI search GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params;
    return handleAISearch(request, treeId, 'POST');
  } catch (error) {
    console.error('AI search POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleAISearch(
  request: NextRequest,
  treeId: string,
  method: 'GET' | 'POST'
) {
  try {
    
    // Parse request body or query params
    let query: string;
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    if (method === 'POST') {
      const body = await request.json();
      query = body.query || body.q;
      conversationHistory = body.messages || body.conversationHistory || [];
    } else {
      const { searchParams } = new URL(request.url);
      query = searchParams.get('q') || '';
    }

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: 'Query parameter "q" or "query" is required' },
        { status: 400 }
      );
    }

    // Resolve parent project visibility using server client
    const { data: treeMeta, error: treeMetaErr } = await supabaseServer
      .from('experiment_trees')
      .select('id, project_id')
      .eq('id', treeId)
      .single();

    if (treeMetaErr || !treeMeta) {
      return NextResponse.json({ error: 'Experiment tree not found' }, { status: 404 });
    }

    const { data: proj, error: projErr } = await supabaseServer
      .from('projects')
      .select('visibility')
      .eq('id', treeMeta.project_id)
      .single();

    if (projErr || !proj) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Determine which client to use based on project visibility
    let client: any = supabaseServer;
    if (proj.visibility === 'private') {
      // For private projects, authenticate and check permissions
      let authContext;
      try {
        authContext = await authenticateRequest(request);
      } catch (error) {
        if (error instanceof AuthError) {
          return NextResponse.json(
            { error: error.message },
            { status: error.statusCode }
          );
        }
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const permissions = new PermissionService(authContext.supabase, authContext.user.id);
      const access = await permissions.checkTreeAccess(treeId);
      if (!access.canRead) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      client = authContext.supabase;
    }

    // Fetch complete tree context using appropriate client
    const treeContext = await fetchTreeContext(client, treeId);
    
    if (!treeContext) {
      return NextResponse.json(
        { error: 'Tree not found or access denied' },
        { status: 404 }
      );
    }

    // Generate answer using full tree context
    let answer = null;
    let answerError = null;
    
    try {
      answer = await generateAnswer(query, treeContext, conversationHistory);
    } catch (error) {
      console.error('Error generating answer:', error);
      answerError = error instanceof Error ? error.message : 'Unknown error';
      answer = `Unable to generate answer: ${answerError}. Please check your OpenAI API key and try again.`;
    }

    return NextResponse.json({
      query,
      answer,
      answerGenerated: !!answer,
      answerError,
      tree_name: treeContext.tree.name,
    });
  } catch (error) {
    console.error('AI search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

