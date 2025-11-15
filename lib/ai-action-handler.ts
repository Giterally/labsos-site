/**
 * AI Action Handler - Generates action plans using OpenAI function calling
 */

import OpenAI from 'openai'
import { SupabaseClient } from '@supabase/supabase-js'
import { TreeContext, searchNodesAndBlocks } from './tree-context'
import { AI_ACTION_FUNCTIONS, ActionPlan, hasActionIntent } from './ai-action-schemas'
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
  const formattedContext = formatTreeContextForLLM(treeContext)

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

CRITICAL: When the user requests changes, you MUST generate function calls for action operations (not just search). 
Each action function call represents one operation in the plan. Do not just respond with text - you must call functions.` : 'Answer questions clearly and helpfully about the experiment tree structure.'}`

  // Build messages
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    {
      role: 'user',
      content: `Here is the current experiment tree structure:\n\n${formattedContext}\n\nUser request: ${query}\n\nIMPORTANT: You must call action functions (like update_node, create_node, delete_node, etc.) to fulfill this request. You can use search_nodes or search_blocks first to find items, but you MUST follow up with an action function call. Do not just respond with text - you must use function calls.`
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
  })

  // Extract function calls from response
  const operations: ActionPlanOperation[] = []
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

          // Extract target identifiers
          if (functionArgs.node_identifier) {
            operation.target.node_identifier = functionArgs.node_identifier
            // Try to resolve to actual node_id
            const searchResults = searchNodesAndBlocks(treeContext, functionArgs.node_identifier, { limit: 1 })
            if (searchResults.nodes.length > 0) {
              operation.target.node_id = searchResults.nodes[0].node_id
              operation.confidence = searchResults.nodes[0].confidence
            }
          }
          if (functionArgs.block_identifier) {
            operation.target.block_identifier = functionArgs.block_identifier
            // Try to resolve to actual block_id
            const searchResults = searchNodesAndBlocks(treeContext, functionArgs.block_identifier, { limit: 1 })
            if (searchResults.blocks.length > 0) {
              operation.target.block_id = searchResults.blocks[0].block_id
              operation.confidence = searchResults.blocks[0].confidence
            }
          }
          if (functionArgs.block_id) {
            operation.target.block_id = functionArgs.block_id
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

          operations.push(operation)
        }
      }
    }
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

