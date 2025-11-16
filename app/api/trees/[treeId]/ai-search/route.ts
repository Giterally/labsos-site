import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';
import { supabaseServer } from '@/lib/supabase-server';
import { generateAnswer } from '@/lib/embeddings';
import { fetchTreeContext, fetchTreeContextWithSemanticSearch } from '@/lib/tree-context';
import { requiresFullContext, isSimpleQuery, CONFIG, estimateCost } from '@/lib/query-classification';

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

    // Get node count first to determine strategy
    const { count: nodeCount } = await supabaseServer
      .from('tree_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('tree_id', treeId)

    const totalNodeCount = nodeCount || 0

    // Log query and tree size
    console.log(`[ai-search] Query: "${query.slice(0, 50)}..."`)
    console.log(`[ai-search] Tree size: ${totalNodeCount} nodes`)

    // Smart context detection
    let treeContext: any = null
    let usedSemanticSearch = false
    let contextStrategy: string = 'full'
    let semanticResult: any = null

    // Debug: Check classification results (now async)
    const needsFullContext = await requiresFullContext(query)
    const isSimple = await isSimpleQuery(query)
    console.log(`[ai-search] Classification: requiresFullContext=${needsFullContext}, isSimpleQuery=${isSimple}`)

    // Strategy 1: Small trees - always use full context (cheap and accurate)
    if (totalNodeCount <= CONFIG.SMALL_TREE_THRESHOLD) {
      console.log(`[ai-search] Strategy: FULL CONTEXT (small tree ≤${CONFIG.SMALL_TREE_THRESHOLD} nodes - cheap)`)
      treeContext = await fetchTreeContext(client, treeId)
      contextStrategy = 'full_small_tree'
    }
    // Strategy 2: Accuracy-critical queries - always use full context
    else if (needsFullContext) {
      console.log(`[ai-search] Strategy: FULL CONTEXT (accuracy-critical keywords detected)`)
      treeContext = await fetchTreeContext(client, treeId)
      contextStrategy = 'full_accuracy_critical'
    }
    // Strategy 3: Simple queries - use semantic search (cost optimization)
    else if (isSimple) {
      console.log(`[ai-search] Strategy: SEMANTIC SEARCH (simple query - cost optimization)`)
      console.log(`[ai-search] Parameters: maxNodes=${CONFIG.SIMPLE_QUERY.maxNodes}, threshold=${CONFIG.SIMPLE_QUERY.similarityThreshold}`)
      
      try {
        semanticResult = await fetchTreeContextWithSemanticSearch(client, treeId, query, {
          maxNodes: CONFIG.SIMPLE_QUERY.maxNodes,
          similarityThreshold: CONFIG.SIMPLE_QUERY.similarityThreshold,
          includeDependencies: false, // Simple queries don't need dependencies - keeps node count low
        })
        
        treeContext = semanticResult.context
        
        // Calculate actual node count from semantic search result
        const semanticNodeCount = treeContext ? treeContext.blocks.reduce((sum: number, b: any) => sum + b.nodes.length, 0) : 0
        console.log(`[ai-search] Semantic search returned ${semanticNodeCount} nodes (requested max: ${CONFIG.SIMPLE_QUERY.maxNodes})`)
        
        // DEFENSIVE FIX: If semantic search returned more nodes than expected, truncate aggressively
        const expectedMaxNodes = CONFIG.SIMPLE_QUERY.maxNodes
        if (treeContext && semanticNodeCount > expectedMaxNodes) {
          console.warn(`[ai-search] ⚠️ DEFENSIVE FIX: Semantic search returned ${semanticNodeCount} nodes, truncating to ${expectedMaxNodes}`)
          
          // Truncate nodes to expected max
          const allNodes = treeContext.blocks.flatMap((b: any) => b.nodes)
          const truncatedNodes = allNodes.slice(0, expectedMaxNodes)
          const truncatedNodeIds = new Set(truncatedNodes.map((n: any) => n.id))
          
          // Filter blocks to only include truncated nodes
          treeContext.blocks = treeContext.blocks
            .map((block: any) => ({
              ...block,
              nodes: block.nodes.filter((node: any) => truncatedNodeIds.has(node.id))
            }))
            .filter((block: any) => block.nodes.length > 0)
          
          const newCount = treeContext.blocks.reduce((sum: number, b: any) => sum + b.nodes.length, 0)
          console.log(`[ai-search] ✅ Truncated to ${newCount} nodes`)
        }
        
        // Fallback 1: If semantic search finds 0 nodes, use full context
        if (!treeContext || semanticNodeCount === 0) {
          console.log(`[ai-search] Semantic search found 0 nodes - falling back to full context`)
          treeContext = await fetchTreeContext(client, treeId)
          contextStrategy = 'full_fallback_empty'
          usedSemanticSearch = false
        } else {
          usedSemanticSearch = true
          contextStrategy = 'semantic'
          const finalNodeCount = treeContext.blocks.reduce((sum: number, b: any) => sum + b.nodes.length, 0)
          if (finalNodeCount > CONFIG.SIMPLE_QUERY.maxNodes * 1.2) {
            console.warn(`[ai-search] ⚠️ After defensive filtering, still have ${finalNodeCount} nodes (requested ${CONFIG.SIMPLE_QUERY.maxNodes}). This may indicate a deeper issue.`)
          }
        }
      } catch (error) {
        // Fallback 2: If semantic search fails, use full context
        console.error(`[ai-search] Semantic search failed - falling back to full context:`, error)
        treeContext = await fetchTreeContext(client, treeId)
        contextStrategy = 'full_fallback_error'
        usedSemanticSearch = false
      }
    }
    // Strategy 4: Ambiguous queries - use semantic search (conservative)
    else {
      console.log(`[ai-search] Strategy: SEMANTIC SEARCH (ambiguous query - conservative)`)
      console.log(`[ai-search] Parameters: maxNodes=${CONFIG.AMBIGUOUS_QUERY.maxNodes}, threshold=${CONFIG.AMBIGUOUS_QUERY.similarityThreshold}`)
      
      try {
        semanticResult = await fetchTreeContextWithSemanticSearch(client, treeId, query, {
          maxNodes: CONFIG.AMBIGUOUS_QUERY.maxNodes,
          similarityThreshold: CONFIG.AMBIGUOUS_QUERY.similarityThreshold,
          includeDependencies: true,
        })
        
        treeContext = semanticResult.context
        
        // Calculate actual node count from semantic search result
        const semanticNodeCount = treeContext ? treeContext.blocks.reduce((sum: number, b: any) => sum + b.nodes.length, 0) : 0
        console.log(`[ai-search] Semantic search returned ${semanticNodeCount} nodes (requested max: ${CONFIG.AMBIGUOUS_QUERY.maxNodes})`)
        
        // DEFENSIVE FIX: If semantic search returned more nodes than expected, truncate aggressively
        const expectedMaxNodes = CONFIG.AMBIGUOUS_QUERY.maxNodes
        if (treeContext && semanticNodeCount > expectedMaxNodes) {
          console.warn(`[ai-search] ⚠️ DEFENSIVE FIX: Semantic search returned ${semanticNodeCount} nodes, truncating to ${expectedMaxNodes}`)
          
          // Truncate nodes to expected max
          const allNodes = treeContext.blocks.flatMap((b: any) => b.nodes)
          const truncatedNodes = allNodes.slice(0, expectedMaxNodes)
          const truncatedNodeIds = new Set(truncatedNodes.map((n: any) => n.id))
          
          // Filter blocks to only include truncated nodes
          treeContext.blocks = treeContext.blocks
            .map((block: any) => ({
              ...block,
              nodes: block.nodes.filter((node: any) => truncatedNodeIds.has(node.id))
            }))
            .filter((block: any) => block.nodes.length > 0)
          
          const newCount = treeContext.blocks.reduce((sum: number, b: any) => sum + b.nodes.length, 0)
          console.log(`[ai-search] ✅ Truncated to ${newCount} nodes`)
        }
        
        // Fallback 1: If semantic search finds 0 nodes, use full context
        if (!treeContext || semanticNodeCount === 0) {
          console.log(`[ai-search] Semantic search found 0 nodes - falling back to full context`)
          treeContext = await fetchTreeContext(client, treeId)
          contextStrategy = 'full_fallback_empty'
          usedSemanticSearch = false
        } else {
          usedSemanticSearch = true
          contextStrategy = 'semantic_conservative'
          const finalNodeCount = treeContext.blocks.reduce((sum: number, b: any) => sum + b.nodes.length, 0)
          if (finalNodeCount > CONFIG.AMBIGUOUS_QUERY.maxNodes * 1.2) {
            console.warn(`[ai-search] ⚠️ After defensive filtering, still have ${finalNodeCount} nodes (requested ${CONFIG.AMBIGUOUS_QUERY.maxNodes}). This may indicate a deeper issue.`)
          }
        }
      } catch (error) {
        // Fallback 2: If semantic search fails, use full context
        console.error(`[ai-search] Semantic search failed - falling back to full context:`, error)
        treeContext = await fetchTreeContext(client, treeId)
        contextStrategy = 'full_fallback_error'
        usedSemanticSearch = false
      }
    }

    if (!treeContext) {
      return NextResponse.json(
        { error: 'Tree not found or access denied' },
        { status: 404 }
      )
    }

    // Calculate context node count
    const contextNodeCount = treeContext.blocks.reduce((sum: number, block: any) => sum + block.nodes.length, 0)
    const estimatedCostValue = estimateCost(contextNodeCount)

    // Log result
    console.log(`[ai-search] Result: Used ${contextNodeCount} nodes (of ${totalNodeCount} total)`)
    console.log(`[ai-search] Estimated cost: $${estimatedCostValue.toFixed(4)}`)

    // Generate answer using selected context
    let answer = null
    let answerError = null
    
    try {
      answer = await generateAnswer(query, treeContext, conversationHistory)
    } catch (error) {
      console.error('Error generating answer:', error)
      answerError = error instanceof Error ? error.message : 'Unknown error'
      answer = `Unable to generate answer: ${answerError}. Please check your OpenAI API key and try again.`
    }

    // Determine query classification (now async)
    const queryClassification = (await requiresFullContext(query))
      ? 'accuracy_critical'
      : (await isSimpleQuery(query))
      ? 'simple'
      : 'ambiguous'

    return NextResponse.json({
      query,
      answer,
      answerGenerated: !!answer,
      answerError,
      tree_name: treeContext.tree.name,
      tree_context: treeContext, // Include full tree context for frontend parsing
      metadata: {
        // Context strategy info
        used_semantic_search: usedSemanticSearch,
        context_strategy: contextStrategy,

        // Node counts
        total_nodes: totalNodeCount,
        context_nodes: contextNodeCount,

        // Additional useful info
        query_classification: queryClassification,

        // Cost estimation (helpful for monitoring)
        estimated_cost: estimatedCostValue,

        // Timestamp
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('AI search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

