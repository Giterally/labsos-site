/**
 * AI Action Handler - Generates action plans using OpenAI function calling
 */

import OpenAI from 'openai'
import { SupabaseClient } from '@supabase/supabase-js'
import { TreeContext, searchNodesAndBlocks } from './tree-context'
import { AI_ACTION_FUNCTIONS, ActionPlan, hasActionIntent, detectBulkOperation } from './ai-action-schemas'
import { formatTreeContextForLLM } from './tree-context'

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set')
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'

/**
 * Calculate max_tokens dynamically based on operation size
 * Ensures sufficient tokens for completion while optimizing for cost
 */
function calculateMaxTokens(
  nodeCount: number,
  isBulkOperation: boolean,
  isEmptyContent: boolean
): number {
  if (!isBulkOperation && !isEmptyContent) {
    // Normal operations: use default
    console.log(`[calculateMaxTokens] Normal operation - using default 16384 tokens`)
    return 16384
  }
  
  // Estimate tokens needed:
  // - Each operation: ~300-500 tokens (function name + arguments JSON)
  // - System prompt: ~500 tokens
  // - User prompt: ~2000-5000 tokens (depends on tree size)
  // - Assistant text: ~500-1000 tokens
  // - Safety margin: 2x to prevent cutoff
  
  const tokensPerOperation = 500
  const baseTokens = 5000
  const estimatedTokens = baseTokens + (nodeCount * tokensPerOperation)
  const withSafetyMargin = estimatedTokens * 2
  
  // Cap at model limit (GPT-4o-mini supports up to 128k, but use 64k to be safe)
  const maxTokens = Math.min(withSafetyMargin, 64000)
  
  console.log(`[calculateMaxTokens] Nodes: ${nodeCount}, Estimated: ${estimatedTokens}, With margin: ${withSafetyMargin}, Final: ${maxTokens}`)
  
  return maxTokens
}

export interface ActionPlanOperation {
  type: string
  target: {
    node_id?: string
    block_id?: string
    node_identifier?: string
    block_identifier?: string
    [key: string]: any
  }
  changes: Record<string, any>
  before?: Record<string, any> // Current values before the change
  confidence: number
  reasoning: string
  operation_id?: string
}

export interface GeneratedActionPlan {
  operations: ActionPlanOperation[]
  summary: string
  estimated_impact: string
}

/**
 * Generate an action plan from user query using OpenAI function calling
 */
