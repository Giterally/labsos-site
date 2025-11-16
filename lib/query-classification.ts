/**
 * Query Classification for Smart Context Detection
 * Determines whether a query requires full context or can use semantic search
 * Uses hybrid approach: keyword matching for obvious cases, GPT for semantic understanding
 */

import OpenAI from 'openai';

// Lazy-load OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Simple in-memory cache for GPT classifications (reduces API calls)
const classificationCache = new Map<string, {
  requiresFullContext: boolean;
  isSimpleQuery: boolean;
  isGreeting: boolean;
  timestamp: number;
}>();

const CACHE_TTL = 1000 * 60 * 60; // 1 hour cache

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

  GREETING_QUERY: {
    maxNodes: 5, // Minimal nodes for greetings - just enough for friendly response
    similarityThreshold: 0.5, // Lower threshold since we don't need relevance
    estimatedCost: 0.001,
  },

  FULL_CONTEXT: {
    estimatedCost: 0.01, // per 35 nodes
  },

  // GPT classification settings
  USE_GPT_CLASSIFICATION: true, // Enable GPT-based classification
  GPT_CLASSIFICATION_TIMEOUT: 2000, // 2 second timeout for GPT calls
}

/**
 * GPT-based query classification - understands intent semantically
 * Handles typos, variations, and different phrasings
 */
