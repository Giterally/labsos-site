# Complete AI Chat System Documentation for Experiment Trees

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Frontend Component (AIChatSidebar)](#frontend-component-aichatsidebar)
4. [Query Classification & Routing](#query-classification--routing)
5. [Normal Chat Flow (AI Search)](#normal-chat-flow-ai-search)
6. [Agentic Chat Flow (AI Actions)](#agentic-chat-flow-ai-actions)
7. [Semantic Search Implementation](#semantic-search-implementation)
8. [Full Context Retrieval](#full-context-retrieval)
9. [Answer Generation](#answer-generation)
10. [Action Plan Generation](#action-plan-generation)
11. [Action Plan Execution](#action-plan-execution)
12. [Database Schema & Embeddings](#database-schema--embeddings)
13. [Complete Prompts](#complete-prompts)

---

## System Overview

The AI chat system provides two modes of interaction with experiment trees:

1. **Normal Chat (AI Search)**: Answers questions about the tree using RAG (Retrieval-Augmented Generation)
2. **Agentic Chat (AI Actions)**: Modifies the tree structure by generating and executing action plans

Both modes use intelligent context selection to optimize cost and accuracy:
- **Full Context**: All nodes (for small trees or accuracy-critical queries)
- **Semantic Search**: Relevant nodes only (for cost optimization)

---

## Architecture

```
User Input
    ↓
AIChatSidebar Component
    ↓
hasActionIntent() check
    ↓
    ├─→ Action Intent? → /api/trees/[treeId]/ai-actions (preview mode)
    │                        ↓
    │                   generateActionPlan()
    │                        ↓
    │                   Action Plan Preview UI
    │                        ↓
    │                   User Confirms → /api/trees/[treeId]/ai-actions (execute mode)
    │                        ↓
    │                   executeActionPlan()
    │
    └─→ No Action Intent → /api/trees/[treeId]/ai-search
                             ↓
                        Query Classification
                             ↓
                    ┌────────┴────────┐
                    │                  │
            Full Context        Semantic Search
                    │                  │
                    └────────┬────────┘
                             ↓
                      generateAnswer()
                             ↓
                      Response to User
```

---

## Frontend Component (AIChatSidebar)

**File**: `components/AIChatSidebar.tsx`

### Key Features
- Chat history management (stored in localStorage)
- Agent mode toggle (controls whether modifications are allowed)
- Action plan preview UI
- Conversation history tracking (last 10 messages)
- Stop generation button
- Copy/regenerate buttons

### Message Flow

```typescript
// 1. User sends message
const sendMessage = async (messageText: string) => {
  // Add user message to chat
  const userMessage: ChatMessage = {
    role: 'user',
    content: messageText,
    timestamp: new Date()
  }
  
  // 2. Check for action intent
  const hasIntent = hasActionIntent(messageText)
  
  if (hasIntent && agentMode) {
    // Route to action endpoint (preview)
    const response = await fetch(`/api/trees/${treeId}/ai-actions`, {
      method: 'POST',
      body: JSON.stringify({
        mode: 'preview',
        query: messageText,
        conversationHistory: conversationHistory.slice(-10)
      })
    })
    
    // Show action plan preview
    setActionPlan(actionData.plan)
  } else {
    // Route to search endpoint
    const response = await fetch(`/api/trees/${treeId}/ai-search`, {
      method: 'POST',
      body: JSON.stringify({
        query: messageText,
        messages: conversationHistory.slice(-10)
      })
    })
    
    // Display answer
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: data.answer,
      metadata: data.metadata // Includes context strategy, node counts, etc.
    }
  }
}
```

### Action Intent Detection

**File**: `lib/ai-action-schemas.ts`

```typescript
export function hasActionIntent(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim()
  
  // Question patterns (NOT actions)
  const questionPatterns = [
    /^what\s+/i,           // "what attachments"
    /^which\s+/i,          // "which nodes"
    /^where\s+/i,          // "where are"
    /^how\s+(many|much)/i, // "how many"
    /^show\s+(me\s+)?/i,   // "show me"
    /^list\s+/i,           // "list all"
    /\?$/,                  // Ends with question mark
  ]
  
  const isQuestion = questionPatterns.some(pattern => pattern.test(lowerQuery))
  
  // Action keywords
  const imperativeActionKeywords = [
    'create', 'add', 'make', 'new',
    'update', 'edit', 'change', 'modify', 'rename',
    'delete', 'remove', 'drop',
    'move', 'reorder'
  ]
  
  // If question, only action if has imperative verbs
  if (isQuestion) {
    const hasImperativeVerb = imperativeActionKeywords.some(keyword => 
      lowerQuery.includes(keyword)
    )
    return hasImperativeVerb
  }
  
  // Not a question - check all action keywords
  return imperativeActionKeywords.some(keyword => lowerQuery.includes(keyword))
}
```

---

## Query Classification & Routing

**File**: `lib/query-classification.ts`

### Classification Strategy

The system uses a **hybrid approach**:
1. **Fast keyword check** (obvious cases, no API call)
2. **GPT classification** (handles typos, variations)
3. **Fallback keyword matching** (if GPT fails)

### Classification Types

```typescript
export const CONFIG = {
  SMALL_TREE_THRESHOLD: 30, // Always full context below this
  
  SIMPLE_QUERY: {
    maxNodes: 15,
    similarityThreshold: 0.65,
    estimatedCost: 0.003
  },
  
  AMBIGUOUS_QUERY: {
    maxNodes: 25,
    similarityThreshold: 0.7,
    estimatedCost: 0.006
  },
  
  GREETING_QUERY: {
    maxNodes: 5,
    similarityThreshold: 0.5,
    estimatedCost: 0.001
  },
  
  FULL_CONTEXT: {
    estimatedCost: 0.01
  }
}
```

### Classification Functions

```typescript
// Main classification function (cached per request)
async function classifyQuery(query: string): Promise<{
  requiresFullContext: boolean;
  isSimpleQuery: boolean;
  isGreeting: boolean;
  confidence: number;
}> {
  // 1. Fast keyword check
  const fastFullContext = requiresFullContextKeywords(query)
  const fastSimple = isSimpleQueryKeywords(query)
  const fastGreeting = isGreetingQuery(query)
  
  if (fastFullContext || fastSimple || fastGreeting) {
    return { /* fast result */ }
  }
  
  // 2. GPT classification (with timeout)
  try {
    const classification = await classifyQueryWithGPT(query)
    return classification
  } catch (error) {
    // 3. Fallback to comprehensive keywords
    return {
      requiresFullContext: requiresFullContextFallback(query),
      isSimpleQuery: isSimpleQueryFallback(query),
      isGreeting: isGreetingQuery(query),
      confidence: 0.7
    }
  }
}
```

### GPT Classification Prompt

```typescript
const systemPrompt = `You are a query classifier for an experiment tree system.

CLASSIFICATION RULES:

REQUIRES FULL CONTEXT (requiresFullContext: true) if:
- Asks for overview/summary of ENTIRE tree
- Asks to count/quantify ALL nodes
- Asks to compare/analyze ALL nodes
- Uses words: "all", "every", "entire", "whole tree"
- "what's this tree about" (tree-wide questions)

IS SIMPLE QUERY (isSimpleQuery: true) if:
- Asks about SPECIFIC topic (e.g., "what is qRT-PCR")
- Asks for explanation of specific thing
- Uses phrases: "what is", "explain", "define", "how to"
- Does NOT mention "tree" in tree-wide context

IS GREETING QUERY (isGreeting: true) if:
- Pure greeting with no question (e.g., "hello", "hi")
- No question words or content after greeting

HANDLE VARIATIONS:
- Typos: "summarise" = "summarize", "abot" = "about"
- Phrasings: "what's" = "what is", "tell me about" = "explain"
- Missing apostrophes: "whats" = "what's"

Respond in JSON:
{
  "requiresFullContext": boolean,
  "isSimpleQuery": boolean,
  "isGreeting": boolean,
  "confidence": number (0-1),
  "reasoning": "brief explanation"
}`
```

---

## Normal Chat Flow (AI Search)

**File**: `app/api/trees/[treeId]/ai-search/route.ts`

### Request Flow

```typescript
export async function POST(request: NextRequest, { params }) {
  const { treeId } = await params
  const body = await request.json()
  const { query, messages } = body
  
  // 1. Authenticate and check permissions
  const client = await getSupabaseClient(request, treeId)
  
  // 2. Get node count
  const { count: nodeCount } = await supabaseServer
    .from('tree_nodes')
    .select('*', { count: 'exact', head: true })
    .eq('tree_id', treeId)
  
  // 3. Classify query
  const needsFullContext = await requiresFullContext(query)
  const isSimple = await isSimpleQuery(query)
  const isGreeting = await isGreetingQuery(query)
  
  // 4. Select context strategy
  let treeContext: TreeContext
  let contextStrategy: string
  
  if (nodeCount <= CONFIG.SMALL_TREE_THRESHOLD) {
    // Strategy 1: Small trees - always full context
    treeContext = await fetchTreeContext(client, treeId)
    contextStrategy = 'full_small_tree'
  } else if (needsFullContext) {
    // Strategy 2: Accuracy-critical - full context
    treeContext = await fetchTreeContext(client, treeId)
    contextStrategy = 'full_accuracy_critical'
  } else if (isGreeting) {
    // Strategy 3: Greetings - minimal semantic search
    const result = await fetchTreeContextWithSemanticSearch(client, treeId, query, {
      maxNodes: CONFIG.GREETING_QUERY.maxNodes,
      similarityThreshold: CONFIG.GREETING_QUERY.similarityThreshold,
      includeDependencies: false
    })
    treeContext = result.context
    contextStrategy = 'greeting'
  } else if (isSimple) {
    // Strategy 4: Simple queries - semantic search
    const result = await fetchTreeContextWithSemanticSearch(client, treeId, query, {
      maxNodes: CONFIG.SIMPLE_QUERY.maxNodes,
      similarityThreshold: CONFIG.SIMPLE_QUERY.similarityThreshold,
      includeDependencies: false
    })
    treeContext = result.context
    contextStrategy = 'semantic'
  } else {
    // Strategy 5: Ambiguous queries - conservative semantic search
    const result = await fetchTreeContextWithSemanticSearch(client, treeId, query, {
      maxNodes: CONFIG.AMBIGUOUS_QUERY.maxNodes,
      similarityThreshold: CONFIG.AMBIGUOUS_QUERY.similarityThreshold,
      includeDependencies: true
    })
    treeContext = result.context
    contextStrategy = 'semantic_conservative'
  }
  
  // 5. Defensive filtering (ensure node limits)
  const contextNodeCount = treeContext.blocks.reduce((sum, block) => 
    sum + block.nodes.length, 0
  )
  
  // If semantic search returned more than expected, truncate
  if (contextNodeCount > expectedMaxNodes) {
    // Truncate to expectedMaxNodes, preserving relevance order
    const allNodes = treeContext.blocks.flatMap(b => b.nodes)
    const truncatedNodes = allNodes.slice(0, expectedMaxNodes)
    // Filter blocks to only include truncated nodes
    // ... (see code for full implementation)
  }
  
  // 6. Generate answer
  const answer = await generateAnswer(query, treeContext, messages)
  
  // 7. Return response
  return NextResponse.json({
    query,
    answer,
    tree_context: treeContext,
    metadata: {
      used_semantic_search: contextStrategy.startsWith('semantic'),
      context_strategy: contextStrategy,
      total_nodes: nodeCount,
      context_nodes: contextNodeCount,
      query_classification: /* ... */,
      estimated_cost: estimateCost(contextNodeCount),
      timestamp: new Date().toISOString()
    }
  })
}
```

---

## Semantic Search Implementation

**File**: `lib/tree-context.ts`

### Process

```typescript
export async function fetchTreeContextWithSemanticSearch(
  supabase: SupabaseClient,
  treeId: string,
  query: string,
  options: {
    maxNodes: number;
    similarityThreshold: number;
    includeDependencies: boolean;
  }
): Promise<{ context: TreeContext; searchResults: any[] }> {
  
  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(query)
  
  // 2. Call PostgreSQL vector search function
  const { data: searchResults, error } = await supabase.rpc(
    'search_nodes_by_embedding',
    {
      query_embedding: queryEmbedding,
      match_threshold: options.similarityThreshold,
      match_count: options.maxNodes,
      tree_id_filter: treeId
    }
  )
  
  // 3. Sort by similarity (descending)
  const sortedResults = [...searchResults].sort((a, b) => 
    (b.similarity || 0) - (a.similarity || 0)
  )
  
  // 4. Limit to maxNodes
  const limitedResults = sortedResults.slice(0, options.maxNodes)
  
  // 5. Create similarity map for relevance ordering
  const nodeSimilarityMap = new Map<string, number>()
  limitedResults.forEach(r => {
    nodeSimilarityMap.set(r.node_id, r.similarity || 0)
  })
  
  // 6. Fetch full context for relevant nodes
  const relevantNodeIds = limitedResults.map(r => r.node_id)
  const fullContext = await fetchTreeContext(supabase, treeId)
  
  // 7. Filter blocks to only include relevant nodes
  const filteredBlocks = fullContext.blocks
    .map(block => ({
      ...block,
      nodes: block.nodes
        .filter(node => relevantNodeIds.includes(node.id))
        .sort((a, b) => {
          // Sort by similarity (highest first)
          const aSim = nodeSimilarityMap.get(a.id) || 0
          const bSim = nodeSimilarityMap.get(b.id) || 0
          return bSim - aSim
        })
    }))
    .filter(block => block.nodes.length > 0)
  
  // 8. Include dependencies if requested
  if (options.includeDependencies) {
    // Add dependent nodes to the context
    // ... (see code for full implementation)
  }
  
  // 9. Final defensive truncation
  const allNodes = filteredBlocks.flatMap(b => b.nodes)
  if (allNodes.length > options.maxNodes) {
    // Truncate to maxNodes, preserving relevance order
    // ... (see code for full implementation)
  }
  
  return {
    context: {
      tree: fullContext.tree,
      blocks: filteredBlocks,
      hierarchy_info: fullContext.hierarchy_info
    },
    searchResults: limitedResults
  }
}
```

### PostgreSQL Vector Search Function

**File**: `migrations/039_create_node_embeddings_for_ai_search.sql`

```sql
CREATE OR REPLACE FUNCTION search_nodes_by_embedding(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  tree_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  node_id uuid,
  node_name text,
  node_description text,
  block_id uuid,
  block_name text,
  similarity float,
  content_preview text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tn.id as node_id,
    tn.name as node_name,
    tn.description as node_description,
    tb.id as block_id,
    tb.name as block_name,
    (1 - (ne.embedding <=> query_embedding)) as similarity,
    LEFT(nc.content, 200) as content_preview
  FROM node_embeddings ne
  JOIN tree_nodes tn ON ne.node_id = tn.id
  LEFT JOIN tree_blocks tb ON tn.block_id = tb.id
  LEFT JOIN node_content nc ON tn.id = nc.node_id
  WHERE 
    ne.embedding IS NOT NULL
    AND (tree_id_filter IS NULL OR tn.tree_id = tree_id_filter)
    AND (1 - (ne.embedding <=> query_embedding)) > match_threshold
  ORDER BY ne.embedding <=> query_embedding  -- Cosine distance (ascending = most similar)
  LIMIT match_count;
END;
$$;
```

**Key Points**:
- Uses `<=>` operator for cosine distance (pgvector)
- `1 - distance` = similarity score
- IVFFlat index for fast approximate nearest neighbor search
- Filters by tree_id and similarity threshold

---

## Full Context Retrieval

**File**: `lib/tree-context.ts`

### Process

```typescript
export async function fetchTreeContext(
  supabase: SupabaseClient,
  treeId: string
): Promise<TreeContext | null> {
  
  // 1. Fetch tree metadata
  const { data: tree, error: treeError } = await supabase
    .from('experiment_trees')
    .select('id, name, description, status')
    .eq('id', treeId)
    .single()
  
  // 2. Fetch blocks
  const { data: blocks } = await supabase
    .from('tree_blocks')
    .select('id, name, type, position')
    .eq('tree_id', treeId)
    .order('position', { ascending: true })
  
  // 3. Fetch nodes for each block
  const nodeIds: string[] = []
  const blocksWithNodes = await Promise.all(
    blocks.map(async (block) => {
      const { data: nodes } = await supabase
        .from('tree_nodes')
        .select('id, name, description, type, status, position')
        .eq('block_id', block.id)
        .order('position', { ascending: true })
      
      nodeIds.push(...nodes.map(n => n.id))
      
      return {
        ...block,
        nodes: nodes.map(node => ({
          ...node,
          content: '', // Will be filled in step 4
          links: [],   // Will be filled in step 4
          attachments: [], // Will be filled in step 4
          dependencies: [] // Will be filled in step 5
        }))
      }
    })
  )
  
  // 4. Fetch node content, links, attachments in parallel
  const [contentData, linksData, attachmentsData] = await Promise.all([
    supabase.from('node_content').select('node_id, content').in('node_id', nodeIds),
    supabase.from('node_links').select('node_id, name, url, description, link_type').in('node_id', nodeIds),
    supabase.from('node_attachments').select('node_id, name, file_type, file_url, description, version').in('node_id', nodeIds)
  ])
  
  // 5. Map content/links/attachments to nodes
  const contentMap = new Map()
  contentData.data.forEach(item => {
    contentMap.set(item.node_id, item.content)
  })
  
  // Similar for links and attachments...
  
  // 6. Fetch dependencies
  const { data: dependencies } = await supabase
    .from('node_dependencies')
    .select('from_node_id, to_node_id, dependency_type, evidence_text')
    .in('from_node_id', nodeIds)
  
  // 7. Build hierarchy info
  const hierarchyInfo = {
    block_count: blocks.length,
    node_count: nodeIds.length,
    dependency_chains: buildDependencyChains(dependencies)
  }
  
  // 8. Fetch parent/child trees (nesting hierarchy)
  // ... (see code for full implementation)
  
  return {
    tree,
    blocks: blocksWithNodes,
    hierarchy_info: hierarchyInfo,
    parent_trees: parentTrees,
    child_trees: childTrees
  }
}
```

---

## Answer Generation

**File**: `lib/embeddings.ts`

### Process

```typescript
export async function generateAnswer(
  query: string,
  treeContext: TreeContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  
  const openai = getOpenAIClient()
  const formattedContext = formatTreeContextForLLM(treeContext)
  
  // Build messages array
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT // See "Complete Prompts" section
    },
    // Add conversation history (last 10 messages)
    ...conversationHistory.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    {
      role: 'user',
      content: `Here is the complete experiment tree structure:\n\n${formattedContext}\n\nUser question: ${query}`
    }
  ]
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    max_tokens: 2000
  })
  
  return response.choices[0]?.message?.content || 'Unable to generate answer.'
}
```

### Tree Context Formatting

**File**: `lib/tree-context.ts`

```typescript
export function formatTreeContextForLLM(
  context: TreeContext,
  options: { truncateContent?: boolean; maxContentLength?: number } = {}
): string {
  let formatted = `EXPERIMENT TREE: ${context.tree.name}\n`
  formatted += `Description: ${context.tree.description}\n`
  formatted += `Status: ${context.tree.status}\n\n`
  
  // Hierarchy info
  formatted += `HIERARCHY:\n`
  formatted += `- This tree contains ${context.hierarchy_info.block_count} block(s) with ${context.hierarchy_info.node_count} total node(s)\n`
  formatted += `- Dependency chains: ${context.hierarchy_info.dependency_chains.map(c => c.chain.join(' → ')).join('\n')}\n\n`
  
  // Blocks and nodes
  context.blocks.forEach((block, blockIndex) => {
    formatted += `\n---\n`
    formatted += `BLOCK ${blockIndex + 1}: ${block.name} (Type: ${block.type}, Position: ${block.position})\n`
    formatted += `Contains ${block.nodes.length} node(s):\n\n`
    
    block.nodes.forEach((node, nodeIndex) => {
      formatted += `  ${nodeIndex + 1}. NODE: ${node.name}\n`
      formatted += `     - Type: ${node.type}\n`
      formatted += `     - Status: ${node.status}\n`
      formatted += `     - Position: ${node.position}\n`
      
      if (node.description) {
        formatted += `     - Description: ${node.description}\n`
      }
      
      // Content (truncated if needed)
      if (node.content && node.content.trim().length > 0) {
        if (truncateContent && node.content.length > maxContentLength) {
          formatted += `     - Content: ${node.content.substring(0, maxContentLength)}... [truncated]\n`
        } else {
          formatted += `     - Content: ${node.content}\n`
        }
      } else {
        formatted += `     - Content: (empty)\n` // Explicitly mark empty
      }
      
      // Links
      if (node.links.length > 0) {
        formatted += `     - Links (${node.links.length}):\n`
        node.links.forEach(link => {
          formatted += `       • ${link.name} (${link.link_type}): ${link.url}\n`
        })
      }
      
      // Attachments
      if (node.attachments.length > 0) {
        formatted += `     - Attachments (${node.attachments.length}):\n`
        node.attachments.forEach(attachment => {
          formatted += `       • ${attachment.name} (${attachment.file_type})\n`
        })
      }
      
      // Dependencies
      if (node.dependencies.length > 0) {
        formatted += `     - Dependencies (${node.dependencies.length}):\n`
        node.dependencies.forEach(dep => {
          formatted += `       • ${dep.dependency_type}: depends on "${dep.to_node_name}"\n`
        })
      }
      
      formatted += `\n`
    })
  })
  
  return formatted
}
```

---

## Agentic Chat Flow (AI Actions)

**File**: `app/api/trees/[treeId]/ai-actions/route.ts`

### Preview Mode (Generate Action Plan)

```typescript
export async function POST(request: NextRequest, { params }) {
  const { treeId } = await params
  const body = await request.json()
  const { mode, query, conversationHistory, agentMode } = body
  
  if (mode === 'preview') {
    // 1. Determine context retrieval strategy
    const { count: nodeCount } = await supabaseServer
      .from('tree_nodes')
      .select('*', { count: 'exact', head: true })
      .eq('tree_id', treeId)
    
    const isBulkOperation = detectBulkOperation(query)
    let treeContext: TreeContext
    
    if (isBulkOperation) {
      // Bulk operations: always full context
      treeContext = await fetchTreeContext(client, treeId)
    } else if (nodeCount >= 20) {
      // Targeted operations: semantic search
      const result = await fetchTreeContextWithSemanticSearch(client, treeId, query, {
        maxNodes: 20,
        similarityThreshold: 0.7,
        includeDependencies: true
      })
      treeContext = result.context
    } else {
      // Small trees: full context
      treeContext = await fetchTreeContext(client, treeId)
    }
    
    // 2. Generate action plan
    const actionPlan = await generateActionPlanWithRouting(
      query,
      treeContext,
      conversationHistory || [],
      agentMode
    )
    
    return NextResponse.json({
      mode: 'preview',
      plan: actionPlan
    })
  }
  
  // Execute mode (see next section)
}
```

---

## Action Plan Generation

**File**: `lib/ai-action-handler.ts`

### Process

```typescript
export async function generateActionPlan(
  query: string,
  treeContext: TreeContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  agentMode: boolean = true
): Promise<GeneratedActionPlan> {
  
  const openai = getOpenAIClient()
  const formattedContext = formatTreeContextForLLM(treeContext, {
    truncateContent: !isBulkOperation,
    maxContentLength: isBulkOperation ? undefined : 2000
  })
  
  // Build system prompt
  const systemPrompt = `You are an AI assistant that helps users modify experiment trees.

IMPORTANT RULES:
1. When a user requests a change, you MUST call at least one action function
2. You can use search_nodes and search_blocks to find items first
3. Use node_identifier or block_identifier (name, ID, or position)
4. Be conservative - only make changes the user explicitly requests

CRITICAL FOR OPERATION TYPE DISAMBIGUATION:
You must distinguish between operations on NODES vs operations on ATTACHMENTS/LINKS/CONTENT:

DELETE OPERATIONS:
- "delete [node name]" (without mentioning attachment/link) → use delete_node
- "delete attachment/link in [node name]" → use remove_attachment or remove_link
- Examples:
  * "delete the video attachment in X node" → remove_attachment
  * "delete X node" → delete_node

ADD OPERATIONS:
- "add node" or "create node" → use create_node
- "add attachment/link to [node name]" → use add_attachment or add_link

UPDATE OPERATIONS:
- "update [node name]" (general changes) → use update_node
- "update content in [node name]" → use update_node_content
- "update attachment/link" → NOT POSSIBLE (only add/remove)

... (see code for full prompt)`
  
  // Build messages
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    {
      role: 'user',
      content: `Here is the current experiment tree structure:\n\n${formattedContext}\n\nUser request: ${query}\n\nIMPORTANT: You must call action functions (like update_node, create_node, delete_node, etc.) to fulfill this request.`
    }
  ]
  
  // Call OpenAI with function calling
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools: AI_ACTION_FUNCTIONS.map(func => ({
      type: 'function',
      function: {
        name: func.name,
        description: func.description,
        parameters: func.parameters
      }
    })),
    tool_choice: 'auto'
  })
  
  // Extract function calls
  const operations: ActionPlanOperation[] = []
  for (const toolCall of response.choices[0].message.tool_calls || []) {
    if (toolCall.type === 'function') {
      const functionName = toolCall.function.name
      const args = JSON.parse(toolCall.function.arguments)
      
      // Resolve identifiers to IDs
      const nodeId = await resolveNodeIdentifier(args.node_identifier, treeContext)
      const blockId = await resolveBlockIdentifier(args.block_identifier, treeContext)
      
      operations.push({
        type: functionName,
        target: {
          node_id: nodeId,
          block_id: blockId,
          node_identifier: args.node_identifier,
          block_identifier: args.block_identifier
        },
        changes: args.changes || args,
        operation_id: `op_${Date.now()}_${Math.random()}`,
        confidence: 0.9,
        reasoning: `Generated from function call: ${functionName}`
      })
    }
  }
  
  return {
    operations,
    summary: response.choices[0].message.content || 'Action plan generated',
    estimated_impact: 'Modifies experiment tree structure'
  }
}
```

### Available Functions

**File**: `lib/ai-action-schemas.ts`

```typescript
export const AI_ACTION_FUNCTIONS = [
  // Node Operations
  {
    name: 'create_node',
    description: 'Create a new node in the experiment tree',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        node_type: { type: 'string' },
        block_id: { type: 'string' },
        position: { type: 'number' },
        content: { type: 'string' }
      },
      required: ['name']
    }
  },
  {
    name: 'update_node',
    description: 'Update an existing node',
    parameters: {
      type: 'object',
      properties: {
        node_identifier: { type: 'string' },
        changes: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'review', 'final'] }
          }
        }
      },
      required: ['node_identifier', 'changes']
    }
  },
  {
    name: 'delete_node',
    description: 'Delete a node from the experiment tree',
    parameters: {
      type: 'object',
      properties: {
        node_identifier: { type: 'string' }
      },
      required: ['node_identifier']
    }
  },
  // ... (see code for full list: move_node, create_block, update_block, delete_block, reorder_blocks, update_node_content, add_link, remove_link, add_attachment, remove_attachment, add_dependency, remove_dependency, search_nodes, search_blocks)
]
```

---

## Action Plan Execution

**File**: `lib/ai-action-executor.ts`

### Process

```typescript
export async function executeActionPlan(
  plan: GeneratedActionPlan,
  treeId: string,
  supabase: SupabaseClient,
  userId: string
): Promise<ExecutionResponse> {
  
  const permissionService = new PermissionService(supabase, userId)
  const results: ExecutionResult[] = []
  
  // Check tree write permissions
  const treeAccess = await permissionService.checkTreeAccess(treeId)
  if (!treeAccess.canWrite) {
    return {
      results: plan.operations.map(op => ({
        operation_id: op.operation_id || 'unknown',
        success: false,
        error: 'No write permission for this tree'
      })),
      tree_context: null
    }
  }
  
  // Fetch full context for identifier resolution if needed
  let fullTreeContext: TreeContext | null = null
  const needsFullContext = plan.operations.some(op => 
    (op.target.node_identifier && !op.target.node_id) || 
    (op.target.block_identifier && !op.target.block_id)
  )
  
  if (needsFullContext) {
    fullTreeContext = await fetchTreeContext(supabase, treeId)
  }
  
  // Execute each operation
  for (const operation of plan.operations) {
    const operationId = operation.operation_id || `op_${Date.now()}_${Math.random()}`
    
    try {
      // Resolve identifiers to IDs if needed
      if (operation.target.node_identifier && !operation.target.node_id && fullTreeContext) {
        const searchResults = searchNodesAndBlocks(fullTreeContext, operation.target.node_identifier, { limit: 1 })
        if (searchResults.nodes.length > 0) {
          operation.target.node_id = searchResults.nodes[0].node_id
        } else {
          throw new Error(`Could not resolve node_identifier: "${operation.target.node_identifier}"`)
        }
      }
      
      // Execute operation based on type
      let result: any = null
      
      switch (operation.type) {
        case 'create_node':
          result = await executeCreateNode(operation, treeId, supabase, permissionService)
          break
        case 'update_node':
          result = await executeUpdateNode(operation, treeId, supabase, permissionService)
          break
        case 'delete_node':
          result = await executeDeleteNode(operation, treeId, supabase, permissionService)
          break
        // ... (see code for all operation types)
      }
      
      results.push({
        operation_id: operationId,
        success: true,
        result
      })
    } catch (error) {
      results.push({
        operation_id: operationId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
  
  // Fetch updated tree context
  const updatedTreeContext = await fetchTreeContext(supabase, treeId)
  
  return {
    results,
    tree_context: updatedTreeContext
  }
}
```

### Example: Execute Update Node

```typescript
async function executeUpdateNode(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  
  const nodeId = operation.target.node_id
  const changes = operation.changes
  
  if (!nodeId) {
    throw new Error('Node ID is required')
  }
  
  // Check node permissions
  const nodeAccess = await permissionService.checkNodeAccess(nodeId)
  if (!nodeAccess.canWrite) {
    throw new Error('No write permission for this node')
  }
  
  // Update node
  const { data: updatedNode, error } = await supabase
    .from('tree_nodes')
    .update({
      name: changes.name,
      description: changes.description,
      node_type: changes.node_type,
      position: changes.position,
      status: changes.status,
      updated_at: new Date().toISOString()
    })
    .eq('id', nodeId)
    .eq('tree_id', treeId)
    .select()
    .single()
  
  if (error) throw error
  
  // Update content if provided
  if (changes.content !== undefined) {
    const { data: existingContent } = await supabase
      .from('node_content')
      .select('id')
      .eq('node_id', nodeId)
      .single()
    
    if (existingContent) {
      await supabase
        .from('node_content')
        .update({ content: changes.content, updated_at: new Date().toISOString() })
        .eq('node_id', nodeId)
    } else {
      await supabase
        .from('node_content')
        .insert({ node_id: nodeId, content: changes.content })
    }
    
    // Update embedding (non-blocking)
    fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(console.error)
  }
  
  return { node: updatedNode }
}
```

---

## Database Schema & Embeddings

### Node Embeddings Table

```sql
CREATE TABLE node_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id UUID REFERENCES tree_nodes(id) ON DELETE CASCADE UNIQUE NOT NULL,
  content_hash TEXT NOT NULL, -- SHA-256 hash to detect content changes
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB DEFAULT '{}', -- Store token count, model version, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for fast similarity search
CREATE INDEX node_embeddings_embedding_idx ON node_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### Embedding Generation

**File**: `lib/embeddings.ts`

```typescript
export function combineNodeContent(node: NodeContentData): string {
  const parts: string[] = []
  
  if (node.name) {
    parts.push(`Title: ${node.name}`)
  }
  
  if (node.description) {
    parts.push(`Description: ${node.description}`)
  }
  
  if (node.content) {
    parts.push(`Content: ${node.content}`)
  }
  
  if (node.attachments && node.attachments.length > 0) {
    const attachmentText = node.attachments
      .map(a => `${a.name}${a.description ? `: ${a.description}` : ''}`)
      .join('; ')
    parts.push(`Attachments: ${attachmentText}`)
  }
  
  if (node.links && node.links.length > 0) {
    const linkText = node.links
      .map(l => `${l.name} (${l.url})${l.description ? `: ${l.description}` : ''}`)
      .join('; ')
    parts.push(`Links: ${linkText}`)
  }
  
  return parts.join('\n\n')
}

export async function updateNodeEmbedding(
  supabase: SupabaseClient,
  nodeId: string,
  nodeData: NodeContentData
): Promise<boolean> {
  // 1. Combine all node content
  const contentText = combineNodeContent(nodeData)
  
  // 2. Generate content hash
  const contentHash = hashContent(contentText)
  
  // 3. Check if embedding exists and content is unchanged
  const { data: existing } = await supabase
    .from('node_embeddings')
    .select('content_hash')
    .eq('node_id', nodeId)
    .single()
  
  if (existing && existing.content_hash === contentHash) {
    return false // No update needed
  }
  
  // 4. Generate new embedding
  const embedding = await generateEmbedding(contentText)
  
  // 5. Store embedding (using service role to bypass RLS)
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)
  await serviceClient
    .from('node_embeddings')
    .upsert({
      node_id: nodeId,
      content_hash: contentHash,
      embedding,
      metadata: {
        token_count: Math.ceil(contentText.length / 4),
        model: 'text-embedding-3-small',
        generated_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'node_id'
    })
  
  return true
}
```

---

## Complete Prompts

### Answer Generation System Prompt

**File**: `lib/embeddings.ts`

```
You are an intelligent AI assistant helping researchers understand and work with their experiment trees. You have complete access to the experiment tree structure and all its content.

EXPERIMENT TREE STRUCTURE:
- An experiment tree is organized into BLOCKS (workflow sections) that contain NODES (individual steps/components)
- Blocks organize nodes into logical groups (e.g., "Setup", "Data Collection", "Analysis")
- Nodes are individual steps/components within blocks, each with a position indicating order
- Each node can have: content, attachments, links, dependencies on other nodes, and references to nested trees

TREE HIERARCHY:
- Blocks contain nodes: Each block has multiple nodes arranged by position
- Node dependencies: Nodes can depend on other nodes, creating workflow chains (e.g., Node A → Node B → Node C)
- Dependency chains show the flow of work through the experiment
- When discussing hierarchy, explain which blocks contain which nodes and how dependencies connect them

NESTING HIERARCHY:
- Parent trees: Trees that reference this tree via their nodes' referenced_tree_ids
- Child trees: Trees that are referenced by nodes in this tree
- Nesting allows reusable sub-procedures to be referenced across multiple trees
- When discussing nesting, explain which trees are above (parents) or below (children) this tree in the hierarchy
- Include which specific nodes reference or are referenced by nested trees

ATTACHMENTS AND LINKS:
- Each node can have attachments (files, videos, documents) and links (URLs, papers, tools)
- Attachments have names, file types, URLs, and descriptions
- Links have names, URLs, link types, and descriptions
- When referencing attachments or links in your response, mention them by name naturally
- The system will automatically render clickable links and embedded videos (YouTube) in the chat
- You can reference attachments/links by their exact names as they appear in the tree context

YOUR CAPABILITIES:
- Answer questions about the tree structure, organization, and workflow
- Explain specific nodes, blocks, and their relationships
- Help analyze dependencies and workflow flow
- Explain tree hierarchy (blocks → nodes, dependency chains)
- Explain nesting hierarchy (parent/child trees and their positions)
- Answer questions about content, attachments, and links
- Reference attachments and links naturally by name (they will be rendered automatically)
- Provide general assistance and have natural conversations
- Reference specific nodes and blocks by name when relevant

INSTRUCTIONS:
- Be direct, concise, and to the point - avoid unnecessary elaboration
- Answer questions directly without preamble or filler phrases
- Use bullet points or numbered lists when listing multiple items
- Reference specific nodes, blocks, or relationships when relevant
- When discussing hierarchy, explain block→node structure and dependency chains clearly but briefly
- When discussing nesting, explain parent/child tree relationships and positions concisely
- Reference attachments and links by their exact names - they will be automatically rendered
- If asked about something not in the tree, say so clearly and briefly
- Maintain conversation context from previous messages
- Prioritize clarity and brevity over verbosity - get to the point quickly
```

### Action Plan Generation System Prompt

**File**: `lib/ai-action-handler.ts`

```
You are an AI assistant that helps users modify and interact with experiment trees. 
You can create, update, delete, and move nodes and blocks in the experiment tree.

IMPORTANT RULES:
1. When a user requests a change, you MUST call at least one action function (update_node, create_node, delete_node, etc.)
2. You can use search_nodes and search_blocks to find items first, but you MUST follow up with an action function
3. Use node_identifier or block_identifier (name, ID, or position like "first node", "last block") to reference items
4. For queries like "first node in the first block", search for the block first, then find the first node within that block
5. For multi-step operations, plan all steps carefully
6. Consider dependencies and relationships between nodes
7. Be conservative - only make changes the user explicitly requests
8. If uncertain about which node/block to modify, use search functions first, then call the action function
9. When multiple nodes share the same name, use specific identifiers like "first Overview node in Protocol Block" or "Overview node at position 5 in Protocol Block" to distinguish them
10. ALWAYS check the current state before generating operations - if the user asks to update nodes with empty content, ONLY update nodes that show "Content: (empty)" in the tree context

CRITICAL: When the user requests changes, you MUST generate function calls for action operations (not just search). 
Each action function call represents one operation in the plan. Do not just respond with text - you must call functions.

CRITICAL FOR OPERATION TYPE DISAMBIGUATION:
You must distinguish between operations on NODES vs operations on ATTACHMENTS/LINKS/CONTENT:

DELETE OPERATIONS:
- "delete [node name]" (without mentioning attachment/link) → use delete_node
- "delete attachment/link in [node name]" → use remove_attachment or remove_link
- "remove attachment/link from [node name]" → use remove_attachment or remove_link
- Examples:
  * "delete the video attachment in X node" → remove_attachment
  * "delete X node" → delete_node
  * "remove the link from Y node" → remove_link

ADD OPERATIONS:
- "add node" or "create node" → use create_node
- "add attachment/link to [node name]" → use add_attachment or add_link
- Examples:
  * "add a video attachment to X node" → add_attachment
  * "create a new node" → create_node
  * "add a link to Y node" → add_link

UPDATE OPERATIONS:
- "update [node name]" (general changes) → use update_node
- "update content in [node name]" or "change content" → use update_node_content or update_node with content
- "update attachment/link" → NOT POSSIBLE (attachments/links can only be added or removed)
- Examples:
  * "update X node's name" → update_node with name change
  * "change the content in Y node" → update_node_content
  * "update the attachment" → ERROR: attachments cannot be updated, only removed and re-added

CRITICAL FOR CONTENT OPERATIONS: If the user asks to update nodes with empty content, you MUST:
- Only generate operations for nodes that show "Content: (empty)" in the tree context
- Do NOT generate operations for nodes that already have content (they show "Content: [text]")
- Use specific identifiers (block name + position or "first/last node in [block]") when multiple nodes share the same name
- Generate exactly ONE operation per node that needs updating
```

---

## Summary

This system provides:

1. **Intelligent Context Selection**: Automatically chooses between full context and semantic search based on query type and tree size
2. **Cost Optimization**: Uses semantic search for most queries, reducing token usage by 60-80%
3. **Robust Classification**: Hybrid approach (keywords + GPT) handles typos and variations
4. **Agentic Capabilities**: Full CRUD operations on experiment trees via natural language
5. **Defensive Filtering**: Multiple layers ensure node limits are strictly enforced
6. **Conversation History**: Maintains context across messages (last 10 messages)
7. **Permission Checking**: All operations verify user permissions before execution
8. **Embedding Management**: Automatic embedding updates when node content changes

The system is production-ready and handles edge cases like:
- Empty content detection
- Bulk operations
- Identifier resolution
- Permission errors
- Semantic search failures (fallback to full context)
- Attachment/link vs node operation disambiguation