export async function generateActionPlan(
  query: string,
  treeContext: TreeContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  agentMode: boolean = true
): Promise<GeneratedActionPlan> {
  const openai = getOpenAIClient()
  
  // For bulk operations, don't truncate content so AI can see everything
  const isBulkOperation = detectBulkOperation(query)
  const formattedContext = formatTreeContextForLLM(treeContext, {
    truncateContent: !isBulkOperation, // Don't truncate for bulk operations
    maxContentLength: isBulkOperation ? undefined : 2000
  })

  // Build system prompt
  const agentModeNote = agentMode 
    ? "AGENT MODE IS ENABLED: You can modify the experiment tree. Generate action plans when users request changes."
    : "AGENT MODE IS DISABLED: You can only answer questions about the tree. Do not generate action plans."
  
  const systemPrompt = `You are an AI assistant that helps users ${agentMode ? 'modify and interact with' : 'understand'} experiment trees. 
${agentMode ? 'You can create, update, delete, and move nodes and blocks in the experiment tree.' : 'You can answer questions about nodes, blocks, and relationships.'}

${agentMode ? `IMPORTANT RULES:
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
- Generate exactly ONE operation per node that needs updating` : 'Answer questions clearly and helpfully about the experiment tree structure.'}`

  // Count nodes with empty content if this is an empty content query
  const isContentEmptyQuery = query.toLowerCase().includes('empty content') || query.toLowerCase().includes('content section is empty')
  let emptyContentNodeCount = 0
  let emptyContentNodesInfo = ''
  let emptyNodesList: Array<{ blockName: string; nodeName: string; position: number; nodeId: string }> = []
  
  // Detect bulk rename operations (user wants to rename all or many nodes)
  // FLEXIBLE DETECTION: Uses regex patterns to match variations like "fix the name nodes" vs "fix the node names"
  function detectBulkRenameQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase()
    
    const renamePatterns = [
      /fix\s+(?:the\s+)?(?:node\s+names?|name\s+nodes?|names?)/i,
      /rename\s+(?:all\s+)?(?:the\s+)?nodes?/i,
      /update\s+(?:all\s+)?(?:the\s+)?(?:node\s+names?|names?)/i,
      /change\s+(?:all\s+)?(?:the\s+)?(?:node\s+names?|names?)/i,
      /(all|every)\s+(?:the\s+)?nodes?.*names?/i,
    ]
    
    const matched = renamePatterns.some(pattern => pattern.test(lowerQuery))
    if (matched) {
      console.log(`[detectBulkRenameQuery] ✅ Matched bulk rename pattern in query: "${query.substring(0, 100)}..."`)
    }
    return matched
  }
  
  // Helper function to extract node names (used by both detection and extraction)
  function extractNodeNamesFromQuery(query: string, conversationHistory: any[]): string[] {
    const seenNames = new Set<string>()
    const extractedNames: string[] = []
    
    // Include last 3 messages from history for better coverage
    const recentHistory = conversationHistory.slice(-3).map(m => m.content).join('\n')
    const allText = `${query}\n${recentHistory}`
    
    // Strategy 1: Match "Node: Name" format (most common)
    const nodeRegex = /^\s*Node:\s*(.+?)\s*$/gim
    let match
    const rawMatches: string[] = []
    
    while ((match = nodeRegex.exec(allText)) !== null) {
      const rawName = match[1]
      rawMatches.push(rawName)
    }
    
    // Clean and filter names from Strategy 1
    for (const name of rawMatches) {
      // Remove trailing "(in BlockName)" if present
      let cleanName = name.replace(/\s*\(in\s+[^)]+\)\s*$/i, '').trim()
      
      // Less aggressive filtering - only filter obvious non-node text
      const isValid = 
        cleanName.length > 3 &&
        !cleanName.match(/^(BLOCK\s+\d+|Block\s+\d+):/i) && // Only filter block headers like "BLOCK 1:"
        !seenNames.has(cleanName)
      
      if (isValid) {
        extractedNames.push(cleanName)
        seenNames.add(cleanName)
      }
    }
    
    // Strategy 2: If Strategy 1 found few results, try line-by-line extraction
    if (extractedNames.length < 10) {
      const lines = allText.split('\n')
      let inNodeSection = false
      
      for (const line of lines) {
        const trimmed = line.trim()
        
        // Detect section start (BLOCK X:)
        if (trimmed.match(/^BLOCK\s+\d+:/i)) {
          inNodeSection = true
          continue
        }
        
        // In node section, any non-empty line that's not a block header is likely a node name
        if (inNodeSection && trimmed.length > 3) {
          // Skip block headers and already extracted names
          if (!trimmed.match(/^BLOCK\s+\d+:/i) && !seenNames.has(trimmed)) {
            // Remove "Node:" prefix if present
            const cleanName = trimmed.replace(/^Node:\s*/i, '').trim()
            if (cleanName.length > 3 && !seenNames.has(cleanName) && !cleanName.match(/^(BLOCK\s+\d+|Block\s+\d+):/i)) {
              extractedNames.push(cleanName)
              seenNames.add(cleanName)
            }
          }
        }
      }
    }
    
    return extractedNames
  }
  
  // Fallback detection: Check if user provided a list of node names (even without explicit keywords)
  function detectBulkRenameFromContent(
    query: string, 
    conversationHistory: any[], 
    totalNodeCount: number
  ): { isBulkRename: boolean; extractedNames: string[] } {
    const extractedNames = extractNodeNamesFromQuery(query, conversationHistory)
    const coverageThreshold = 0.8 // 80% coverage
    const minCoverage = totalNodeCount * coverageThreshold
    
    if (extractedNames.length >= minCoverage) {
      console.log(`[detectBulkRenameFromContent] ✅ Found ${extractedNames.length} names (${((extractedNames.length / totalNodeCount) * 100).toFixed(0)}% coverage) - treating as bulk rename`)
      return { isBulkRename: true, extractedNames }
    }
    
    return { isBulkRename: false, extractedNames: [] }
  }
  
  const totalNodeCount = treeContext.blocks.reduce((sum, block) => sum + block.nodes.length, 0)
  
  // Step 1: Try phrase-based detection
  let isBulkRenameQuery = detectBulkRenameQuery(query)
  let extractedNames: string[] = []
  
  // Step 2: Fallback to content-based detection if phrase detection failed
  if (!isBulkRenameQuery && totalNodeCount > 0) {
    const contentDetection = detectBulkRenameFromContent(query, conversationHistory, totalNodeCount)
    if (contentDetection.isBulkRename) {
      isBulkRenameQuery = true
      extractedNames = contentDetection.extractedNames
      console.log(`[generateActionPlan] Fallback detection: Content-based bulk rename detected with ${extractedNames.length} names`)
    }
  }
  
  // IMPROVED EXTRACTION: For bulk rename, try to extract names FIRST before calling AI
  // If we have a complete list, skip AI entirely and generate operations directly
  let shouldSkipAI = false
  
  if (isBulkRenameQuery) {
    // Extract if not done yet (phrase detection succeeded but extraction wasn't done)
    if (extractedNames.length === 0) {
      extractedNames = extractNodeNamesFromQuery(query, conversationHistory)
    }
    // Names already extracted during detection phase, just log the results
    console.log(`[generateActionPlan] Bulk rename detected - using extracted names`)
    console.log(`[generateActionPlan] Extracted ${extractedNames.length} names from query/history`)
    console.log(`[generateActionPlan] Total nodes in tree: ${totalNodeCount}`)
    if (extractedNames.length > 0) {
      console.log(`[generateActionPlan] First 5 extracted names:`, extractedNames.slice(0, 5))
      console.log(`[generateActionPlan] Last 5 extracted names:`, extractedNames.slice(-5))
    }
    
    // If we have a complete list, skip AI and generate operations directly
    if (extractedNames.length >= totalNodeCount) {
      console.log(`[generateActionPlan] ✅ Complete list detected (${extractedNames.length} names for ${totalNodeCount} nodes) - SKIPPING AI, generating operations directly`)
      shouldSkipAI = true
    } else {
      console.log(`[generateActionPlan] ⚠️ Incomplete list (${extractedNames.length} < ${totalNodeCount}) - will use AI but try to fill gaps`)
      console.log(`[generateActionPlan] Missing ${totalNodeCount - extractedNames.length} names`)
    }
  }
  
  if (isContentEmptyQuery) {
    for (const block of treeContext.blocks) {
      for (const node of block.nodes) {
        if (!node.content || node.content.trim().length === 0) {
          emptyNodesList.push({
            blockName: block.name,
            nodeName: node.name,
            position: node.position,
            nodeId: node.id
          })
        }
      }
    }
    emptyContentNodeCount = emptyNodesList.length
    
    console.log(`[generateActionPlan] Found ${emptyContentNodeCount} nodes with empty content`)
    
    if (emptyNodesList.length > 0) {
      emptyContentNodesInfo = `\n\n═══════════════════════════════════════════════════════════════\n`
      emptyContentNodesInfo += `NODES WITH EMPTY CONTENT (${emptyNodesList.length} total) - YOU MUST UPDATE ALL OF THESE:\n`
      emptyContentNodesInfo += `═══════════════════════════════════════════════════════════════\n`
      emptyNodesList.forEach((nodeInfo, idx) => {
        emptyContentNodesInfo += `${idx + 1}. Node: "${nodeInfo.nodeName}" (Position: ${nodeInfo.position}) in Block: "${nodeInfo.blockName}"\n`
      })
      emptyContentNodesInfo += `\n⚠️ CRITICAL REQUIREMENT: You MUST call update_node function ${emptyNodesList.length} times - once for EACH node listed above.\n`
      emptyContentNodesInfo += `Do NOT skip any nodes. Generate ${emptyNodesList.length} function calls total.\n`
      emptyContentNodesInfo += `═══════════════════════════════════════════════════════════════\n`
    }
  }

  // Build messages
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    {
      role: 'user',
      content: `Here is the current experiment tree structure:\n\n${formattedContext}${emptyContentNodesInfo}\n\nUser request: ${query}\n\nIMPORTANT: You must call action functions (like update_node, create_node, delete_node, etc.) to fulfill this request. You can use search_nodes or search_blocks first to find items, but you MUST follow up with an action function call. Do not just respond with text - you must use function calls.

${isContentEmptyQuery ? `\n\n🚨🚨🚨 CRITICAL INSTRUCTIONS FOR EMPTY CONTENT OPERATION 🚨🚨🚨\n\nThe user is asking to update nodes with EMPTY content. There are EXACTLY ${emptyContentNodeCount} nodes with empty content.\n\nYOU MUST:\n1. Call update_node function EXACTLY ${emptyContentNodeCount} times\n2. One function call for EACH node listed in the "NODES WITH EMPTY CONTENT" section above\n3. Do NOT skip any nodes - you must update ALL ${emptyContentNodeCount} nodes\n4. If you generate fewer than ${emptyContentNodeCount} function calls, the operation will FAIL\n5. Use the exact node identifiers from the list above (node name + block name + position)\n6. For nodes with the same name, use the block name and position to distinguish them (e.g., "OVERVIEW node at position 5 in Protocol Block")\n\nThe nodes with empty content are clearly marked as "Content: (empty)" in the tree context above.\nDo NOT generate operations for nodes that already have content.\n\n⚠️ REMEMBER: ${emptyContentNodeCount} function calls required - no exceptions! 🚨🚨🚨` : ''}

${isBulkRenameQuery ? `\n\n🚨🚨🚨 CRITICAL INSTRUCTIONS FOR BULK RENAME OPERATION 🚨🚨🚨\n\nThe user is asking to rename/update node names. There are EXACTLY ${totalNodeCount} nodes in the tree.\n\nYOU MUST:\n1. Call update_node function EXACTLY ${totalNodeCount} times - once for EACH node in the tree\n2. One function call for EACH node listed in the tree context above\n3. Do NOT skip any nodes - you must update ALL ${totalNodeCount} nodes\n4. If you generate fewer than ${totalNodeCount} function calls, the operation will FAIL\n5. Use the exact node identifiers from the tree context (node name + block name + position)\n6. For nodes with the same name, use the block name and position to distinguish them\n7. If the user provided a list of new names in a previous message, match each old node name to its corresponding new name from that list\n8. Look through the conversation history to find the list of new node names the user provided\n\n⚠️ REMEMBER: ${totalNodeCount} function calls required - no exceptions! You must rename ALL nodes! 🚨🚨🚨` : ''}`
    }
  ]

  // Extract function calls from response
  let operations: ActionPlanOperation[] = []
  let assistantMessage = ''
  
  // If we have a complete list for bulk rename, skip AI and generate operations directly
  if (shouldSkipAI && extractedNames.length >= totalNodeCount) {
    console.log(`[generateActionPlan] Generating ${totalNodeCount} rename operations directly from extracted names`)
    
    // Generate operations for ALL nodes, matching names by block order and position
    let nameIndex = 0
    for (const block of treeContext.blocks) {
      // Sort nodes by position within the block
      const sortedNodes = [...block.nodes].sort((a, b) => a.position - b.position)
      
      for (const node of sortedNodes) {
        if (nameIndex < extractedNames.length) {
          const newName = extractedNames[nameIndex]
          nameIndex++
          
          // Create the operation
          const renameOperation: ActionPlanOperation = {
            type: 'update_node',
            target: {
              node_id: node.id,
              node_identifier: `${node.name} at position ${node.position} in ${block.name}`,
              node_name: node.name,
              block_name: block.name
            },
            changes: {
              name: newName
            },
            confidence: 0.95, // Very high confidence when we have a complete list
            reasoning: `Bulk rename: direct extraction from user-provided list`,
            operation_id: `bulk_rename_${Date.now()}_${Math.random()}`
          }
          
          // Get the "before" state
          renameOperation.before = {
            name: node.name,
            description: node.description,
            node_type: node.type,
            position: node.position,
            content: node.content,
            status: node.status
          }
          
          operations.push(renameOperation)
          console.log(`[generateActionPlan] ✅ Generated rename: "${node.name}" -> "${newName}" (Block: ${block.name}, Pos: ${node.position})`)
        }
      }
    }
    
    console.log(`[generateActionPlan] ✅ Generated ${operations.length} rename operations for all ${totalNodeCount} nodes (skipped AI)`)
    
    // Generate summary and return early
    const summary = `Plan to rename all ${totalNodeCount} nodes`
    const estimated_impact = `This will rename all ${totalNodeCount} node(s) in the experiment tree.`
    
    return {
      operations,
      summary,
      estimated_impact,
    }
  }
  
  // Otherwise, proceed with AI generation
  // Call OpenAI with function calling
  // Force function calling if agent mode is enabled and query has action intent
  const toolChoice = agentMode && hasActionIntent(query) ? 'required' : 'auto'
  
  // Calculate dynamic token limit based on operation size
  const maxTokens = calculateMaxTokens(totalNodeCount, isBulkOperation, isContentEmptyQuery)
  
  console.log(`[generateActionPlan] Calling OpenAI with tool_choice: ${toolChoice}, agentMode: ${agentMode}, hasActionIntent: ${hasActionIntent(query)}, max_tokens: ${maxTokens}`)
  
  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    tools: AI_ACTION_FUNCTIONS.map(func => ({
      type: 'function' as const,
      function: {
        name: func.name,
        description: func.description,
        parameters: func.parameters
      }
    })),
    tool_choice: toolChoice,
    temperature: 0.3, // Lower temperature for more consistent plans
    max_tokens: maxTokens, // Dynamic token limit based on operation size
  })

  if (response.choices[0]?.message) {
    const message = response.choices[0].message
    assistantMessage = message.content || ''
    
    console.log(`[generateActionPlan] OpenAI response - content: "${assistantMessage.substring(0, 100)}...", tool_calls: ${message.tool_calls?.length || 0}`)

    // Process tool calls
    if (message.tool_calls) {
      console.log(`[generateActionPlan] Processing ${message.tool_calls.length} tool call(s)`)
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name
          let functionArgs: any = {}
          
          try {
            functionArgs = JSON.parse(toolCall.function.arguments)
          } catch (error) {
            console.error('Failed to parse function arguments:', error)
            continue
          }

          // Handle search functions specially - they return results, not operations
          if (functionName === 'search_nodes' || functionName === 'search_blocks') {
            console.log(`[generateActionPlan] Search function called: ${functionName}`)
            const searchQuery = functionArgs.query || ''
            const limit = functionArgs.limit || 10
            const results = searchNodesAndBlocks(treeContext, searchQuery, { limit })
            
            // Add search results to assistant message for context
            if (functionName === 'search_nodes' && results.nodes.length > 0) {
              assistantMessage += `\n\nFound ${results.nodes.length} node(s):\n`
              results.nodes.forEach((node, idx) => {
                assistantMessage += `${idx + 1}. "${node.name}" (ID: ${node.node_id}, confidence: ${(node.confidence * 100).toFixed(0)}%)\n`
              })
            }
            if (functionName === 'search_blocks' && results.blocks.length > 0) {
              assistantMessage += `\n\nFound ${results.blocks.length} block(s):\n`
              results.blocks.forEach((block, idx) => {
                assistantMessage += `${idx + 1}. "${block.name}" (ID: ${block.block_id}, confidence: ${(block.confidence * 100).toFixed(0)}%)\n`
              })
            }
            continue
          }
          
          console.log(`[generateActionPlan] Action function called: ${functionName}`, functionArgs)

          // For action functions, create operation
          const operation: ActionPlanOperation = {
            type: functionName,
            target: {},
            changes: {},
            confidence: 0.8, // Default confidence, can be improved with validation
            reasoning: `User requested: ${query}`,
            operation_id: `op_${toolCall.id}`
          }

          // Extract target identifiers - resolve block first if provided, as it helps with node resolution
          if (functionArgs.block_identifier) {
            operation.target.block_identifier = functionArgs.block_identifier
            // Try to resolve to actual block_id
            const searchResults = searchNodesAndBlocks(treeContext, functionArgs.block_identifier, { limit: 1 })
            if (searchResults.blocks.length > 0) {
              operation.target.block_id = searchResults.blocks[0].block_id
              operation.confidence = searchResults.blocks[0].confidence
              console.log(`[generateActionPlan] Resolved block_identifier "${functionArgs.block_identifier}" to block_id: ${operation.target.block_id}`)
            } else {
              console.warn(`[generateActionPlan] Could not resolve block_identifier: "${functionArgs.block_identifier}" - will try to resolve during execution`)
            }
          }
          if (functionArgs.block_id) {
            operation.target.block_id = functionArgs.block_id
          }
          
          // Now resolve node_identifier, using block context if available
          if (functionArgs.node_identifier) {
            operation.target.node_identifier = functionArgs.node_identifier
            // Try to resolve to actual node_id
            // If we have block context, use it to narrow the search
            let searchQuery = functionArgs.node_identifier
            const blockId = operation.target.block_id || functionArgs.block_id
            if (functionArgs.block_identifier || blockId) {
              // If block is specified, include it in the search query for better matching
              const blockName = functionArgs.block_identifier || 
                (blockId ? treeContext.blocks.find(b => b.id === blockId)?.name : '')
              if (blockName) {
                searchQuery = `${functionArgs.node_identifier} in ${blockName}`
              }
            }
            
            const searchResults = searchNodesAndBlocks(treeContext, searchQuery, { limit: 5 }) // Get more results to find the best match
            
            // If we have block_id, filter results to that block
            let filteredResults = searchResults.nodes
            if (blockId) {
              filteredResults = searchResults.nodes.filter(n => n.block_id === blockId)
            }
            
            if (filteredResults.length > 0) {
              // Use the highest confidence match
              operation.target.node_id = filteredResults[0].node_id
              operation.confidence = filteredResults[0].confidence
              console.log(`[generateActionPlan] Resolved node_identifier "${functionArgs.node_identifier}" to node_id: ${operation.target.node_id} (confidence: ${(operation.confidence * 100).toFixed(0)}%)`)
              if (filteredResults.length > 1) {
                console.log(`[generateActionPlan] Warning: Found ${filteredResults.length} matches for "${functionArgs.node_identifier}", using highest confidence match`)
              }
            } else if (searchResults.nodes.length > 0) {
              // Fallback to any match if block filtering removed all results
              operation.target.node_id = searchResults.nodes[0].node_id
              operation.confidence = searchResults.nodes[0].confidence
              console.log(`[generateActionPlan] Resolved node_identifier "${functionArgs.node_identifier}" to node_id: ${operation.target.node_id} (no block match, using first result)`)
            } else {
              console.warn(`[generateActionPlan] Could not resolve node_identifier: "${functionArgs.node_identifier}" - will try to resolve during execution`)
            }
          }
          if (functionArgs.target_block_id) {
            operation.target.target_block_id = functionArgs.target_block_id
          }

          // Extract changes based on function type
          if (functionArgs.changes) {
            operation.changes = functionArgs.changes
          } else {
            // For functions without explicit changes object, extract all non-identifier params
            Object.keys(functionArgs).forEach(key => {
              if (!['node_identifier', 'block_identifier', 'from_node_identifier', 'to_node_identifier'].includes(key)) {
                operation.changes[key] = functionArgs[key]
              }
            })
          }

          // Special handling for specific function types
          if (functionName === 'move_node') {
            operation.changes.target_block_id = functionArgs.target_block_id
            operation.changes.new_position = functionArgs.new_position
          }
          if (functionName === 'reorder_blocks') {
            operation.changes.block_positions = functionArgs.block_positions
          }

          // Capture "before" state and target name for update operations
          if (functionName === 'update_node' && operation.target.node_id) {
            // Find the node in treeContext to get current values
            for (const block of treeContext.blocks) {
              const node = block.nodes.find(n => n.id === operation.target.node_id)
              if (node) {
                operation.target.node_name = node.name // Store node name for display
                operation.target.block_name = block.name // Store block name for context
                operation.before = {
                  name: node.name,
                  description: node.description,
                  node_type: node.type,
                  position: node.position,
                  content: node.content,
                  status: node.status
                }
                break
              }
            }
          } else if (functionName === 'update_block' && operation.target.block_id) {
            // Find the block in treeContext to get current values
            const block = treeContext.blocks.find(b => b.id === operation.target.block_id)
            if (block) {
              operation.target.block_name = block.name // Store block name for display
              operation.before = {
                name: block.name,
                type: block.type,
                position: block.position
              }
            }
          } else if (functionName === 'update_node_content' && operation.target.node_id) {
            // Find the node in treeContext to get current content
            for (const block of treeContext.blocks) {
              const node = block.nodes.find(n => n.id === operation.target.node_id)
              if (node) {
                operation.target.node_name = node.name // Store node name for display
                operation.target.block_name = block.name // Store block name for context
                operation.before = {
                  content: node.content || '(empty)'
                }
                break
              }
            }
          } else if (functionName === 'delete_node' && operation.target.node_id) {
            // Find the node to show what will be deleted
            for (const block of treeContext.blocks) {
              const node = block.nodes.find(n => n.id === operation.target.node_id)
              if (node) {
                operation.target.node_name = node.name
                operation.target.block_name = block.name
                break
              }
            }
          } else if (functionName === 'delete_block' && operation.target.block_id) {
            // Find the block to show what will be deleted
            const block = treeContext.blocks.find(b => b.id === operation.target.block_id)
            if (block) {
              operation.target.block_name = block.name
            }
          } else if (functionName === 'move_node' && operation.target.node_id) {
            // Find the node to show what will be moved
            for (const block of treeContext.blocks) {
              const node = block.nodes.find(n => n.id === operation.target.node_id)
              if (node) {
                operation.target.node_name = node.name
                operation.target.block_name = block.name
                // Find target block name if provided
                if (operation.changes.target_block_id) {
                  const targetBlock = treeContext.blocks.find(b => b.id === operation.changes.target_block_id)
                  if (targetBlock) {
                    operation.target.target_block_name = targetBlock.name
                  }
                }
                break
              }
            }
          }

          // Validate operation has required IDs before adding
          const requiresNodeId = ['update_node', 'delete_node', 'move_node', 'update_node_content', 'add_link', 'remove_link', 'add_attachment', 'remove_attachment', 'add_dependency', 'remove_dependency'].includes(functionName)
          const requiresBlockId = ['update_block', 'delete_block'].includes(functionName)
          
          if (requiresNodeId && !operation.target.node_id && !operation.target.node_identifier) {
            console.error(`[generateActionPlan] Operation ${functionName} requires node_id or node_identifier, but neither was provided. Function args:`, functionArgs)
            // Don't add invalid operations
            continue
          }
          
          if (requiresBlockId && !operation.target.block_id && !operation.target.block_identifier) {
            console.error(`[generateActionPlan] Operation ${functionName} requires block_id or block_identifier, but neither was provided. Function args:`, functionArgs)
            // Don't add invalid operations
            continue
          }

          operations.push(operation)
          console.log(`[generateActionPlan] Added operation: ${functionName}, node_id: ${operation.target.node_id || operation.target.node_identifier || 'none'}, block_id: ${operation.target.block_id || operation.target.block_identifier || 'none'}`)
        }
      }
    }
  }

  // Post-process operations: filter and deduplicate
  // isContentEmptyQuery and isBulkRenameQuery are already defined above
  
  if (isContentEmptyQuery) {
    // Filter out operations for nodes that already have content
    const filteredOperations: ActionPlanOperation[] = []
    const seenNodeIds = new Set<string>()
    
    for (const operation of operations) {
      // Only process update_node operations
      if (operation.type !== 'update_node' || !operation.target.node_id) {
        filteredOperations.push(operation)
        continue
      }
      
      // Find the node in treeContext to check if content is empty
      let nodeHasContent = false
      for (const block of treeContext.blocks) {
        const node = block.nodes.find(n => n.id === operation.target.node_id)
        if (node) {
          nodeHasContent = node.content && node.content.trim().length > 0
          break
        }
      }
      
      // Only include operations for nodes with empty content
      if (!nodeHasContent) {
        // Deduplicate: if we've seen this node_id before, replace the previous operation
        if (seenNodeIds.has(operation.target.node_id)) {
          const existingIndex = filteredOperations.findIndex(
            op => op.type === 'update_node' && op.target.node_id === operation.target.node_id
          )
          if (existingIndex >= 0) {
            console.log(`[generateActionPlan] Deduplicating: replacing operation for node_id ${operation.target.node_id}`)
            filteredOperations[existingIndex] = operation
          }
        } else {
          seenNodeIds.add(operation.target.node_id)
          filteredOperations.push(operation)
          console.log(`[generateActionPlan] Including operation for node_id ${operation.target.node_id} (content is empty)`)
        }
      } else {
        console.log(`[generateActionPlan] Filtering out operation for node_id ${operation.target.node_id} (content already exists)`)
      }
    }
    
    operations = filteredOperations
    console.log(`[generateActionPlan] After filtering: ${operations.length} operations for nodes with empty content (expected: ${emptyContentNodeCount})`)
    
    if (operations.length < emptyContentNodeCount) {
      console.warn(`[generateActionPlan] ⚠️ WARNING: Only ${operations.length} operations after filtering, but ${emptyContentNodeCount} nodes have empty content!`)
      console.warn(`[generateActionPlan] Missing operations for ${emptyContentNodeCount - operations.length} nodes`)
      
      // Log which nodes are missing
      const processedNodeIds = new Set(operations.map(op => op.target.node_id).filter(Boolean))
      const missingNodes = emptyNodesList.filter(node => !processedNodeIds.has(node.nodeId))
      console.warn(`[generateActionPlan] Missing nodes:`, missingNodes.map(n => `"${n.nodeName}" in "${n.blockName}" (pos ${n.position})`))
      
      // Automatically generate missing operations
      console.log(`[generateActionPlan] 🔧 Auto-generating ${missingNodes.length} missing operations...`)
      for (const missingNode of missingNodes) {
        // Find the node in treeContext to get its description
        let nodeDescription = ''
        for (const block of treeContext.blocks) {
          const node = block.nodes.find(n => n.id === missingNode.nodeId)
          if (node) {
            nodeDescription = node.description || ''
            break
          }
        }
        
        // Generate a summary for the description (one-line summary of what will be in content)
        // Use first sentence or first 100 chars, or create a simple summary
        let summaryDescription = ''
        if (nodeDescription) {
          // Try to get first sentence
          const firstSentence = nodeDescription.split(/[.!?]\s/)[0]
          if (firstSentence && firstSentence.length <= 150) {
            summaryDescription = firstSentence.trim()
          } else {
            // Use first 100 chars with ellipsis
            summaryDescription = nodeDescription.substring(0, 100).trim() + (nodeDescription.length > 100 ? '...' : '')
          }
        } else {
          summaryDescription = `Summary of ${missingNode.nodeName.toLowerCase()}`
        }
        
        // Create the operation
        const autoOperation: ActionPlanOperation = {
          type: 'update_node',
          target: {
            node_id: missingNode.nodeId,
            node_identifier: `${missingNode.nodeName} at position ${missingNode.position} in ${missingNode.blockName}`,
            node_name: missingNode.nodeName,
            block_name: missingNode.blockName
          },
          changes: {
            content: nodeDescription, // Move description to content
            description: summaryDescription // One-line summary
          },
          confidence: 0.9, // High confidence since we know this node needs updating
          reasoning: `Auto-generated operation for node with empty content: ${missingNode.nodeName} in ${missingNode.blockName}`,
          operation_id: `auto_op_${Date.now()}_${Math.random()}`
        }
        
        // Get the "before" state
        for (const block of treeContext.blocks) {
          const node = block.nodes.find(n => n.id === missingNode.nodeId)
          if (node) {
            autoOperation.before = {
              name: node.name,
              description: node.description,
              node_type: node.type,
              position: node.position,
              content: node.content || '(empty)',
              status: node.status
            }
            break
          }
        }
        
        operations.push(autoOperation)
        console.log(`[generateActionPlan] ✅ Auto-generated operation for node_id ${missingNode.nodeId} (${missingNode.nodeName} in ${missingNode.blockName})`)
      }
      
      console.log(`[generateActionPlan] ✅ Total operations after auto-generation: ${operations.length} (expected: ${emptyContentNodeCount})`)
    }
  } else if (isBulkRenameQuery && !shouldSkipAI) {
    // CRITICAL: Ensure ALL nodes are processed for bulk rename
    const renameOperations = operations.filter(op => op.type === 'update_node' && op.changes.name)
    const processedNodeIds = new Set(renameOperations.map(op => op.target.node_id).filter(Boolean))
    
    console.log(`[generateActionPlan] Bulk rename: AI generated ${renameOperations.length} operations, ${processedNodeIds.size} unique nodes`)
    console.log(`[generateActionPlan] Processed ${processedNodeIds.size}/${totalNodeCount} nodes`)
    
    if (processedNodeIds.size < totalNodeCount) {
      console.warn(`[generateActionPlan] ⚠️ INCOMPLETE: Need to generate ${totalNodeCount - processedNodeIds.size} more operations`)
      
      // Get missing nodes
      const missingNodes: Array<{ nodeId: string; nodeName: string; blockName: string; position: number }> = []
      for (const block of treeContext.blocks) {
        // Sort nodes by position for consistent ordering
        const sortedNodes = [...block.nodes].sort((a, b) => a.position - b.position)
        for (const node of sortedNodes) {
          if (!processedNodeIds.has(node.id)) {
            missingNodes.push({
              nodeId: node.id,
              nodeName: node.name,
              blockName: block.name,
              position: node.position
            })
          }
        }
      }
      
      console.log(`[generateActionPlan] Missing ${missingNodes.length} nodes:`, missingNodes.map(n => `"${n.nodeName}" in "${n.blockName}" (pos ${n.position})`).slice(0, 5), missingNodes.length > 5 ? '...' : '')
      
      // Strategy 1: Try to fill with extracted names (if available)
      if (extractedNames.length > processedNodeIds.size) {
        console.log(`[generateActionPlan] Strategy 1: Filling gaps with extracted names (have ${extractedNames.length} names, ${processedNodeIds.size} used)`)
        
        const unusedNames = extractedNames.slice(processedNodeIds.size)
        let nameIndex = 0
        
        for (const node of missingNodes) {
          if (nameIndex < unusedNames.length) {
            const newName = unusedNames[nameIndex]
            nameIndex++
            
            const renameOperation: ActionPlanOperation = {
              type: 'update_node',
              target: {
                node_id: node.nodeId,
                node_identifier: `${node.nodeName} at position ${node.position} in ${node.blockName}`,
                node_name: node.nodeName,
                block_name: node.blockName
              },
              changes: {
                name: newName
              },
              confidence: 0.85,
              reasoning: `Bulk rename: filling gap from extracted names`,
              operation_id: `bulk_rename_gap_${Date.now()}_${Math.random()}`
            }
            
            // Get before state
            for (const block of treeContext.blocks) {
              const foundNode = block.nodes.find(n => n.id === node.nodeId)
              if (foundNode) {
                renameOperation.before = {
                  name: foundNode.name,
                  description: foundNode.description,
                  node_type: foundNode.type,
                  position: foundNode.position,
                  content: foundNode.content,
                  status: foundNode.status
                }
                break
              }
            }
            
            operations.push(renameOperation)
            processedNodeIds.add(node.nodeId)
            console.log(`[generateActionPlan] ✅ Filled gap with extracted name: "${node.nodeName}" -> "${newName}"`)
          }
        }
        
        console.log(`[generateActionPlan] Strategy 1: Added ${nameIndex} operations from extracted names`)
      }
      
      // Strategy 2: If still missing operations, make explicit AI completion call
      const stillMissing = missingNodes.filter(node => !processedNodeIds.has(node.nodeId))
      
      if (stillMissing.length > 0) {
        console.warn(`[generateActionPlan] CRITICAL: Still missing ${stillMissing.length} operations. Making explicit AI completion call.`)
        
        // Build explicit prompt for missing nodes
        const missingNodesList = stillMissing
          .map((n, i) => {
            const block = treeContext.blocks.find(b => b.name === n.blockName)
            return `${i + 1}. Node "${n.nodeName}" (ID: ${n.nodeId}, Block: "${n.blockName}", Position: ${n.position})`
          })
          .join('\n')
        
        const completionPrompt = `CRITICAL COMPLETION TASK:

You previously generated ${processedNodeIds.size} update_node operations, but there are ${totalNodeCount} nodes total in the tree.

You MUST generate update_node operations for these ${stillMissing.length} missing nodes:

${missingNodesList}

Original user request: ${query}

${extractedNames.length > 0 ? `\nNote: The user provided a list of new names. Here are the remaining names (if any):\n${extractedNames.slice(processedNodeIds.size).slice(0, stillMissing.length).map((name, i) => `${i + 1}. ${name}`).join('\n')}` : ''}

Generate EXACTLY ${stillMissing.length} update_node function calls, one for each node listed above.
Use the exact node IDs provided. Do NOT skip any nodes. If you have new names from the user's list, match them to nodes in order.`

        // Make completion call
        const completionMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          {
            role: 'user',
            content: `Here is the current experiment tree structure:\n\n${formattedContext}\n\n${completionPrompt}`
          }
        ]
        
        try {
          const openai = getOpenAIClient()
          const completionMaxTokens = calculateMaxTokens(stillMissing.length, true, false)
          
          console.log(`[generateActionPlan] Making completion call with max_tokens: ${completionMaxTokens}`)
          
          const completionResponse = await openai.chat.completions.create({
            model: CHAT_MODEL,
            messages: completionMessages,
            tools: AI_ACTION_FUNCTIONS.map(func => ({
              type: 'function' as const,
              function: {
                name: func.name,
                description: func.description,
                parameters: func.parameters
              }
            })),
            tool_choice: 'required',
            max_tokens: completionMaxTokens,
            temperature: 0.1 // Very low temperature for consistency
          })
          
          const completionCalls = completionResponse.choices[0]?.message?.tool_calls || []
          console.log(`[generateActionPlan] Completion call generated ${completionCalls.length} additional operations`)
          
          // Process completion operations
          for (const toolCall of completionCalls) {
            if (toolCall.type === 'function' && toolCall.function.name === 'update_node') {
              try {
                const args = JSON.parse(toolCall.function.arguments)
                const targetNodeId = args.node_identifier ? 
                  (() => {
                    // Try to resolve identifier
                    const searchResults = searchNodesAndBlocks(treeContext, args.node_identifier, { limit: 1 })
                    return searchResults.nodes[0]?.node_id
                  })() : 
                  args.node_id
                
                if (targetNodeId && stillMissing.some(n => n.nodeId === targetNodeId)) {
                  // Resolve to actual node_id if needed
                  let finalNodeId = targetNodeId
                  if (!finalNodeId) {
                    const searchResults = searchNodesAndBlocks(treeContext, args.node_identifier || '', { limit: 1 })
                    if (searchResults.nodes.length > 0) {
                      finalNodeId = searchResults.nodes[0].node_id
                    }
                  }
                  
                  if (finalNodeId) {
                    const missingNode = stillMissing.find(n => n.nodeId === finalNodeId)
                    if (missingNode) {
                      const completionOperation: ActionPlanOperation = {
                        type: 'update_node',
                        target: {
                          node_id: finalNodeId,
                          node_identifier: `${missingNode.nodeName} at position ${missingNode.position} in ${missingNode.blockName}`,
                          node_name: missingNode.nodeName,
                          block_name: missingNode.blockName
                        },
                        changes: args.changes || {},
                        confidence: 0.8,
                        reasoning: `Bulk rename: completion call for missing node`,
                        operation_id: `bulk_rename_completion_${Date.now()}_${Math.random()}`
                      }
                      
                      // Get before state
                      for (const block of treeContext.blocks) {
                        const foundNode = block.nodes.find(n => n.id === finalNodeId)
                        if (foundNode) {
                          completionOperation.before = {
                            name: foundNode.name,
                            description: foundNode.description,
                            node_type: foundNode.type,
                            position: foundNode.position,
                            content: foundNode.content,
                            status: foundNode.status
                          }
                          break
                        }
                      }
                      
                      operations.push(completionOperation)
                      processedNodeIds.add(finalNodeId)
                      console.log(`[generateActionPlan] ✅ Added completion operation for node_id ${finalNodeId} (${missingNode.nodeName})`)
                    }
                  }
                }
              } catch (error) {
                console.error(`[generateActionPlan] Error processing completion tool call:`, error)
              }
            }
          }
          
          console.log(`[generateActionPlan] After completion call: ${processedNodeIds.size}/${totalNodeCount} nodes processed`)
          
        } catch (error) {
          console.error(`[generateActionPlan] Completion call failed:`, error)
          // Don't throw - return partial results with warning
        }
      }
      
      // Final verification
      const finalProcessedCount = new Set(operations.filter(op => op.type === 'update_node' && op.changes.name).map(op => op.target.node_id).filter(Boolean)).size
      
      if (finalProcessedCount < totalNodeCount) {
        console.warn(`[generateActionPlan] WARNING: Only processed ${finalProcessedCount}/${totalNodeCount} nodes after all strategies`)
      } else {
        console.log(`[generateActionPlan] ✅ SUCCESS: All ${totalNodeCount} nodes processed after gap filling`)
      }
    } else {
      console.log(`[generateActionPlan] ✅ SUCCESS: All ${totalNodeCount} nodes processed (no gap filling needed)`)
    }
  } else {
    // For non-content-empty queries, still deduplicate operations on the same node_id
    const deduplicatedOperations: ActionPlanOperation[] = []
    const seenNodeIds = new Map<string, ActionPlanOperation>()
    
    for (const operation of operations) {
      if (operation.target.node_id) {
        // If we've seen this node_id, keep the last operation (most recent)
        if (seenNodeIds.has(operation.target.node_id)) {
          console.log(`[generateActionPlan] Deduplicating: replacing operation for node_id ${operation.target.node_id}`)
        }
        seenNodeIds.set(operation.target.node_id, operation)
      } else {
        // Operations without node_id can't be deduplicated, include them
        deduplicatedOperations.push(operation)
      }
    }
    
    // Add all deduplicated operations
    deduplicatedOperations.push(...Array.from(seenNodeIds.values()))
    operations = deduplicatedOperations
    console.log(`[generateActionPlan] After deduplication: ${operations.length} operations`)
  }

  // Generate summary and impact estimate with completion verification
  let summary = operations.length > 0
    ? `Plan to ${operations.map(op => op.type.replace(/_/g, ' ')).join(', ')}`
    : 'No operations planned'
  
  let estimated_impact = operations.length > 0
    ? `This will affect ${operations.length} operation(s) in the experiment tree.`
    : 'No changes will be made.'
  
  // Add completion verification for bulk operations
  if (isBulkRenameQuery) {
    const finalRenameOps = operations.filter(op => op.type === 'update_node' && op.changes.name)
    const finalProcessedCount = new Set(finalRenameOps.map(op => op.target.node_id).filter(Boolean)).size
    
    if (finalProcessedCount >= totalNodeCount) {
      summary += `\n\n✅ All ${totalNodeCount} nodes processed successfully.`
    } else {
      summary += `\n\n⚠️ WARNING: Only ${finalProcessedCount} of ${totalNodeCount} nodes were processed. Some nodes may have been skipped.`
      estimated_impact += ` ⚠️ Incomplete operation - ${totalNodeCount - finalProcessedCount} nodes were not processed.`
    }
  } else if (isContentEmptyQuery) {
    const finalContentOps = operations.filter(op => op.type === 'update_node' && op.changes.content !== undefined)
    const finalProcessedCount = new Set(finalContentOps.map(op => op.target.node_id).filter(Boolean)).size
    
    if (finalProcessedCount >= emptyContentNodeCount) {
      summary += `\n\n✅ All ${emptyContentNodeCount} nodes with empty content processed successfully.`
    } else {
      summary += `\n\n⚠️ WARNING: Only ${finalProcessedCount} of ${emptyContentNodeCount} nodes with empty content were processed.`
      estimated_impact += ` ⚠️ Incomplete operation - ${emptyContentNodeCount - finalProcessedCount} nodes were not processed.`
    }
  }
  
  console.log(`[generateActionPlan] Generated ${operations.length} operations for query: "${query}"`)
  if (operations.length === 0) {
    console.warn(`[generateActionPlan] No operations generated. Assistant message: "${assistantMessage.substring(0, 200)}"`)
  }
  
  return {
    operations,
    summary,
    estimated_impact
  }
}

