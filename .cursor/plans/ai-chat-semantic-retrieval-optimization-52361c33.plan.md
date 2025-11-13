<!-- 52361c33-8da6-43de-9b9a-6ca0f6b179ee aafd5563-f43b-46e5-9445-6d5ca81db72d -->
# Agentic AI Chat Implementation Plan

## Overview

Add agentic capabilities to AI chat allowing it to modify experiment trees (nodes, blocks, content, links, attachments, dependencies) using a preview-then-confirm workflow. AI generates operation plans, user reviews and confirms, then operations execute atomically with real-time UI updates.

## Architecture

### 1. New API Endpoint: `/api/trees/[treeId]/ai-actions`

**File**: `app/api/trees/[treeId]/ai-actions/route.ts`

Two modes:

- **Preview mode** (POST with `mode: 'preview'`): AI generates operation plan, returns for user confirmation
- **Execute mode** (POST with `mode: 'execute'`): Executes confirmed operations atomically

**Preview Response**:

```typescript
{
  plan: {
    operations: Array<{
      type: 'create_node' | 'update_node' | 'delete_node' | 'move_node' | 
            'create_block' | 'update_block' | 'delete_block' | 'reorder_blocks' |
            'update_content' | 'add_link' | 'remove_link' | 'add_attachment' | 
            'remove_attachment' | 'add_dependency' | 'remove_dependency',
      target: { node_id?: string, block_id?: string, ... },
      changes: { ... },
      confidence: number,
      reasoning: string
    }>,
    summary: string,
    estimated_impact: string
  }
}
```

**Execute Response**:

```typescript
{
  results: Array<{
    operation_id: string,
    success: boolean,
    result?: any,
    error?: string
  }>,
  tree_context: TreeContext // Updated tree context for UI sync
}
```

### 2. Node/Block Search Function

**File**: `lib/tree-context.ts` (add new function)

`searchNodesAndBlocks(treeContext, query, options)`:

- Fuzzy name matching (Levenshtein distance)
- Position-based search ("first node", "last block")
- Content/description search (semantic similarity)
- Returns matches with confidence scores
- Optimized for cost/latency (cached embeddings, fast string matching)

### 3. OpenAI Function Calling Schemas

**File**: `lib/ai-action-schemas.ts` (new file)

Define function schemas for OpenAI:

- `create_node(name, description, node_type, block_id, position, content, ...)`
- `update_node(node_identifier, changes: {name?, description?, content?, ...})`
- `delete_node(node_identifier)`
- `move_node(node_identifier, target_block_id, new_position)`
- `create_block(name, block_type, position)`
- `update_block(block_identifier, changes: {name?, position?, ...})`
- `delete_block(block_identifier)`
- `reorder_blocks(block_positions: Array<{block_id, position}>)`
- `update_node_content(node_identifier, content)`
- `add_link(node_identifier, name, url, description, link_type)`
- `remove_link(node_identifier, link_id)`
- `add_attachment(node_identifier, name, file_url, file_type, description)`
- `remove_attachment(node_identifier, attachment_id)`
- `add_dependency(from_node_identifier, to_node_identifier, dependency_type, evidence_text)`
- `remove_dependency(from_node_identifier, to_node_identifier)`
- `search_nodes(query, limit?)` - Helper for AI to find nodes
- `search_blocks(query, limit?)` - Helper for AI to find blocks

### 4. AI Action Handler

**File**: `lib/ai-action-handler.ts` (new file)

`generateActionPlan(query, treeContext, conversationHistory)`:

- Uses OpenAI with function calling
- AI generates operation plan using function schemas
- Returns structured plan with operations

`executeActionPlan(plan, treeId, supabase)`:

- Validates all operations
- Checks permissions
- Executes in transaction (atomic)
- Returns results with updated tree context

### 5. Update AI Chat Route

**File**: `app/api/trees/[treeId]/ai-search/route.ts`

Add action mode detection:

- If query contains action intent (detect keywords like "create", "delete", "move", "update"), route to action handler
- Otherwise, use existing search/answer flow

### 6. Update AIChatSidebar Component

**File**: `components/AIChatSidebar.tsx`

Add preview/confirm UI:

- Detect action intent in user message
- Show preview panel with operation plan
- Display operations in readable format
- "Confirm" and "Cancel" buttons
- After confirmation, show execution progress
- Update tree view on success (via callback or event)

