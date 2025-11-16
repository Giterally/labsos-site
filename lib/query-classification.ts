/**
 * Query Classification for Smart Context Detection
 * Determines whether a query requires full context or can use semantic search
 */

// Configuration constants (easy to tune)
export const CONFIG = {
  // Tree size thresholds
  SMALL_TREE_THRESHOLD: 30, // Always use full context below this

  // Semantic search parameters
  SIMPLE_QUERY: {
    maxNodes: 15,
    similarityThreshold: 0.65,
    estimatedCost: 0.003,
  },

  AMBIGUOUS_QUERY: {
    maxNodes: 25,
    similarityThreshold: 0.7,
    estimatedCost: 0.006,
  },

  FULL_CONTEXT: {
    estimatedCost: 0.01, // per 35 nodes
  },
}

/**
 * Detect if a query requires full context for 100% accuracy
 * These queries need to see ALL nodes to be accurate
 */
export function requiresFullContext(query: string): boolean {
  const lowerQuery = query.toLowerCase()

  const accuracyKeywords = [
    // Counting/quantification
    'count',
    'how many',
    'total number',
    'number of',

    // Completeness indicators
    'all nodes',
    'every node',
    'each node',
    'complete',
    'entire',
    'full list',
    'whole tree',

    // Exhaustive operations
    'go through',
    'across the tree',
    'throughout',
    'find all',
    'show all',
    'list all',
    'give me all',

    // Comparison/analysis (needs full context)
    'compare all',
    'analyze all',
    'which nodes',

    // Summary operations
    'summarize the tree',
    'overview of all',

    // Searching with "all" modifier
    'search all',
    'look through all',
  ]

  const requiresFull = accuracyKeywords.some((kw) => lowerQuery.includes(kw))

  if (requiresFull) {
    console.log(
      `[requiresFullContext] ✅ Query requires full context: "${query.slice(0, 50)}..."`
    )
  }

  return requiresFull
}

/**
 * Detect if a query is simple and can use semantic search
 * These queries typically need only a few relevant nodes
 */
export function isSimpleQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase()

  const simplePatterns = [
    // Definition/explanation
    'what is',
    'what does',
    'what are',
    "what's",
    'explain',
    'define',
    'describe',
    'tell me about',
    'what about',

    // Location/identification
    'where is',
    'where can i find',

    // Temporal
    'when is',
    'when should',
    'when do',

    // People/roles
    'who is',
    'who should',

    // Instructions/procedures
    'how to',
    'how do i',
    'how can i',
    'show me',
    'can you show',

    // Single-node focused
    'tell me more about',
    'give me details about',
    'information about',
    'info on',

    // Status checks (usually simple)
    'status of',
    'is there a',
  ]

  const isSimple = simplePatterns.some((pattern) => lowerQuery.includes(pattern))

  if (isSimple) {
    console.log(
      `[isSimpleQuery] ✅ Query detected as simple: "${query.slice(0, 50)}..."`
    )
  }

  return isSimple
}

/**
 * Estimate cost based on node count
 * Rough estimation: $0.01 per 1000 tokens
 */
export function estimateCost(nodeCount: number): number {
  // Average node = ~300 tokens
  // +500 for prompt overhead
  const estimatedTokens = nodeCount * 300 + 500
  return (estimatedTokens / 1000) * 0.01
}

