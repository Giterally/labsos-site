/**
 * OpenAI Function Calling Schemas for Agentic AI Chat
 * These schemas define the operations the AI can perform on experiment trees
 */

export interface ActionPlan {
  operations: Array<{
    type: string
    target: {
      node_id?: string
      block_id?: string
      node_identifier?: string
      block_identifier?: string
      [key: string]: any
    }
    changes: Record<string, any>
    confidence: number
    reasoning: string
    operation_id?: string
  }>
  summary: string
  estimated_impact: string
}

export const AI_ACTION_FUNCTIONS = [
  // Node Operations
  {
    name: 'create_node',
    description: 'Create a new node in the experiment tree',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the node' },
        description: { type: 'string', description: 'Description of the node' },
        node_type: { type: 'string', description: 'Type of node (protocol, data_creation, analysis, results)' },
        block_id: { type: 'string', description: 'ID of the block to add the node to' },
        position: { type: 'number', description: 'Position within the block (1-based)' },
        content: { type: 'string', description: 'Content text for the node' },
        referenced_tree_ids: { type: 'array', items: { type: 'string' }, description: 'Array of referenced tree IDs (max 3)' }
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
        node_identifier: { type: 'string', description: 'Node identifier (name, ID, or position like "first node")' },
        changes: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            node_type: { type: 'string' },
            position: { type: 'number' },
            block_id: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'review', 'final'] },
            referenced_tree_ids: { type: 'array', items: { type: 'string' } }
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
        node_identifier: { type: 'string', description: 'Node identifier (name, ID, or position)' }
      },
      required: ['node_identifier']
    }
  },
  {
    name: 'move_node',
    description: 'Move a node to a different block or position',
    parameters: {
      type: 'object',
      properties: {
        node_identifier: { type: 'string', description: 'Node identifier' },
        target_block_id: { type: 'string', description: 'ID of the target block' },
        new_position: { type: 'number', description: 'New position within the target block' }
      },
      required: ['node_identifier', 'target_block_id', 'new_position']
    }
  },
  // Block Operations
  {
    name: 'create_block',
    description: 'Create a new block in the experiment tree',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the block' },
        block_type: { type: 'string', description: 'Type of block' },
        position: { type: 'number', description: 'Position of the block' }
      },
      required: ['name']
    }
  },
  {
    name: 'update_block',
    description: 'Update an existing block',
    parameters: {
      type: 'object',
      properties: {
        block_identifier: { type: 'string', description: 'Block identifier (name or ID)' },
        changes: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            block_type: { type: 'string' },
            position: { type: 'number' }
          }
        }
      },
      required: ['block_identifier', 'changes']
    }
  },
  {
    name: 'delete_block',
    description: 'Delete a block from the experiment tree (will also delete all nodes in the block)',
    parameters: {
      type: 'object',
      properties: {
        block_identifier: { type: 'string', description: 'Block identifier (name or ID)' }
      },
      required: ['block_identifier']
    }
  },
  {
    name: 'reorder_blocks',
    description: 'Reorder multiple blocks at once',
    parameters: {
      type: 'object',
      properties: {
        block_positions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              block_id: { type: 'string' },
              position: { type: 'number' }
            },
            required: ['block_id', 'position']
          }
        }
      },
      required: ['block_positions']
    }
  },
  // Content Operations
  {
    name: 'update_node_content',
    description: 'Update the content text of a node',
    parameters: {
      type: 'object',
      properties: {
        node_identifier: { type: 'string', description: 'Node identifier' },
        content: { type: 'string', description: 'New content text' }
      },
      required: ['node_identifier', 'content']
    }
  },
  // Link Operations
  {
    name: 'add_link',
    description: 'Add a link to a node',
    parameters: {
      type: 'object',
      properties: {
        node_identifier: { type: 'string', description: 'Node identifier' },
        name: { type: 'string', description: 'Link name' },
        url: { type: 'string', description: 'Link URL' },
        description: { type: 'string', description: 'Link description' },
        link_type: { type: 'string', enum: ['documentation', 'paper', 'tool', 'other'], description: 'Type of link' }
      },
      required: ['node_identifier', 'name', 'url']
    }
  },
  {
    name: 'remove_link',
    description: 'Remove a link from a node',
    parameters: {
      type: 'object',
      properties: {
        node_identifier: { type: 'string', description: 'Node identifier' },
        link_id: { type: 'string', description: 'ID of the link to remove' }
      },
      required: ['node_identifier', 'link_id']
    }
  },
  // Attachment Operations
  {
    name: 'add_attachment',
    description: 'Add an attachment to a node',
    parameters: {
      type: 'object',
      properties: {
        node_identifier: { type: 'string', description: 'Node identifier' },
        name: { type: 'string', description: 'Attachment name' },
        file_url: { type: 'string', description: 'File URL' },
        file_type: { type: 'string', description: 'File type' },
        description: { type: 'string', description: 'Attachment description' }
      },
      required: ['node_identifier', 'name', 'file_url']
    }
  },
  {
    name: 'remove_attachment',
    description: 'Remove an attachment from a node',
    parameters: {
      type: 'object',
      properties: {
        node_identifier: { type: 'string', description: 'Node identifier' },
        attachment_id: { type: 'string', description: 'ID of the attachment to remove' }
      },
      required: ['node_identifier', 'attachment_id']
    }
  },
  // Dependency Operations
  {
    name: 'add_dependency',
    description: 'Add a dependency relationship between two nodes',
    parameters: {
      type: 'object',
      properties: {
        from_node_identifier: { type: 'string', description: 'Source node identifier' },
        to_node_identifier: { type: 'string', description: 'Target node identifier' },
        dependency_type: { type: 'string', description: 'Type of dependency' },
        evidence_text: { type: 'string', description: 'Evidence for the dependency' }
      },
      required: ['from_node_identifier', 'to_node_identifier']
    }
  },
  {
    name: 'remove_dependency',
    description: 'Remove a dependency relationship between two nodes',
    parameters: {
      type: 'object',
      properties: {
        from_node_identifier: { type: 'string', description: 'Source node identifier' },
        to_node_identifier: { type: 'string', description: 'Target node identifier' }
      },
      required: ['from_node_identifier', 'to_node_identifier']
    }
  },
  // Helper Functions
  {
    name: 'search_nodes',
    description: 'Search for nodes by name, description, or content. Use this to find nodes before performing operations.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (name, description, or content keywords)' },
        limit: { type: 'number', description: 'Maximum number of results (default: 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_blocks',
    description: 'Search for blocks by name. Use this to find blocks before performing operations.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (block name)' },
        limit: { type: 'number', description: 'Maximum number of results (default: 10)' }
      },
      required: ['query']
    }
  }
]