**New State**:

```typescript
const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null)
const [isExecuting, setIsExecuting] = useState(false)
```

**New UI Component**: `ActionPlanPreview` - Shows operations in a card/list format

### 7. Real-time Tree Updates

**File**: `app/project/[projectId]/trees/[treeId]/page.tsx`

Add callback prop to AIChatSidebar:

- `onTreeUpdated?: (updatedTreeContext: TreeContext) => void`
- When actions execute, call this callback
- Update local state to reflect changes immediately
- Trigger re-fetch if needed for complex changes

### 8. Operation Execution Logic

**File**: `lib/ai-action-executor.ts` (new file)

Execute each operation type:

- **Node operations**: Use existing `/api/trees/[treeId]/nodes` endpoints
- **Block operations**: Use existing `/api/trees/[treeId]/blocks` endpoints
- **Content operations**: Use `/api/trees/[treeId]/nodes/[nodeId]/content`
- **Link operations**: Use `/api/trees/[treeId]/nodes/[nodeId]/links`
- **Attachment operations**: Use `/api/trees/[treeId]/nodes/[nodeId]/attachments`
- **Dependency operations**: Use `/api/trees/[treeId]/nodes/[nodeId]/dependencies` (if exists, or direct DB)

All operations:

- Validate permissions before execution
- Handle errors gracefully
- Return structured results
- Update embeddings after content changes (non-blocking)

### 9. Error Handling & Validation

- Validate node/block identifiers before execution
- Check permissions for each operation
- Validate data constraints (max 3 tree references, etc.)
- Handle partial failures in multi-step operations (atomic rollback)
- Provide clear error messages to user

### 10. Cost & Latency Optimizations

- Cache node/block search results during conversation
- Batch embedding updates (don't block on embedding generation)
- Use semantic search for node identification (reuse existing embeddings)
- Limit function calling to essential operations only
- Cache tree context during action planning

## Implementation Steps

1. Create `lib/ai-action-schemas.ts` with all function definitions
2. Create `lib/tree-context.ts` helper: `searchNodesAndBlocks()`
3. Create `lib/ai-action-handler.ts` for plan generation
4. Create `lib/ai-action-executor.ts` for execution
5. Create `/api/trees/[treeId]/ai-actions/route.ts` endpoint
6. Update `app/api/trees/[treeId]/ai-search/route.ts` to detect action intent
7. Update `components/AIChatSidebar.tsx` with preview/confirm UI
8. Add `ActionPlanPreview` component
9. Update tree page to handle real-time updates
10. Add error handling and validation
11. Test with various operation types

## Files to Create/Modify

**New Files**:

- `lib/ai-action-schemas.ts` - Function calling schemas
- `lib/ai-action-handler.ts` - Plan generation logic
- `lib/ai-action-executor.ts` - Execution logic
- `app/api/trees/[treeId]/ai-actions/route.ts` - API endpoint
- `components/ActionPlanPreview.tsx` - Preview UI component

**Modified Files**:

- `lib/tree-context.ts` - Add `searchNodesAndBlocks()` function
- `app/api/trees/[treeId]/ai-search/route.ts` - Add action intent detection
- `components/AIChatSidebar.tsx` - Add preview/confirm flow
- `app/project/[projectId]/trees/[treeId]/page.tsx` - Add update callback

## Key Considerations

- **Cost**: Minimize function calling tokens by using efficient schemas
- **Latency**: Cache searches, batch operations, async embedding updates
- **UX**: Clear preview, progress indicators, immediate feedback
- **Safety**: Always validate, check permissions, atomic transactions
- **Compatibility**: Preserve existing chat functionality

### To-dos

- [ ] Create fetchTreeContextWithSemanticSearch() function in lib/tree-context.ts with embedding generation, semantic search, and dependency expansion
- [ ] Update handleAISearch() in app/api/trees/[treeId]/ai-search/route.ts to use semantic retrieval with fallback logic
- [ ] Add response metadata (retrieval_method, nodes_used) to AI search response
- [ ] Test with small trees (< 20 nodes) to verify fallback to full context
- [ ] Test with large trees to verify semantic retrieval works and attachments/links still render
- [ ] Add loading states in AIChatSidebar.tsx (optional enhancement)
- [ ] Cache connection calculations and skip off-screen connections