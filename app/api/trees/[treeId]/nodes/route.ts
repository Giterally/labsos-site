import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params

    // Resolve parent project visibility using server client
    const { data: treeMeta, error: treeMetaErr } = await supabaseServer
      .from('experiment_trees')
      .select('id, project_id')
      .eq('id', treeId)
      .single()

    if (treeMetaErr || !treeMeta) {
      return NextResponse.json({ error: 'Experiment tree not found' }, { status: 404 })
    }

    const { data: proj, error: projErr } = await supabaseServer
      .from('projects')
      .select('visibility')
      .eq('id', treeMeta.project_id)
      .single()

    if (projErr || !proj) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    let client: any = supabaseServer
    if (proj.visibility === 'private') {
      const auth = await authenticateRequest(request)
      const permissions = new PermissionService(auth.supabase, auth.user.id)
      const access = await permissions.checkTreeAccess(treeId)
      if (!access.canRead) {
        return NextResponse.json({ message: 'Access denied' }, { status: 403 })
      }
      client = auth.supabase
    }

    // Get nodes for the tree with their content, attachments, and links
    const { data: nodes, error: nodesError } = await client
      .from('tree_nodes')
      .select(`
        *,
        node_content (
          id,
          content,
          status,
          created_at,
          updated_at
        ),
        node_attachments (
          id,
          name,
          file_type,
          file_size,
          file_url,
          description,
          created_at,
          updated_at
        ),
        node_links (
          id,
          name,
          url,
          description,
          link_type,
          created_at,
          updated_at
        )
      `)
      .eq('tree_id', treeId)
      .order('position', { ascending: true })

    if (nodesError) {
      console.error('Error fetching nodes:', nodesError)
      return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 })
    }

    // Check access permissions for referenced trees if user is authenticated
    let userPermissions: any = null
    if (proj.visibility === 'private' && client !== supabaseServer) {
      const auth = await authenticateRequest(request)
      userPermissions = new PermissionService(auth.supabase, auth.user.id)
    }

    // Collect all unique referenced tree IDs
    const allReferencedTreeIds = new Set<string>()
    nodes.forEach(node => {
      if (node.referenced_tree_ids && Array.isArray(node.referenced_tree_ids)) {
        node.referenced_tree_ids.forEach(id => {
          if (id) allReferencedTreeIds.add(id)
        })
      }
    })

    // Fetch all referenced trees in one query
    let referencedTreesMap = new Map()
    if (allReferencedTreeIds.size > 0) {
      const { data: referencedTrees, error: refTreesError } = await client
        .from('experiment_trees')
        .select('id, name, description, status, project_id')
        .in('id', Array.from(allReferencedTreeIds))
      
      if (!refTreesError && referencedTrees) {
        // Check permissions for each tree if needed
        for (const tree of referencedTrees) {
          if (userPermissions) {
            const canAccess = await userPermissions.checkTreeAccess(tree.id)
            if (canAccess.canRead) {
              referencedTreesMap.set(tree.id, {
                id: tree.id,
                name: tree.name,
                description: tree.description,
                status: tree.status
              })
            } else {
              referencedTreesMap.set(tree.id, { error: 'access_denied' as const })
            }
          } else {
            referencedTreesMap.set(tree.id, {
              id: tree.id,
              name: tree.name,
              description: tree.description,
              status: tree.status
            })
          }
        }
      }
    }

    // Transform the data to match the expected format
    const transformedNodes = nodes.map(node => {
      const referencedTreesData: Array<{
        id: string
        name: string
        description: string
        status: string
        error?: 'not_found' | 'access_denied'
      }> = []
      
      // Handle referenced trees array
      if (node.referenced_tree_ids && Array.isArray(node.referenced_tree_ids)) {
        node.referenced_tree_ids.forEach((treeId: string) => {
          if (treeId) {
            const treeData = referencedTreesMap.get(treeId)
            if (treeData) {
              referencedTreesData.push(treeData)
            } else {
              // Tree ID exists but tree not found (deleted)
              referencedTreesData.push({ error: 'not_found' as const, id: treeId, name: '', description: '', status: '' })
            }
          }
        })
      }
      
      return {
        id: node.id,
        title: node.name,
        description: node.description,
        type: node.block_id || node.node_type, // Use block_id if available, fallback to node_type
        status: node.node_content?.[0]?.status || 'draft',
        position: node.position,
        content: node.node_content?.[0]?.content || '',
        attachments: node.node_attachments || [],
        links: node.node_links || [],
        referenced_tree_ids: node.referenced_tree_ids || [],
        referenced_trees: referencedTreesData,
        metadata: {
          created: node.created_at,
          updated: node.updated_at,
          type: node.node_type, // Keep original node_type in metadata
          position: node.position
        }
      }
    })

    return NextResponse.json({ nodes: transformedNodes })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in GET /api/trees/[treeId]/nodes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { treeId: string } }
) {
  try {
    const { treeId } = await params
    const body = await request.json()
    const { name, description, node_type, position, content, referenced_tree_ids } = body

    // Enhanced logging for debugging
    console.log('Creating node with data:', {
      treeId,
      name,
      description,
      node_type,
      position,
      content,
      referenced_tree_ids
    })

    // Input validation
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Node name is required' }, { status: 400 })
    }

    if (!treeId) {
      return NextResponse.json({ error: 'Tree ID is required' }, { status: 400 })
    }

    // Validate node_type against allowed values or custom block IDs
    const allowedNodeTypes = ['protocol', 'data_creation', 'analysis', 'results']
    
    // Check if it's a custom block ID (UUID format)
    const isCustomBlockId = node_type && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node_type)
    
    
    if (node_type && !allowedNodeTypes.includes(node_type) && !isCustomBlockId) {
      return NextResponse.json({ 
        error: `Invalid node type. Must be one of: ${allowedNodeTypes.join(', ')} or a valid custom block ID` 
      }, { status: 400 })
    }

    // Authenticate request
    const auth = await authenticateRequest(request)
    const permissions = new PermissionService(auth.supabase, auth.user.id)

    // Check tree permissions - only members can create nodes
    const access = await permissions.checkTreeAccess(treeId)
    
    if (!access.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to create nodes in this experiment tree' },
        { status: 403 }
      )
    }

    // Validate referenced_tree_ids if provided
    if (referenced_tree_ids && Array.isArray(referenced_tree_ids)) {
      // Validate maximum of 3 references
      if (referenced_tree_ids.length > 3) {
        return NextResponse.json({ 
          error: 'Maximum of 3 tree references allowed per node' 
        }, { status: 400 })
      }

      // Remove duplicates and filter out null/undefined
      const uniqueTreeIds = [...new Set(referenced_tree_ids.filter(id => id))]
      
      if (uniqueTreeIds.length > 0) {
        // Prevent self-reference - node cannot reference the tree it belongs to
        if (uniqueTreeIds.includes(treeId)) {
          return NextResponse.json({ 
            error: 'Cannot reference the tree this node belongs to' 
          }, { status: 400 })
        }

        // Validate UUID format for all tree IDs
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const invalidUuids = uniqueTreeIds.filter(id => !uuidPattern.test(id))
        if (invalidUuids.length > 0) {
          return NextResponse.json({ 
            error: 'Invalid tree ID format. All referenced tree IDs must be valid UUIDs' 
          }, { status: 400 })
        }

        // Get the parent tree's project_id
        const { data: parentTree, error: parentTreeError } = await auth.supabase
          .from('experiment_trees')
          .select('project_id')
          .eq('id', treeId)
          .single()

        if (parentTreeError || !parentTree) {
          return NextResponse.json({ error: 'Parent tree not found' }, { status: 404 })
        }

        // Get all referenced trees and verify they exist and are in the same project
        const { data: referencedTrees, error: referencedTreesError } = await auth.supabase
          .from('experiment_trees')
          .select('id, project_id')
          .in('id', uniqueTreeIds)

        if (referencedTreesError) {
          return NextResponse.json({ 
            error: 'Failed to validate referenced trees' 
          }, { status: 400 })
        }

        if (referencedTrees.length !== uniqueTreeIds.length) {
          return NextResponse.json({ 
            error: 'One or more referenced trees not found' 
          }, { status: 400 })
        }

        // Verify all trees are in the same project
        const invalidTrees = referencedTrees.filter(tree => tree.project_id !== parentTree.project_id)
        if (invalidTrees.length > 0) {
          return NextResponse.json({ 
            error: 'Cannot reference trees from a different project' 
          }, { status: 400 })
        }
      }
    }

    // Create the node with unified system support
    const nodeData: any = {
      tree_id: treeId,
      name: name.trim(),
      description: description?.trim() || null,
      position: position || 1,
      referenced_tree_ids: (referenced_tree_ids && Array.isArray(referenced_tree_ids)) 
        ? [...new Set(referenced_tree_ids.filter(id => id))] 
        : []
    }

    // Handle unified system: if node_type is a UUID (block ID), use it as block_id
    if (node_type && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node_type)) {
      nodeData.block_id = node_type
      nodeData.node_type = 'protocol' // Default node type
    } else {
      nodeData.node_type = node_type || 'protocol'
      // For regular node types, we'll need to find the corresponding block
      // This is a temporary solution until migration is run
    }

    const { data: newNode, error: nodeError } = await auth.supabase
      .from('tree_nodes')
      .insert(nodeData)
      .select()
      .single()

    if (nodeError) {
      console.error('Database error creating node:', nodeError)
      console.error('Error details:', {
        code: nodeError.code,
        message: nodeError.message,
        details: nodeError.details,
        hint: nodeError.hint
      })
      
      // Return specific error messages based on the error type
      if (nodeError.code === '23503') {
        return NextResponse.json({ 
          error: 'Invalid tree ID. The experiment tree does not exist.' 
        }, { status: 400 })
      } else if (nodeError.code === '23514') {
        return NextResponse.json({ 
          error: `Invalid node type. Must be one of: ${allowedNodeTypes.join(', ')} or a valid custom block ID` 
        }, { status: 400 })
      } else {
        return NextResponse.json({ 
          error: `Failed to create node: ${nodeError.message}`,
          details: nodeError.details || nodeError.hint
        }, { status: 500 })
      }
    }

    // Create the node content if provided
    if (content) {
      const { error: contentError } = await auth.supabase
        .from('node_content')
        .insert({
          node_id: newNode.id,
          content,
          status: 'draft'
        })

      if (contentError) {
        console.error('Error creating node content:', contentError)
        // Don't fail the entire operation if content creation fails
      }
    }

    return NextResponse.json({ node: newNode })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in POST /api/trees/[treeId]/nodes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}