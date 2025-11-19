/**
 * AI Action Executor - Executes confirmed action plans atomically
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { PermissionService } from './permission-service'
import { ActionPlanOperation, GeneratedActionPlan } from './ai-action-handler'
import { TreeContext, fetchTreeContext, searchNodesAndBlocks } from './tree-context'
import { fetchNodeAndGenerateEmbedding } from './embedding-helpers'

export interface ExecutionResult {
  operation_id: string
  success: boolean
  result?: any
  error?: string
}

export interface ExecutionResponse {
  results: ExecutionResult[]
  tree_context: TreeContext | null
}

/**
 * Execute an action plan atomically
 */
export async function executeActionPlan(
  plan: GeneratedActionPlan,
  treeId: string,
  supabase: SupabaseClient,
  userId: string
): Promise<ExecutionResponse> {
  const permissionService = new PermissionService(supabase, userId)
  const results: ExecutionResult[] = []
  const errors: string[] = []

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

  // Fetch full tree context for identifier resolution if needed
  let fullTreeContext: TreeContext | null = null
  const needsFullContext = plan.operations.some(op => 
    (op.target.node_identifier && !op.target.node_id) || 
    (op.target.block_identifier && !op.target.block_id)
  )
  
  if (needsFullContext) {
    console.log('[executeActionPlan] Some operations have identifiers but no IDs, fetching full context for resolution')
    fullTreeContext = await fetchTreeContext(supabase, treeId)
  }

  // Execute each operation
  for (const operation of plan.operations) {
    const operationId = operation.operation_id || `op_${Date.now()}_${Math.random()}`
    
    try {
      // Resolve identifiers to IDs if needed
      if (operation.target.node_identifier && !operation.target.node_id && fullTreeContext) {
        console.log(`[executeActionPlan] Resolving node_identifier: "${operation.target.node_identifier}"`)
        const searchResults = searchNodesAndBlocks(fullTreeContext, operation.target.node_identifier, { limit: 1 })
        if (searchResults.nodes.length > 0) {
          operation.target.node_id = searchResults.nodes[0].node_id
          console.log(`[executeActionPlan] Resolved to node_id: ${operation.target.node_id}`)
        } else {
          throw new Error(`Could not resolve node_identifier: "${operation.target.node_identifier}"`)
        }
      }
      
      if (operation.target.block_identifier && !operation.target.block_id && fullTreeContext) {
        console.log(`[executeActionPlan] Resolving block_identifier: "${operation.target.block_identifier}"`)
        const searchResults = searchNodesAndBlocks(fullTreeContext, operation.target.block_identifier, { limit: 1 })
        if (searchResults.blocks.length > 0) {
          operation.target.block_id = searchResults.blocks[0].block_id
          console.log(`[executeActionPlan] Resolved to block_id: ${operation.target.block_id}`)
        } else {
          throw new Error(`Could not resolve block_identifier: "${operation.target.block_identifier}"`)
        }
      }

      console.log(`[executeActionPlan] Executing operation: ${operation.type}, node_id: ${operation.target.node_id || 'none'}, block_id: ${operation.target.block_id || 'none'}`)
      if (operation.changes && Object.keys(operation.changes).length > 0) {
        console.log(`[executeActionPlan] Operation changes:`, Object.keys(operation.changes).join(', '))
        // Log content length if present (but not the full content to avoid log spam)
        if (operation.changes.content) {
          console.log(`[executeActionPlan] Content length: ${operation.changes.content.length} chars`)
        }
      }
      
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
        case 'move_node':
          result = await executeMoveNode(operation, treeId, supabase, permissionService)
          break
        case 'create_block':
          result = await executeCreateBlock(operation, treeId, supabase, permissionService)
          break
        case 'update_block':
          result = await executeUpdateBlock(operation, treeId, supabase, permissionService)
          break
        case 'delete_block':
          result = await executeDeleteBlock(operation, treeId, supabase, permissionService)
          break
        case 'reorder_blocks':
          result = await executeReorderBlocks(operation, treeId, supabase, permissionService)
          break
        case 'update_node_content':
          result = await executeUpdateNodeContent(operation, treeId, supabase, permissionService)
          break
        case 'add_link':
          result = await executeAddLink(operation, treeId, supabase, permissionService)
          break
        case 'remove_link':
          result = await executeRemoveLink(operation, treeId, supabase, permissionService)
          break
        case 'add_attachment':
          result = await executeAddAttachment(operation, treeId, supabase, permissionService)
          break
        case 'remove_attachment':
          result = await executeRemoveAttachment(operation, treeId, supabase, permissionService)
          break
        case 'add_dependency':
          result = await executeAddDependency(operation, treeId, supabase, permissionService)
          break
        case 'remove_dependency':
          result = await executeRemoveDependency(operation, treeId, supabase, permissionService)
          break
        default:
          throw new Error(`Unknown operation type: ${operation.type}`)
      }

      console.log(`[executeActionPlan] Operation ${operationId} (${operation.type}) completed successfully`)
      results.push({
        operation_id: operationId,
        success: true,
        result
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      console.error(`[executeActionPlan] Operation ${operationId} (${operation.type}) failed:`, errorMessage, errorStack)
      errors.push(errorMessage)
      results.push({
        operation_id: operationId,
        success: false,
        error: errorMessage
      })
    }
  }

  // If any operations failed, we could rollback here (atomic transaction)
  // For now, we continue and report all results

  // Log execution summary
  const successCount = results.filter(r => r.success).length
  const failureCount = results.filter(r => !r.success).length
  console.log(`[executeActionPlan] Execution complete: ${successCount} successful, ${failureCount} failed out of ${results.length} total operations`)
  
  if (failureCount > 0) {
    console.error(`[executeActionPlan] Failed operations:`, results.filter(r => !r.success).map(r => ({
      id: r.operation_id,
      error: r.error
    })))
  }

  // Fetch updated tree context
  const updatedTreeContext = await fetchTreeContext(supabase, treeId)

  return {
    results,
    tree_context: updatedTreeContext
  }
}

// Node Operations
async function executeCreateNode(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const { name, description, node_type, block_id, position, content, referenced_tree_ids } = operation.changes

  if (!name) {
    throw new Error('Node name is required')
  }

  const nodeData: any = {
    tree_id: treeId,
    name: name.trim(),
    description: description?.trim() || null,
    position: position || 1,
    referenced_tree_ids: referenced_tree_ids || []
  }

  if (block_id) {
    nodeData.block_id = block_id
  }
  if (node_type) {
    nodeData.node_type = node_type
  }

  const { data: newNode, error } = await supabase
    .from('tree_nodes')
    .insert(nodeData)
    .select()
    .single()

  if (error) throw error

  // Add content if provided
  if (content) {
    await supabase.from('node_content').insert({
      node_id: newNode.id,
      content: content
    })
  }

  // Update embedding (non-blocking)
  if (content || description) {
    fetchNodeAndGenerateEmbedding(newNode.id, supabase).catch(console.error)
  }

  return { node: newNode }
}

async function executeUpdateNode(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const nodeId = operation.target.node_id
  if (!nodeId) {
    throw new Error('Node ID is required')
  }

  // Check node permissions
  const nodeAccess = await permissionService.checkNodeAccess(nodeId)
  if (!nodeAccess.canWrite) {
    throw new Error('No write permission for this node')
  }

  const { changes } = operation
  const updateData: any = { 
    updated_at: new Date().toISOString(),
    updated_by: permissionService.userId
  }

  if (changes.name !== undefined) updateData.name = changes.name.trim()
  if (changes.description !== undefined) updateData.description = changes.description?.trim() || null
  if (changes.node_type !== undefined) updateData.node_type = changes.node_type
  if (changes.position !== undefined) updateData.position = changes.position
  if (changes.block_id !== undefined) updateData.block_id = changes.block_id
  if (changes.status !== undefined) updateData.status = changes.status
  if (changes.referenced_tree_ids !== undefined) updateData.referenced_tree_ids = changes.referenced_tree_ids

  const { data: updatedNode, error } = await supabase
    .from('tree_nodes')
    .update(updateData)
    .eq('id', nodeId)
    .eq('tree_id', treeId)
    .select()
    .single()

  if (error) throw error

  // Update content if provided
  if (changes.content !== undefined) {
    const { data: existingContent, error: fetchError } = await supabase
      .from('node_content')
      .select('id')
      .eq('node_id', nodeId)
      .single()

    // If fetchError is PGRST116, it means no row found (which is fine, we'll insert)
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error(`[executeUpdateNode] Failed to check existing content for node ${nodeId}:`, fetchError)
      throw fetchError
    }

    if (existingContent) {
      const { error: updateError } = await supabase
        .from('node_content')
        .update({ content: changes.content, updated_at: new Date().toISOString() })
        .eq('node_id', nodeId)
      
      if (updateError) {
        console.error(`[executeUpdateNode] Failed to update content for node ${nodeId}:`, updateError)
        throw updateError
      }
      console.log(`[executeUpdateNode] Updated content for node ${nodeId}`)
    } else {
      const { error: insertError } = await supabase
        .from('node_content')
        .insert({ node_id: nodeId, content: changes.content })
      
      if (insertError) {
        console.error(`[executeUpdateNode] Failed to insert content for node ${nodeId}:`, insertError)
        throw insertError
      }
      console.log(`[executeUpdateNode] Inserted content for node ${nodeId}`)
    }

    // Update embedding (non-blocking)
    fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(console.error)
  }

  return { node: updatedNode }
}

