import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { supabaseServer } from '@/lib/supabase-server'
import { fetchTreeContext, fetchTreeContextWithSemanticSearch } from '@/lib/tree-context'
import { generateActionPlan, GeneratedActionPlan } from '@/lib/ai-action-handler'
import { executeActionPlan } from '@/lib/ai-action-executor'
import { hasActionIntent } from '@/lib/ai-action-schemas'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params
    const body = await request.json()
    const { mode, query, plan, conversationHistory, agentMode = true } = body
    
    console.log(`[AI_ACTIONS] Received request: mode=${mode}, query="${query?.substring(0, 50)}...", agentMode=${agentMode}`)

    if (!mode || (mode !== 'preview' && mode !== 'execute')) {
      return NextResponse.json(
        { error: 'Mode must be "preview" or "execute"' },
        { status: 400 }
      )
    }

    if (mode === 'preview' && !query) {
      return NextResponse.json(
        { error: 'Query is required for preview mode' },
        { status: 400 }
      )
    }

    if (mode === 'execute' && !plan) {
      return NextResponse.json(
        { error: 'Plan is required for execute mode' },
        { status: 400 }
      )
    }

    // Resolve parent project visibility using server client
    const { data: treeMeta, error: treeMetaErr } = await supabaseServer
      .from('experiment_trees')
      .select('id, project_id')
      .eq('id', treeId)
      .single()

    if (treeMetaErr || !treeMeta) {
      return NextResponse.json({ error: 'Experiment tree not found' }, { status: 404 })
    }

    const { data: proj, error: projErr } = await supabaseServer
      .from('projects')
      .select('visibility')
      .eq('id', treeMeta.project_id)
      .single()

    if (projErr || !proj) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Determine which client to use based on project visibility
    let client: any = supabaseServer
    let userId: string | null = null

    if (proj.visibility === 'private') {
      // For private projects, authenticate and check permissions
      let authContext
      try {
        authContext = await authenticateRequest(request)
      } catch (error) {
        if (error instanceof AuthError) {
          return NextResponse.json(
            { error: error.message },
            { status: error.statusCode }
          )
        }
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      const permissions = new PermissionService(authContext.supabase, authContext.user.id)
      const access = await permissions.checkTreeAccess(treeId)
      if (!access.canRead) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      client = authContext.supabase
      userId = authContext.user.id
    }

    if (mode === 'preview') {
      // Generate action plan
      // Check tree size to decide retrieval method
      const { count: nodeCount } = await supabaseServer
        .from('tree_nodes')
        .select('*', { count: 'exact', head: true })
        .eq('tree_id', treeId)

      const totalNodeCount = nodeCount || 0
      const useSemanticSearch = totalNodeCount >= 20

      let treeContext: any = null

      if (useSemanticSearch) {
        try {
          const semanticResult = await fetchTreeContextWithSemanticSearch(client, treeId, query, {
            maxNodes: 10,
            similarityThreshold: 0.7,
            includeDependencies: true,
          })
          treeContext = semanticResult.context
        } catch (error) {
          console.error('[AI_ACTIONS] Semantic search failed, falling back to full context:', error)
          treeContext = await fetchTreeContext(client, treeId)
        }
      } else {
        treeContext = await fetchTreeContext(client, treeId)
      }

      if (!treeContext) {
        return NextResponse.json(
          { error: 'Tree not found or access denied' },
          { status: 404 }
        )
      }

      // Generate action plan
      const actionPlan = await generateActionPlan(
        query,
        treeContext,
        conversationHistory || [],
        agentMode
      )

      return NextResponse.json({
        mode: 'preview',
        plan: actionPlan
      })
    } else {
      // Execute action plan
      if (!userId) {
        // Need authentication for execution
        let authContext
        try {
          authContext = await authenticateRequest(request)
        } catch (error) {
          if (error instanceof AuthError) {
            return NextResponse.json(
              { error: error.message },
              { status: error.statusCode }
            )
          }
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        }
        client = authContext.supabase
        userId = authContext.user.id
      }

      const executionResult = await executeActionPlan(
        plan as GeneratedActionPlan,
        treeId,
        client,
        userId
      )

      console.log(`[AI_ACTIONS] Execution completed: ${executionResult.results.filter(r => r.success).length}/${executionResult.results.length} successful`)
      console.log(`[AI_ACTIONS] Returning tree_context:`, executionResult.tree_context ? 'present' : 'null')

      return NextResponse.json({
        mode: 'execute',
        results: executionResult.results,
        updated_tree_context: executionResult.tree_context // Map tree_context to updated_tree_context for frontend
      })
    }
  } catch (error) {
    console.error('AI actions error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

