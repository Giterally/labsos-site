import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../../lib/supabase-client';
import { generateEmbedding, findSimilarEmbeddings } from '../../../../../lib/ai/embeddings';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10');
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');

    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }

    // Verify user has access to project
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Get all chunks with embeddings for this project
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, text, embedding, source_type, metadata')
      .eq('project_id', projectId)
      .not('embedding', 'is', null);

    if (chunksError) {
      console.error('Error fetching chunks:', chunksError);
      return NextResponse.json({ 
        error: 'Failed to fetch chunks' 
      }, { status: 500 });
    }

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({
        matches: [],
        total: 0,
        query,
      });
    }

    // Find similar chunks
    const similarChunks = findSimilarEmbeddings(
      queryEmbedding.embedding,
      chunks.map(c => ({ id: c.id, embedding: c.embedding })),
      limit,
      threshold
    );

    // Get detailed chunk information for matches
    const chunkMatches = similarChunks.map(match => {
      const chunk = chunks.find(c => c.id === match.id);
      return {
        type: 'chunk',
        id: chunk?.id,
        score: match.similarity,
        text: chunk?.text,
        sourceType: chunk?.source_type,
        metadata: chunk?.metadata,
        snippet: getSnippet(chunk?.text || '', query),
      };
    });

    // Also search in proposed nodes
    const { data: proposedNodes, error: nodesError } = await supabase
      .from('proposed_nodes')
      .select('id, node_json, confidence, status')
      .eq('project_id', projectId)
      .eq('status', 'proposed');

    if (!nodesError && proposedNodes) {
      const nodeMatches = proposedNodes
        .filter(node => {
          const searchText = [
            node.node_json.title,
            node.node_json.short_summary,
            node.node_json.content?.text,
          ].join(' ').toLowerCase();
          
          return searchText.includes(query.toLowerCase());
        })
        .map(node => ({
          type: 'node',
          id: node.id,
          score: node.confidence,
          title: node.node_json.title,
          summary: node.node_json.short_summary,
          nodeType: node.node_json.metadata?.node_type,
          confidence: node.confidence,
          status: node.status,
          snippet: getSnippet(node.node_json.content?.text || '', query),
        }))
        .slice(0, limit);

      // Combine and sort all matches
      const allMatches = [...chunkMatches, ...nodeMatches]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return NextResponse.json({
        matches: allMatches,
        total: allMatches.length,
        query,
        breakdown: {
          chunks: chunkMatches.length,
          nodes: nodeMatches.length,
        },
      });
    }

    return NextResponse.json({
      matches: chunkMatches,
      total: chunkMatches.length,
      query,
      breakdown: {
        chunks: chunkMatches.length,
        nodes: 0,
      },
    });

  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

function getSnippet(text: string, query: string, maxLength: number = 200): string {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  const index = textLower.indexOf(queryLower);
  
  if (index === -1) {
    // Query not found, return beginning of text
    return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
  }
  
  // Find a good snippet around the query
  const start = Math.max(0, index - maxLength / 2);
  const end = Math.min(text.length, start + maxLength);
  
  let snippet = text.substring(start, end);
  
  if (start > 0) {
    snippet = '...' + snippet;
  }
  
  if (end < text.length) {
    snippet = snippet + '...';
  }
  
  return snippet;
}
