<!-- 52361c33-8da6-43de-9b9a-6ca0f6b179ee e1876e4f-57ff-40ec-8e2e-15b7f8a2d2bd -->
# Optimize Action Plan Generation for 100% Accuracy and Efficiency

## Problem

Current implementation uses semantic search (maxNodes: 10) for all trees with 20+ nodes, causing incomplete action plans for bulk operations. Need to ensure 100% accuracy while maintaining efficiency.

## Solution Strategy

1. **Detect bulk vs targeted operations** - Route to appropriate context strategy
2. **Full context for bulk operations** - Ensure all nodes are visible for "all nodes" queries
3. **Semantic search for targeted operations** - Efficient for specific node queries
4. **Chunked generation for large bulk operations** - Handle trees with 50+ nodes efficiently
5. **Add max_tokens to OpenAI calls** - Allow more function calls in response

## Implementation

### 1. Add Bulk Operation Detection (`lib/ai-action-schemas.ts`)

- Create `detectBulkOperation(query: string): boolean` function
- Check for keywords: "all nodes", "every node", "entire tree", "all blocks", "each node", "go through every"
- Check for patterns like "for all", "across all", "throughout the tree"

### 2. Update Context Selection Logic (`app/api/trees/[treeId]/ai-actions/route.ts`)

- Replace current `useSemanticSearch` logic (line 103-121)
- New logic:
  ```typescript
  const isBulkOperation = detectBulkOperation(query)
  const totalNodeCount = nodeCount || 0
  
  let treeContext: TreeContext | null = null
  
  if (isBulkOperation) {
    // Bulk operations: always use full context for 100% accuracy
    treeContext = await fetchTreeContext(client, treeId)
  } else if (totalNodeCount >= 20) {
    // Targeted operations: use semantic search for efficiency
    try {
      const semanticResult = await fetchTreeContextWithSemanticSearch(client, treeId, query, {
        maxNodes: 20, // Increased from 10 for better coverage
        similarityThreshold: 0.7,
        includeDependencies: true,
      })
      treeContext = semanticResult.context
    } catch (error) {
      console.error('[AI_ACTIONS] Semantic search failed, falling back to full context:', error)
      treeContext = await fetchTreeContext(client, treeId)
    }
  } else {
    // Small trees: always use full context
    treeContext = await fetchTreeContext(client, treeId)
  }
  ```


### 3. Implement Chunked Plan Generation (`lib/ai-action-handler.ts`)

- Add `generateChunkedActionPlan()` function for large bulk operations
- Split nodes into batches of 15-20 nodes
- Generate operations for each batch sequentially
- Merge all operations into single plan
- Add logging for chunk progress

### 4. Add max_tokens to OpenAI Calls (`lib/ai-action-handler.ts`)

- Update `openai.chat.completions.create()` call (line 101-114)
- Add `max_tokens: 16384` to allow more function calls
- This enables handling 30-40 operations in a single response

### 5. Update generateActionPlan to Handle Chunking (`lib/ai-action-handler.ts`)

- Check if bulk operation and node count > 20
- If yes, call `generateChunkedActionPlan()`
- Otherwise, use standard generation

### 6. Ensure fetchTreeContextWithSemanticSearch Exists (`lib/tree-context.ts`)

- Verify function exists (currently imported but may be missing)
- If missing, implement using embeddings search similar to existing semantic search patterns
- Should return filtered TreeContext with only relevant nodes

## Files to Modify

1. `lib/ai-action-schemas.ts` - Add `detectBulkOperation()` function
2. `app/api/trees/[treeId]/ai-actions/route.ts` - Update context selection logic (lines 94-121)
3. `lib/ai-action-handler.ts` - Add chunked generation and max_tokens (lines 52-326)
4. `lib/tree-context.ts` - Verify/implement `fetchTreeContextWithSemanticSearch` if missing

## Expected Outcomes

- **100% accuracy**: Bulk operations see all nodes, no nodes missed
- **Efficiency**: Targeted operations use semantic search (20 nodes vs all nodes)
- **Scalability**: Chunked generation handles trees with 100+ nodes
- **Cost optimization**: Only use full context when necessary (bulk operations)

## Testing Considerations

- Test with bulk operation: "go through every node and..."
- Test with targeted operation: "update the first node in Protocol Block"
- Test with large tree (50+ nodes) and bulk operation
- Verify all nodes are included in bulk operation plans
- Verify targeted operations still work efficiently

### To-dos

- [ ] Create fetchTreeContextWithSemanticSearch() function in lib/tree-context.ts with embedding generation, semantic search, and dependency expansion
- [ ] Update handleAISearch() in app/api/trees/[treeId]/ai-search/route.ts to use semantic retrieval with fallback logic
- [ ] Add response metadata (retrieval_method, nodes_used) to AI search response
- [ ] Test with small trees (< 20 nodes) to verify fallback to full context
- [ ] Test with large trees to verify semantic retrieval works and attachments/links still render
- [ ] Add loading states in AIChatSidebar.tsx (optional enhancement)
- [ ] Cache connection calculations and skip off-screen connections
- [ ] Add detectBulkOperation() function to lib/ai-action-schemas.ts to identify bulk operation queries
- [ ] Update context selection logic in app/api/trees/[treeId]/ai-actions/route.ts to use full context for bulk operations and semantic search for targeted operations
- [ ] Add max_tokens: 16384 to OpenAI API call in lib/ai-action-handler.ts to allow more function calls per response
- [ ] Implement generateChunkedActionPlan() function in lib/ai-action-handler.ts for handling large bulk operations (50+ nodes)
- [ ] Update generateActionPlan() to detect bulk operations with >20 nodes and route to chunked generation
- [ ] Verify fetchTreeContextWithSemanticSearch exists in lib/tree-context.ts, implement if missing