/**
 * Generate action plan in chunks for large bulk operations
 * Splits nodes into batches and generates operations for each batch
 */
async function generateChunkedActionPlan(
  query: string,
  treeContext: TreeContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  agentMode: boolean = true
): Promise<GeneratedActionPlan> {
  console.log(`[generateChunkedActionPlan] Starting chunked generation for bulk operation`)
  
  // Collect all nodes from all blocks
  const allNodes: Array<{ id: string; name: string; blockId: string; blockName: string }> = []
  treeContext.blocks.forEach(block => {
    block.nodes.forEach(node => {
      allNodes.push({
        id: node.id,
        name: node.name,
        blockId: block.id,
        blockName: block.name
      })
    })
  })

  const totalNodes = allNodes.length
  const batchSize = 15 // Process 15 nodes at a time
  const batches: Array<typeof allNodes> = []
  
  for (let i = 0; i < allNodes.length; i += batchSize) {
    batches.push(allNodes.slice(i, i + batchSize))
  }

  console.log(`[generateChunkedActionPlan] Split ${totalNodes} nodes into ${batches.length} batches of ~${batchSize} nodes each`)

  const allOperations: ActionPlanOperation[] = []

  // Generate operations for each batch sequentially
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const batchNodeIds = new Set(batch.map(n => n.id))

    // Create a filtered tree context for this batch
    const batchContext: TreeContext = {
      ...treeContext,
      blocks: treeContext.blocks
        .map(block => ({
          ...block,
          nodes: block.nodes.filter(node => batchNodeIds.has(node.id))
        }))
        .filter(block => block.nodes.length > 0)
    }

    console.log(`[generateChunkedActionPlan] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} nodes)`)

    // Generate plan for this batch
    const batchPlan = await generateActionPlan(
      query,
      batchContext,
      conversationHistory,
      agentMode
    )

    // Add batch operations to the overall plan
    allOperations.push(...batchPlan.operations)
    
    console.log(`[generateChunkedActionPlan] Batch ${batchIndex + 1} generated ${batchPlan.operations.length} operations`)
  }

  // Generate summary
  const summary = allOperations.length > 0
    ? `Plan to ${allOperations.map(op => op.type.replace(/_/g, ' ')).join(', ')} across ${batches.length} batch(es)`
    : 'No operations planned'

  const estimated_impact = allOperations.length > 0
    ? `This will affect ${allOperations.length} operation(s) across ${totalNodes} node(s) in the experiment tree.`
    : 'No changes will be made.'

  console.log(`[generateChunkedActionPlan] Completed chunked generation: ${allOperations.length} total operations`)

  return {
    operations: allOperations,
    summary,
    estimated_impact
  }
}

/**
 * Main entry point for action plan generation
 * Routes to chunked generation for large bulk operations
 */
export async function generateActionPlanWithRouting(
  query: string,
  treeContext: TreeContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  agentMode: boolean = true
): Promise<GeneratedActionPlan> {
  const isBulkOperation = detectBulkOperation(query)
  const totalNodeCount = treeContext.blocks.reduce((sum, block) => sum + block.nodes.length, 0)

  // For bulk operations, always use full context (no chunking)
  // The AI needs to see ALL nodes to make changes across the entire tree
  if (isBulkOperation) {
    console.log(`[generateActionPlanWithRouting] Bulk operation detected - using full context for all ${totalNodeCount} nodes (no chunking)`)
    return await generateActionPlan(query, treeContext, conversationHistory, agentMode)
  }

  // Use standard generation for targeted operations
  console.log(`[generateActionPlanWithRouting] Targeted operation (${totalNodeCount} nodes)`)
  return await generateActionPlan(query, treeContext, conversationHistory, agentMode)
}