async function executeDeleteNode(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const nodeId = operation.target.node_id
  if (!nodeId) {
    throw new Error('Node ID is required')
  }

  // Check node permissions
  const nodeAccess = await permissionService.checkNodeAccess(nodeId)
  if (!nodeAccess.canWrite) {
    throw new Error('No write permission for this node')
  }

  const { error } = await supabase
    .from('tree_nodes')
    .delete()
    .eq('id', nodeId)
    .eq('tree_id', treeId)

  if (error) throw error

  return { success: true }
}

async function executeMoveNode(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const nodeId = operation.target.node_id
  const targetBlockId = operation.changes.target_block_id
  const newPosition = operation.changes.new_position

  if (!nodeId || !targetBlockId || newPosition === undefined) {
    throw new Error('Node ID, target block ID, and new position are required')
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
      block_id: targetBlockId,
      position: newPosition,
      updated_at: new Date().toISOString()
    })
    .eq('id', nodeId)
    .eq('tree_id', treeId)
    .select()
    .single()

  if (error) throw error

  return { node: updatedNode }
}

// Block Operations
async function executeCreateBlock(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const { name, block_type, position } = operation.changes

  if (!name) {
    throw new Error('Block name is required')
  }

  // Get next position if not provided
  let blockPosition = position
  if (blockPosition === undefined) {
    const { data: lastBlock } = await supabase
      .from('tree_blocks')
      .select('position')
      .eq('tree_id', treeId)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    blockPosition = lastBlock ? lastBlock.position + 1 : 0
  }

  const { data: newBlock, error } = await supabase
    .from('tree_blocks')
    .insert({
      tree_id: treeId,
      name: name.trim(),
      block_type: block_type || 'custom',
      position: blockPosition
    })
    .select()
    .single()

  if (error) throw error

  return { block: newBlock }
}

