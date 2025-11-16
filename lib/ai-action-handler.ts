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
  const isBulkRenameQuery = query.toLowerCase().includes('fix the node names') || 
                           query.toLowerCase().includes('rename all nodes') ||
                           query.toLowerCase().includes('update all node names') ||
                           (query.toLowerCase().includes('node names') && (query.toLowerCase().includes('all') || query.toLowerCase().includes('every')))
  
  const totalNodeCount = treeContext.blocks.reduce((sum, block) => sum + block.nodes.length, 0)
  
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

  // Call OpenAI with function calling
  // Force function calling if agent mode is enabled and query has action intent
  const toolChoice = agentMode && hasActionIntent(query) ? 'required' : 'auto'
  
  console.log(`[generateActionPlan] Calling OpenAI with tool_choice: ${toolChoice}, agentMode: ${agentMode}, hasActionIntent: ${hasActionIntent(query)}`)
  
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
    max_tokens: 16384, // Allow more function calls per response (enables 30-40 operations)
  })

  // Extract function calls from response
  let operations: ActionPlanOperation[] = []
  let assistantMessage = ''

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
  } else if (isBulkRenameQuery) {
    // For bulk rename operations, check if all nodes are covered
    const renameOperations = operations.filter(op => op.type === 'update_node' && op.changes.name)
    const processedNodeIds = new Set(renameOperations.map(op => op.target.node_id).filter(Boolean))
    
    console.log(`[generateActionPlan] Bulk rename operation: ${renameOperations.length} operations generated, ${totalNodeCount} total nodes in tree`)
    
    if (processedNodeIds.size < totalNodeCount) {
      console.warn(`[generateActionPlan] ⚠️ WARNING: Only ${processedNodeIds.size} nodes have rename operations, but ${totalNodeCount} nodes exist in tree!`)
      
      // Find all nodes that don't have rename operations
      const missingNodes: Array<{ nodeId: string; nodeName: string; blockName: string; position: number }> = []
      for (const block of treeContext.blocks) {
        for (const node of block.nodes) {
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
      
      console.warn(`[generateActionPlan] Missing rename operations for ${missingNodes.length} nodes:`, missingNodes.map(n => `"${n.nodeName}" in "${n.blockName}"`))
      
      // Try to extract new names from conversation history
      // Look for patterns like "Node: NewName" or "BLOCK X: ... Node: NewName"
      const allText = `${query}\n${conversationHistory.map(m => m.content).join('\n')}`
      
      // Try to parse a list of new names from the conversation history
      // Look for patterns like "Node: [name]" or "BLOCK X:\nNode: [name]"
      // Also handle formats like "Node: NewName" (standalone) or "Node: NewName\n" (with newline)
      const nodeNamePattern = /(?:^|\n)(?:Node:\s*)([^\n:]+?)(?:\n|$|\(in |\(in Block)/gi
      const extractedNames: string[] = []
      let match
      while ((match = nodeNamePattern.exec(allText)) !== null) {
        const name = match[1].trim()
        // Filter out names that are just block references or too short
        if (name && name.length > 3 && !name.match(/^(in |\(in |Block|BLOCK)/i) && !name.endsWith('Block')) {
          extractedNames.push(name)
        }
      }
      
      // Also try a more permissive pattern that matches any line starting with "Node:"
      if (extractedNames.length < missingNodes.length) {
        const permissivePattern = /Node:\s*([^\n]+)/gi
        const permissiveNames: string[] = []
        let permMatch
        while ((permMatch = permissivePattern.exec(allText)) !== null) {
          const name = permMatch[1].trim()
          // Remove trailing "(in BlockName)" if present
          const cleanName = name.replace(/\s*\(in\s+[^)]+\)\s*$/i, '').trim()
          if (cleanName && cleanName.length > 3 && !cleanName.match(/^(in |\(in |Block|BLOCK)/i)) {
            permissiveNames.push(cleanName)
          }
        }
        // Merge, avoiding duplicates
        for (const name of permissiveNames) {
          if (!extractedNames.includes(name)) {
            extractedNames.push(name)
          }
        }
      }
      
      console.log(`[generateActionPlan] Extracted ${extractedNames.length} potential new names from conversation history`)
      
      // Try to match missing nodes to new names by position/block
      // The extracted names should be in the same order as blocks appear in the tree
      if (extractedNames.length >= missingNodes.length) {
        console.log(`[generateActionPlan] 🔧 Auto-generating ${missingNodes.length} missing rename operations...`)
        console.log(`[generateActionPlan] Extracted names (first 5):`, extractedNames.slice(0, 5))
        
        // Group nodes by block in the same order as they appear in treeContext
        const nodesByBlock = new Map<string, typeof missingNodes>()
        for (const node of missingNodes) {
          if (!nodesByBlock.has(node.blockName)) {
            nodesByBlock.set(node.blockName, [])
          }
          nodesByBlock.get(node.blockName)!.push(node)
        }
        
        // Match names by iterating through blocks in tree order
        let nameIndex = 0
        for (const block of treeContext.blocks) {
          const nodesInBlock = nodesByBlock.get(block.name)
          if (!nodesInBlock || nodesInBlock.length === 0) continue
          
          // Sort nodes by position within the block
          const sortedNodes = [...nodesInBlock].sort((a, b) => a.position - b.position)
          
          console.log(`[generateActionPlan] Block "${block.name}": ${sortedNodes.length} missing nodes, starting at name index ${nameIndex}`)
          
          for (const node of sortedNodes) {
            if (nameIndex < extractedNames.length) {
              const newName = extractedNames[nameIndex]
              nameIndex++
              
              // Create the operation
              const autoOperation: ActionPlanOperation = {
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
                confidence: 0.8, // Medium confidence since we're matching by position
                reasoning: `Auto-generated rename operation: matching by block and position`,
                operation_id: `auto_rename_${Date.now()}_${Math.random()}`
              }
              
              // Get the "before" state
              for (const block of treeContext.blocks) {
                const foundNode = block.nodes.find(n => n.id === node.nodeId)
                if (foundNode) {
                  autoOperation.before = {
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
              
              operations.push(autoOperation)
              console.log(`[generateActionPlan] ✅ Auto-generated rename: "${node.nodeName}" -> "${newName}" (Block: ${node.blockName}, Pos: ${node.position})`)
            } else {
              console.warn(`[generateActionPlan] ⚠️ Ran out of extracted names at index ${nameIndex}, but still have nodes to process`)
            }
          }
        }
        
        console.log(`[generateActionPlan] ✅ Total operations after auto-generation: ${operations.length} (expected: ${totalNodeCount})`)
      } else {
        console.warn(`[generateActionPlan] Cannot auto-generate rename operations: found ${extractedNames.length} new names but need ${missingNodes.length}. AI should have provided new names for all ${totalNodeCount} nodes.`)
        console.warn(`[generateActionPlan] Extracted names:`, extractedNames)
        console.warn(`[generateActionPlan] Missing nodes:`, missingNodes.map(n => `${n.nodeName} (${n.blockName}, pos ${n.position})`))
      }
    } else {
      console.log(`[generateActionPlan] ✅ All ${totalNodeCount} nodes have rename operations`)
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

  // Generate summary and impact estimate
  const summary = operations.length > 0
    ? `Plan to ${operations.map(op => op.type.replace(/_/g, ' ')).join(', ')}`
    : 'No operations planned'

  const estimated_impact = operations.length > 0
    ? `This will affect ${operations.length} operation(s) in the experiment tree.`
    : 'No changes will be made.'

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