async function classifyQueryWithGPT(query: string): Promise<{
  requiresFullContext: boolean;
  isSimpleQuery: boolean;
  confidence: number;
  reasoning: string;
}> {
  // Check cache first
  const cacheKey = query.toLowerCase().trim();
  const cached = classificationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[GPT Classification] Using cached result for: "${query.slice(0, 50)}..."`);
    return {
      requiresFullContext: cached.requiresFullContext,
      isSimpleQuery: cached.isSimpleQuery,
      isGreeting: cached.isGreeting || false,
      confidence: 0.9, // Cached results are high confidence
      reasoning: 'Cached classification'
    };
  }

  try {
    const openai = getOpenAIClient();
    
    const systemPrompt = `You are a query classifier for an experiment tree system. Your job is to understand the user's intent and classify queries accurately, even with typos, variations, or different phrasings.

EXPERIMENT TREE CONTEXT:
- An experiment tree contains multiple nodes organized into blocks
- Nodes represent steps, protocols, analyses, or results
- Users can ask about the entire tree or specific topics within it

CLASSIFICATION RULES:

REQUIRES FULL CONTEXT (requiresFullContext: true) if the query:
- Asks for overview/summary of the ENTIRE tree (e.g., "what's this tree about", "summarize the tree", "tell me about this tree", "hello what's this tree about")
- Asks to count/quantify ALL nodes (e.g., "how many nodes", "count all nodes", "total number of nodes")
- Asks to compare/analyze ALL nodes (e.g., "compare all nodes", "analyze all", "which nodes")
- Asks to list/show ALL nodes (e.g., "show all nodes", "list all", "every node")
- Uses words like: "all", "every", "entire", "whole tree", "complete", "full"
- Is asking "what is this tree" or "what's the tree about" (tree-wide questions)
- Mentions "tree" in context of asking what it contains/does (e.g., "what does this tree do", "what's in this tree")

IS SIMPLE QUERY (isSimpleQuery: true) if the query:
- Asks about a SPECIFIC topic/concept (e.g., "what is qRT-PCR", "explain PCR", "what's RNA-seq")
- Asks for explanation of a specific thing (e.g., "explain X", "define Y", "what is Z")
- Asks "where is X" or "how to do X" (focused questions)
- Is asking about a single topic, NOT the whole tree
- Uses phrases like: "what is", "explain", "define", "how to", "where is"
- Does NOT mention "tree" or "nodes" in a tree-wide context

IS GREETING QUERY (isGreeting: true) if the query:
- Is a pure greeting with no actual question (e.g., "hello", "hi", "hey")
- Contains only greeting words and possibly punctuation
- Does NOT contain any question words or content after the greeting
- Examples: "hello", "hi!", "hey there", "good morning"
- NOT a greeting: "hello what's this tree about" (has actual question)

IMPORTANT DISTINCTIONS:
- "what's this tree about" → requiresFullContext: true (asking about the tree itself)
- "what's qRT-PCR about" → isSimpleQuery: true (asking about a specific topic)
- "summarize the tree" → requiresFullContext: true
- "explain PCR" → isSimpleQuery: true
- "hello what's this tree about" → requiresFullContext: true (greeting + tree question)
- "what is this tree" → requiresFullContext: true
- "what is PCR" → isSimpleQuery: true

HANDLE VARIATIONS AND TYPOS:
- Understand typos: "summarise" = "summarize", "analise" = "analyze", "abot" = "about"
- Understand different phrasings: "what's" = "what is", "tell me about" = "explain"
- Understand context: "about this tree" vs "about PCR"
- Handle missing apostrophes: "whats" = "what's", "thats" = "that's"
- Handle common misspellings: "explane" = "explain", "defin" = "define"
- Handle different word orders: "tree what is this" should still be understood

EDGE CASES:
- Pure greetings: "hello" → isGreeting: true (use minimal context, just friendly response)
- Greetings + query: "hello what's this tree about" → requiresFullContext: true (has actual question)
- Questions with typos: "whats this tre abot" → requiresFullContext: true (understand intent)
- Ambiguous queries: If unsure, favor isSimpleQuery: true (semantic search is safer default)

Respond in JSON format:
{
  "requiresFullContext": boolean,
  "isSimpleQuery": boolean,
  "isGreeting": boolean,
  "confidence": number (0-1, where 1.0 is highest confidence),
  "reasoning": "brief explanation of your classification"
}`;

    const userPrompt = `Classify this query: "${query}"`;

    // Use Promise.race to implement timeout
    const classificationPromise = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1, // Low temperature for consistency
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('GPT classification timeout')), CONFIG.GPT_CLASSIFICATION_TIMEOUT);
    });

    const response = await Promise.race([classificationPromise, timeoutPromise]);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from GPT');
    }

    const result = JSON.parse(content);
    
    // Cache the result
    classificationCache.set(cacheKey, {
      requiresFullContext: result.requiresFullContext || false,
      isSimpleQuery: result.isSimpleQuery || false,
      isGreeting: result.isGreeting || false,
      timestamp: Date.now()
    });

    console.log(`[GPT Classification] Query: "${query.slice(0, 50)}..." → requiresFullContext: ${result.requiresFullContext}, isSimpleQuery: ${result.isSimpleQuery}, isGreeting: ${result.isGreeting || false}, confidence: ${result.confidence || 0.8}`);

    return {
      requiresFullContext: result.requiresFullContext || false,
      isSimpleQuery: result.isSimpleQuery || false,
      isGreeting: result.isGreeting || false,
      confidence: result.confidence || 0.8,
      reasoning: result.reasoning || 'GPT classification'
    };
  } catch (error) {
    console.warn(`[GPT Classification] Failed for query "${query.slice(0, 50)}...":`, error);
    // Return neutral classification on error (will fall back to keyword matching)
    return {
      requiresFullContext: false,
      isSimpleQuery: false,
      confidence: 0,
      reasoning: 'GPT classification failed, using fallback'
    };
  }
}

/**
 * Detect if query is a pure greeting (no actual question)
 * Greetings don't need semantic search - just a friendly response
 */
export function isGreetingQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  
  // Pure greetings (no question words or content)
  const pureGreetings = [
    'hello',
    'hi',
    'hey',
    'greetings',
    'good morning',
    'good afternoon',
    'good evening',
    'howdy',
    'sup',
    'yo',
  ];
  
  // Check if query is just a greeting (possibly with punctuation)
  const normalizedQuery = lowerQuery.replace(/[.,!?;:]/g, '').trim();
  
  // Exact match for pure greetings
  if (pureGreetings.includes(normalizedQuery)) {
    return true;
  }
  
  // Check if it's a greeting followed by just punctuation or whitespace
  const greetingMatch = pureGreetings.find(greeting => 
    normalizedQuery === greeting || normalizedQuery.startsWith(greeting + ' ')
  );
  
  if (greetingMatch) {
    // Check if there's actual content after the greeting
    const afterGreeting = normalizedQuery.substring(greetingMatch.length).trim();
    // If it's just the greeting or greeting + punctuation, it's a pure greeting
    if (afterGreeting.length === 0 || afterGreeting.length < 3) {
      return true;
    }
  }
  
  return false;
}

/**
 * Fast keyword check for obvious cases (bypasses GPT for speed)
 */
function requiresFullContextKeywords(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();

  // Only very obvious patterns that are unambiguous
  const obviousPatterns = [
    // Very clear "all" indicators
    'all nodes',
    'every node',
    'each node',
    'whole tree',
    
    // Clear counting
    'count all',
    'how many nodes',
    'total number of nodes',
    
    // Clear exhaustive operations
    'list all nodes',
    'show all nodes',
    'find all nodes',
    'go through all',
    
    // Clear tree-wide summary (exact phrases)
    'summarize the tree',
    'summarise the tree',
    'overview of the tree',
    'summary of the tree',
  ];

  return obviousPatterns.some(pattern => lowerQuery.includes(pattern));
}

// Shared classification result cache (to avoid calling GPT twice in same request)
// This is reset for each new query, so it only caches within a single classification call
let lastClassification: {
  query: string;
  result: { requiresFullContext: boolean; isSimpleQuery: boolean; isGreeting: boolean; confidence: number };
} | null = null;

/**
 * Reset the per-request classification cache (called at start of each API request)
 */
function resetRequestCache(): void {
  lastClassification = null;
}

/**
 * Classify query once and cache result (used by both requiresFullContext and isSimpleQuery)
 * This ensures we only call GPT once per query, even if both functions are called
 */
async function classifyQuery(query: string): Promise<{
  requiresFullContext: boolean;
  isSimpleQuery: boolean;
  isGreeting: boolean;
  confidence: number;
}> {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Check if we already classified this exact query in this request
  if (lastClassification && lastClassification.query === normalizedQuery) {
    console.log(`[classifyQuery] Reusing cached classification for: "${query.slice(0, 50)}..."`);
    return lastClassification.result;
  }
  
  // If it's a different query, reset cache (ensures fresh classification)
  if (lastClassification && lastClassification.query !== normalizedQuery) {
    resetRequestCache();
  }

  // Fast path: Check obvious keywords first (very fast, no API call)
  const fastFullContext = requiresFullContextKeywords(query);
  const fastSimple = isSimpleQueryKeywords(query);
  const fastGreeting = isGreetingQuery(query);

  if (fastFullContext || fastSimple || fastGreeting) {
    const result = {
      requiresFullContext: fastFullContext,
      isSimpleQuery: fastSimple && !fastFullContext && !fastGreeting, // Can't be both
      isGreeting: fastGreeting && !fastFullContext, // Greetings are not full context
      confidence: 0.95 // High confidence for obvious patterns
    };
    lastClassification = { query: query.toLowerCase().trim(), result };
    return result;
  }

  // If GPT classification is disabled, use fallback
  if (!CONFIG.USE_GPT_CLASSIFICATION) {
    const result = {
      requiresFullContext: requiresFullContextFallback(query),
      isSimpleQuery: isSimpleQueryFallback(query),
      isGreeting: isGreetingQuery(query),
      confidence: 0.8
    };
    lastClassification = { query: query.toLowerCase().trim(), result };
    return result;
  }

  // Slow path: Use GPT for semantic understanding (handles typos, variations)
  try {
    const classification = await classifyQueryWithGPT(query);
    
    const result = {
      requiresFullContext: classification.requiresFullContext,
      isSimpleQuery: classification.isSimpleQuery,
      isGreeting: classification.isGreeting || false,
      confidence: classification.confidence
    };
    
    lastClassification = { query: query.toLowerCase().trim(), result };
    return result;
  } catch (error) {
    console.warn(`[classifyQuery] GPT classification failed, using fallback:`, error);
    const result = {
      requiresFullContext: requiresFullContextFallback(query),
      isSimpleQuery: isSimpleQueryFallback(query),
      isGreeting: isGreetingQuery(query),
      confidence: 0.7 // Lower confidence for fallback
    };
    lastClassification = { query: query.toLowerCase().trim(), result };
    return result;
  }
}

/**
 * Detect if a query requires full context for 100% accuracy
 * Hybrid approach: Fast keyword check for obvious cases, GPT for semantic understanding
 */
export async function requiresFullContext(query: string): Promise<boolean> {
  const classification = await classifyQuery(query);
  
  if (classification.confidence > 0.7) {
    return classification.requiresFullContext;
  } else {
    // Low confidence, use fallback
    console.log(`[requiresFullContext] Low confidence (${classification.confidence}), using fallback`);
    return requiresFullContextFallback(query);
  }
}

/**
 * Fallback keyword matching (comprehensive patterns)
 * Used when GPT fails or is disabled
 */
function requiresFullContextFallback(query: string): boolean {
  const lowerQuery = query.toLowerCase();

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
    'analyse all', // British spelling
    'which nodes',
    
    // Tree overview queries (asking about the tree as a whole)
    'what\'s this tree',
    'what is this tree',
    'what\'s the tree',
    'what is the tree',
    'what\'s this tree about',
    'what is this tree about',
    'what\'s the tree about',
    'what is the tree about',
    'whats this tree', // No apostrophe variation
    'whats the tree',
    'whats this tree about',
    'whats the tree about',
    'tell me about this tree',
    'describe this tree',
    'describe the tree',

    // Summary operations
    'summarize the tree',
    'summarise the tree', // British spelling
    'summarize tree',
    'summarise tree',
    'overview of all',
    'overview of this tree',
    'overview of the tree',
    'summary of this tree',
    'summary of the tree',
    'summary of tree',

    // Searching with "all" modifier
    'search all',
    'look through all',
  ];

  const requiresFull = accuracyKeywords.some((kw) => lowerQuery.includes(kw));

  if (requiresFull) {
    console.log(
      `[requiresFullContext] ✅ Fallback (keywords): "${query.slice(0, 50)}..."`
    );
  }

  return requiresFull;
}

/**
 * Fast keyword check for obvious simple queries (bypasses GPT for speed)
 */
function isSimpleQueryKeywords(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();

  // Only very obvious patterns that are unambiguous
  const obviousPatterns = [
    // Very clear definition requests
    'what is ',
    'what does ',
    'what are ',
    "what's ",
    'explain ',
    'define ',
    
    // Very clear location requests
    'where is ',
    'where can i find ',
    
    // Very clear how-to requests
    'how to ',
    'how do i ',
    'how can i ',
  ];

  // Check if query starts with or contains these patterns (but not tree-wide)
  const hasSimplePattern = obviousPatterns.some(pattern => 
    lowerQuery.startsWith(pattern) || lowerQuery.includes(' ' + pattern)
  );
  
  // Exclude tree-wide queries
  const isTreeWide = lowerQuery.includes('this tree') || lowerQuery.includes('the tree');
  
  return hasSimplePattern && !isTreeWide;
}

/**
 * Detect if a query is simple and can use semantic search
 * Hybrid approach: Fast keyword check for obvious cases, GPT for semantic understanding
 */
export async function isSimpleQuery(query: string): Promise<boolean> {
  const classification = await classifyQuery(query);
  
  if (classification.confidence > 0.7) {
    return classification.isSimpleQuery;
  } else {
    // Low confidence, use fallback
    console.log(`[isSimpleQuery] Low confidence (${classification.confidence}), using fallback`);
    return isSimpleQueryFallback(query);
  }
}

/**
 * Fallback keyword matching (comprehensive patterns)
 * Used when GPT fails or is disabled
 */
function isSimpleQueryFallback(query: string): boolean {
  const lowerQuery = query.toLowerCase();

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
  ];

  // Exclude tree-wide queries from simple classification
  const isTreeWide = lowerQuery.includes('this tree') || 
                     lowerQuery.includes('the tree') ||
                     lowerQuery.includes('whole tree') ||
                     lowerQuery.includes('entire tree');

  if (isTreeWide) {
    return false; // Tree-wide queries are not simple
  }

  const isSimple = simplePatterns.some((pattern) => lowerQuery.includes(pattern));

  if (isSimple) {
    console.log(
      `[isSimpleQuery] ✅ Fallback (keywords): "${query.slice(0, 50)}..."`
    );
  }

  return isSimple;
}

/**
 * Clear classification caches (useful for testing or memory management)
 */
export function clearClassificationCache(): void {
  classificationCache.clear();
  lastClassification = null;
  console.log('[Query Classification] Cache cleared');
}

/**
 * Get cache statistics (useful for monitoring)
 */
export function getCacheStats(): {
  cacheSize: number;
  lastQuery: string | null;
} {
  return {
    cacheSize: classificationCache.size,
    lastQuery: lastClassification?.query || null
  };
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