async function executeUpdateBlock(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const blockId = operation.target.block_id
  if (!blockId) {
    throw new Error('Block ID is required')
  }

  const { changes } = operation
  const updateData: any = { updated_at: new Date().toISOString() }

  if (changes.name !== undefined) updateData.name = changes.name.trim()
  if (changes.block_type !== undefined) updateData.block_type = changes.block_type
  if (changes.position !== undefined) updateData.position = changes.position

  const { data: updatedBlock, error } = await supabase
    .from('tree_blocks')
    .update(updateData)
    .eq('id', blockId)
    .eq('tree_id', treeId)
    .select()
    .single()

  if (error) throw error

  return { block: updatedBlock }
}

async function executeDeleteBlock(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const blockId = operation.target.block_id
  if (!blockId) {
    throw new Error('Block ID is required')
  }

  const { error } = await supabase
    .from('tree_blocks')
    .delete()
    .eq('id', blockId)
    .eq('tree_id', treeId)

  if (error) throw error

  return { success: true }
}

async function executeReorderBlocks(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const blockPositions = operation.changes.block_positions
  if (!Array.isArray(blockPositions)) {
    throw new Error('block_positions must be an array')
  }

  // Update all block positions
  for (const { block_id, position } of blockPositions) {
    const { error } = await supabase
      .from('tree_blocks')
      .update({ position, updated_at: new Date().toISOString() })
      .eq('id', block_id)
      .eq('tree_id', treeId)

    if (error) throw error
  }

  return { success: true }
}

// Content Operations
async function executeUpdateNodeContent(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const nodeId = operation.target.node_id
  const content = operation.changes.content

  if (!nodeId) {
    throw new Error('Node ID is required')
  }

  // Check node permissions
  const nodeAccess = await permissionService.checkNodeAccess(nodeId)
  if (!nodeAccess.canWrite) {
    throw new Error('No write permission for this node')
  }

  if (!content) {
    throw new Error('Content is required')
  }

  const { data: existingContent, error: fetchError } = await supabase
    .from('node_content')
    .select('id')
    .eq('node_id', nodeId)
    .single()

  // If fetchError is PGRST116, it means no row found (which is fine, we'll insert)
  if (fetchError && fetchError.code !== 'PGRST116') {
    throw fetchError
  }

  if (existingContent) {
    const { error: updateError } = await supabase
      .from('node_content')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('node_id', nodeId)
    
    if (updateError) {
      console.error(`[executeUpdateNodeContent] Failed to update content for node ${nodeId}:`, updateError)
      throw updateError
    }
    console.log(`[executeUpdateNodeContent] Updated content for node ${nodeId}`)
  } else {
    const { error: insertError } = await supabase
      .from('node_content')
      .insert({ node_id: nodeId, content })
    
    if (insertError) {
      console.error(`[executeUpdateNodeContent] Failed to insert content for node ${nodeId}:`, insertError)
      throw insertError
    }
    console.log(`[executeUpdateNodeContent] Inserted content for node ${nodeId}`)
  }

  // Update embedding (non-blocking)
  fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(console.error)

  return { success: true }
}