/**
 * Detect if a query contains action intent
 */
export function hasActionIntent(query: string): boolean {
  const actionKeywords = [
    'create', 'add', 'make', 'new',
    'update', 'edit', 'change', 'modify', 'rename', 'fix', 'improve', 'adjust', 'set',
    'delete', 'remove', 'drop',
    'move', 'reorder', 'reposition',
    'link', 'attachment', 'dependency'
  ]
  
  const lowerQuery = query.toLowerCase()
  return actionKeywords.some(keyword => lowerQuery.includes(keyword))
}

/**
 * Detect if a query is a bulk operation (affects all or many nodes)
 * Bulk operations require full context to ensure 100% accuracy
 */
export function detectBulkOperation(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim()
  
  // Keywords that indicate bulk operations
  const bulkKeywords = [
    'all nodes',
    'every node',
    'entire tree',
    'all blocks',
    'each node',
    'go through every',
    'for all nodes',
    'across all nodes',
    'throughout the tree',
    'all of the nodes',
    'every single node',
    'each and every node'
  ]
  
  // Patterns that indicate bulk operations
  const bulkPatterns = [
    /for all\s+/i,
    /across all\s+/i,
    /throughout\s+the\s+tree/i,
    /go through\s+every/i,
    /process\s+all\s+nodes/i,
    /update\s+all\s+nodes/i,
    /change\s+all\s+nodes/i,
    /modify\s+all\s+nodes/i
  ]
  
  // Check for exact keyword matches
  if (bulkKeywords.some(keyword => lowerQuery.includes(keyword))) {
    return true
  }
  
  // Check for pattern matches
  if (bulkPatterns.some(pattern => pattern.test(query))) {
    return true
  }
  
  return false
}