// Link Operations
async function executeAddLink(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const nodeId = operation.target.node_id
  const { name, url, description, link_type } = operation.changes

  if (!nodeId || !name || !url) {
    throw new Error('Node ID, name, and URL are required')
  }

  // Check node permissions
  const nodeAccess = await permissionService.checkNodeAccess(nodeId)
  if (!nodeAccess.canWrite) {
    throw new Error('No write permission for this node')
  }

  const { data: newLink, error } = await supabase
    .from('node_links')
    .insert({
      node_id: nodeId,
      name: name.trim(),
      url: url.trim(),
      description: description?.trim() || null,
      link_type: link_type || 'other'
    })
    .select()
    .single()

  if (error) throw error

  // Update embedding (non-blocking)
  fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(console.error)

  return { link: newLink }
}

async function executeRemoveLink(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const linkId = operation.changes.link_id
  if (!linkId) {
    throw new Error('Link ID is required')
  }

  // Get node_id from link to check permissions
  const { data: link } = await supabase
    .from('node_links')
    .select('node_id')
    .eq('id', linkId)
    .single()

  if (!link) {
    throw new Error('Link not found')
  }

  const nodeAccess = await permissionService.checkNodeAccess(link.node_id)
  if (!nodeAccess.canWrite) {
    throw new Error('No write permission for this node')
  }

  const { error } = await supabase
    .from('node_links')
    .delete()
    .eq('id', linkId)

  if (error) throw error

  // Update embedding (non-blocking)
  fetchNodeAndGenerateEmbedding(link.node_id, supabase).catch(console.error)

  return { success: true }
}

// Attachment Operations
async function executeAddAttachment(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const nodeId = operation.target.node_id
  const { name, file_url, file_type, description } = operation.changes

  if (!nodeId || !name || !file_url) {
    throw new Error('Node ID, name, and file_url are required')
  }

  // Check node permissions
  const nodeAccess = await permissionService.checkNodeAccess(nodeId)
  if (!nodeAccess.canWrite) {
    throw new Error('No write permission for this node')
  }

  const { data: newAttachment, error } = await supabase
    .from('node_attachments')
    .insert({
      node_id: nodeId,
      name: name.trim(),
      file_url: file_url.trim(),
      file_type: file_type || null,
      description: description?.trim() || null
    })
    .select()
    .single()

  if (error) throw error

  // Update embedding (non-blocking)
  fetchNodeAndGenerateEmbedding(nodeId, supabase).catch(console.error)

  return { attachment: newAttachment }
}

async function executeRemoveAttachment(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const attachmentId = operation.changes.attachment_id
  if (!attachmentId) {
    throw new Error('Attachment ID is required')
  }

  // Get node_id from attachment to check permissions
  const { data: attachment } = await supabase
    .from('node_attachments')
    .select('node_id')
    .eq('id', attachmentId)
    .single()

  if (!attachment) {
    throw new Error('Attachment not found')
  }

  const nodeAccess = await permissionService.checkNodeAccess(attachment.node_id)
  if (!nodeAccess.canWrite) {
    throw new Error('No write permission for this node')
  }

  const { error } = await supabase
    .from('node_attachments')
    .delete()
    .eq('id', attachmentId)

  if (error) throw error

  // Update embedding (non-blocking)
  fetchNodeAndGenerateEmbedding(attachment.node_id, supabase).catch(console.error)

  return { success: true }
}

// Dependency Operations
async function executeAddDependency(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const fromNodeId = operation.target.node_id
  const toNodeIdentifier = operation.changes.to_node_identifier
  const { dependency_type, evidence_text } = operation.changes

  if (!fromNodeId || !toNodeIdentifier) {
    throw new Error('From node ID and to node identifier are required')
  }

  // Check from node permissions
  const fromNodeAccess = await permissionService.checkNodeAccess(fromNodeId)
  if (!fromNodeAccess.canWrite) {
    throw new Error('No write permission for source node')
  }

  // Find to node by identifier - need to search in tree context
  // For now, assume toNodeIdentifier might be a node_id or name
  // In a full implementation, we'd need tree context to resolve identifiers
  let toNodeId = toNodeIdentifier
  // If it's not a UUID, we'd need to search - simplified for now
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(toNodeIdentifier)) {
    // Try to find by name (simplified - would need tree context)
    const { data: nodes } = await supabase
      .from('tree_nodes')
      .select('id')
      .eq('name', toNodeIdentifier)
      .limit(1)
    if (nodes && nodes.length > 0) {
      toNodeId = nodes[0].id
    } else {
      throw new Error(`Node "${toNodeIdentifier}" not found`)
    }
  }

  // Check if dependency already exists (try both schema formats)
  const { data: existingNew } = await supabase
    .from('node_dependencies')
    .select('id')
    .eq('from_node_id', fromNodeId)
    .eq('to_node_id', toNodeId)
    .maybeSingle()

  const { data: existingOld } = await supabase
    .from('node_dependencies')
    .select('id')
    .eq('node_id', fromNodeId)
    .eq('depends_on_node_id', toNodeId)
    .is('from_node_id', null)
    .maybeSingle()

  const existing = existingNew || existingOld

  if (existing) {
    // Update existing (prefer new schema)
    const updateData: any = {
      dependency_type: dependency_type || 'requires',
      updated_at: new Date().toISOString()
    }
    if (evidence_text !== undefined) {
      updateData.evidence_text = evidence_text
    }

    const { data: updated, error } = await supabase
      .from('node_dependencies')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw error
    return { dependency: updated }
  } else {
    // Create new (use new schema if available, fallback to old)
    const insertData: any = {
      dependency_type: dependency_type || 'requires'
    }
    
    // Try new schema first
    try {
      const { data: newDependency, error } = await supabase
        .from('node_dependencies')
        .insert({
          from_node_id: fromNodeId,
          to_node_id: toNodeId,
          dependency_type: dependency_type || 'requires',
          evidence_text: evidence_text || null
        })
        .select()
        .single()

      if (error) {
        // Fallback to old schema
        const { data: newDependencyOld, error: errorOld } = await supabase
          .from('node_dependencies')
          .insert({
            node_id: fromNodeId,
            depends_on_node_id: toNodeId,
            dependency_type: dependency_type || 'requires',
            evidence_text: evidence_text || null
          })
          .select()
          .single()

        if (errorOld) throw errorOld
        return { dependency: newDependencyOld }
      }
      return { dependency: newDependency }
    } catch (error) {
      // Fallback to old schema
      const { data: newDependencyOld, error: errorOld } = await supabase
        .from('node_dependencies')
        .insert({
          node_id: fromNodeId,
          depends_on_node_id: toNodeId,
          dependency_type: dependency_type || 'requires',
          evidence_text: evidence_text || null
        })
        .select()
        .single()

      if (errorOld) throw errorOld
      return { dependency: newDependencyOld }
    }
  }
}

async function executeRemoveDependency(
  operation: ActionPlanOperation,
  treeId: string,
  supabase: SupabaseClient,
  permissionService: PermissionService
): Promise<any> {
  const fromNodeId = operation.target.node_id
  const toNodeIdentifier = operation.changes.to_node_identifier

  if (!fromNodeId || !toNodeIdentifier) {
    throw new Error('From node ID and to node identifier are required')
  }

  // Check from node permissions
  const fromNodeAccess = await permissionService.checkNodeAccess(fromNodeId)
  if (!fromNodeAccess.canWrite) {
    throw new Error('No write permission for source node')
  }

  // Find to node (simplified - assume it's a node_id or resolve by name)
  let toNodeId = toNodeIdentifier
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(toNodeIdentifier)) {
    const { data: nodes } = await supabase
      .from('tree_nodes')
      .select('id')
      .eq('name', toNodeIdentifier)
      .limit(1)
    if (nodes && nodes.length > 0) {
      toNodeId = nodes[0].id
    } else {
      throw new Error(`Node "${toNodeIdentifier}" not found`)
    }
  }

  // Try both schema formats
  const { error: errorNew } = await supabase
    .from('node_dependencies')
    .delete()
    .eq('from_node_id', fromNodeId)
    .eq('to_node_id', toNodeId)

  if (errorNew) {
    // Fallback to old schema
    const { error: errorOld } = await supabase
      .from('node_dependencies')
      .delete()
      .eq('node_id', fromNodeId)
      .eq('depends_on_node_id', toNodeId)
    
    if (errorOld) throw errorOld
  }

  return { success: true }
}

