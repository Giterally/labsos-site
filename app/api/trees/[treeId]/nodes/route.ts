import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { supabaseServer } from '@/lib/supabase-server'
import { fetchNodeAndGenerateEmbedding } from '@/lib/embedding-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params
    console.log('[GET /api/trees/[treeId]/nodes] Starting request for treeId:', treeId)

    // Resolve parent project visibility using server client
    const { data: treeMeta, error: treeMetaErr } = await supabaseServer
      .from('experiment_trees')
      .select('id, project_id')
      .eq('id', treeId)
      .single()

    if (treeMetaErr || !treeMeta) {
      console.error('[GET /api/trees/[treeId]/nodes] Tree not found:', treeMetaErr)
      return NextResponse.json({ error: 'Experiment tree not found' }, { status: 404 })
    }

    console.log('[GET /api/trees/[treeId]/nodes] Found tree, project_id:', treeMeta.project_id)

    const { data: proj, error: projErr } = await supabaseServer
      .from('projects')
      .select('visibility')
      .eq('id', treeMeta.project_id)
      .single()

    if (projErr || !proj) {
      console.error('[GET /api/trees/[treeId]/nodes] Project not found:', projErr)
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    console.log('[GET /api/trees/[treeId]/nodes] Project visibility:', proj.visibility)

    let client: any = supabaseServer
    let auth: AuthContext | null = null
    if (proj.visibility === 'private') {
      auth = await authenticateRequest(request)
      const permissions = new PermissionService(auth.supabase, auth.user.id)
      const access = await permissions.checkTreeAccess(treeId)
      if (!access.canRead) {
        return NextResponse.json({ message: 'Access denied' }, { status: 403 })
      }
      client = auth.supabase
    }

    // Get nodes for the tree with their content, attachments, and links
    console.log('[GET /api/trees/[treeId]/nodes] Fetching nodes with client type:', client === supabaseServer ? 'server' : 'authenticated')
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
          version,
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
      console.error('[GET /api/trees/[treeId]/nodes] Error fetching nodes:', nodesError)
      console.error('[GET /api/trees/[treeId]/nodes] Error details:', {
        message: nodesError.message,
        details: nodesError.details,
        hint: nodesError.hint,
        code: nodesError.code
      })
      return NextResponse.json({ 
        error: 'Failed to fetch nodes',
        details: nodesError.message 
      }, { status: 500 })
    }

    console.log('[GET /api/trees/[treeId]/nodes] Successfully fetched', nodes?.length || 0, 'nodes')

    // Fetch profile data for created_by and updated_by user IDs
    const userIds = new Set<string>()
    nodes.forEach(node => {
      if (node.created_by) userIds.add(node.created_by)
      if (node.updated_by) userIds.add(node.updated_by)
    })

    let profilesMap = new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>()
    if (userIds.size > 0) {
      try {
        const { data: profiles, error: profilesError } = await client
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', Array.from(userIds))
        
        if (!profilesError && profiles) {
          profiles.forEach(profile => {
            if (profile && profile.id) {
              profilesMap.set(profile.id, {
                id: profile.id,
                full_name: profile.full_name || null,
                avatar_url: profile.avatar_url || null
              })
            }
          })
          console.log(`[GET /api/trees/[treeId]/nodes] Fetched ${profilesMap.size} profiles for ${userIds.size} user IDs`)
        } else if (profilesError) {
          console.warn('[GET /api/trees/[treeId]/nodes] Error fetching profiles:', profilesError)
        }
      } catch (profileErr) {
        console.warn('[GET /api/trees/[treeId]/nodes] Exception fetching profiles:', profileErr)
        // Continue without profiles - not critical for the main functionality
      }
    }

    // Check access permissions for referenced trees if user is authenticated
    let userPermissions: any = null
    if (auth) {
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

    // Fetch all dependencies for nodes in this tree
    const nodeIds = nodes.map(n => n.id)
    let dependenciesMap = new Map<string, Array<{
      id: string
      to_node_id: string
      to_node_name: string
      dependency_type: string
      evidence_text?: string
    }>>()
    
    console.log(`[FETCH_NODES] Fetching dependencies for ${nodeIds.length} nodes in tree ${treeId}`)
    
    if (nodeIds.length > 0) {
      // Fetch dependencies using from_node_id (new schema from migration 035)
      // Support both old (node_id) and new (from_node_id) columns for backwards compatibility
      // Query for new schema first
      const { data: newDeps, error: newDepsError } = await client
        .from('node_dependencies')
        .select(`
          id,
          from_node_id,
          to_node_id,
          node_id,
          depends_on_node_id,
          dependency_type,
          evidence_text,
          confidence
        `)
        .in('from_node_id', nodeIds)
      
      console.log(`[FETCH_NODES] New schema dependencies query: found ${newDeps?.length || 0}, error:`, newDepsError?.message)
      if (newDeps && newDeps.length > 0) {
        console.log(`[FETCH_NODES] Sample new schema dependency:`, {
          id: newDeps[0].id,
          from_node_id: newDeps[0].from_node_id,
          to_node_id: newDeps[0].to_node_id,
          dependency_type: newDeps[0].dependency_type
        })
      }
      
      // Query for old schema (for backwards compatibility)
      const { data: oldDeps, error: oldDepsError } = await client
        .from('node_dependencies')
        .select(`
          id,
          from_node_id,
          to_node_id,
          node_id,
          depends_on_node_id,
          dependency_type,
          evidence_text,
          confidence
        `)
        .in('node_id', nodeIds)
        .is('from_node_id', null) // Only get old schema entries
      
      console.log(`[FETCH_NODES] Old schema dependencies query: found ${oldDeps?.length || 0}, error:`, oldDepsError?.message)
      
      // Combine results, preferring new schema
      const dependencies = [
        ...(newDeps || []),
        ...(oldDeps || [])
      ]
      const depsError = newDepsError || oldDepsError
      
      console.log(`[FETCH_NODES] Total dependencies found: ${dependencies.length}`)
      
      if (!depsError && dependencies && dependencies.length > 0) {
        // Get all target node IDs (support both old and new schema)
        const targetNodeIds = new Set<string>()
        dependencies.forEach(dep => {
          const targetId = dep.to_node_id || dep.depends_on_node_id
          if (targetId) targetNodeIds.add(targetId)
        })
        
        // Fetch target node names
        let targetNodesMap = new Map<string, string>()
        if (targetNodeIds.size > 0) {
          const { data: targetNodes, error: targetError } = await client
            .from('tree_nodes')
            .select('id, name')
            .in('id', Array.from(targetNodeIds))
          
          if (!targetError && targetNodes) {
            targetNodes.forEach(n => {
              targetNodesMap.set(n.id, n.name)
            })
          }
        }
        
        // Build dependencies map (support both old and new schema)
        dependencies.forEach(dep => {
          const fromNodeId = dep.from_node_id || dep.node_id
          const toNodeId = dep.to_node_id || dep.depends_on_node_id
          
          if (!fromNodeId || !toNodeId) {
            console.warn(`[FETCH_NODES] Skipping dependency ${dep.id}: missing from_node_id (${fromNodeId}) or to_node_id (${toNodeId})`)
            return
          }
          
          const toNodeName = targetNodesMap.get(toNodeId) || 'Unknown node'
          
          if (!dependenciesMap.has(fromNodeId)) {
            dependenciesMap.set(fromNodeId, [])
          }
          
          dependenciesMap.get(fromNodeId)!.push({
            id: dep.id,
            to_node_id: toNodeId,
            to_node_name: toNodeName,
            dependency_type: dep.dependency_type || 'requires',
            evidence_text: dep.evidence_text
          })
        })
        
        console.log(`[FETCH_NODES] Built dependencies map with ${dependenciesMap.size} nodes having dependencies`)
        if (dependenciesMap.size > 0) {
          const sampleEntry = Array.from(dependenciesMap.entries())[0]
          console.log(`[FETCH_NODES] Sample: node ${sampleEntry[0]} has ${sampleEntry[1].length} dependency/dependencies`)
        }
      } else {
        console.warn(`[FETCH_NODES] No dependencies found or error occurred:`, depsError?.message)
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
      
      // Get dependencies for this node
      const dependencies = dependenciesMap.get(node.id) || []
      
      if (dependencies.length > 0) {
        console.log(`[FETCH_NODES] Node "${node.name}" (${node.id.substring(0, 8)}) has ${dependencies.length} dependency/dependencies`)
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
        dependencies: dependencies,
        metadata: {
          created: node.created_at,
          updated: node.updated_at,
          type: node.node_type, // Keep original node_type in metadata
          position: node.position,
          created_by_profile: node.created_by ? profilesMap.get(node.created_by) || null : null,
          updated_by_profile: node.updated_by ? profilesMap.get(node.updated_by) || null : null
        }
      }
    })

    return NextResponse.json({ nodes: transformedNodes })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in GET /api/trees/[treeId]/nodes:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error
    })
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
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

    // Trigger embedding generation (non-blocking)
    fetchNodeAndGenerateEmbedding(newNode.id, auth.supabase).catch(err => {
      console.error('Embedding generation failed:', err);
    });

    return NextResponse.json({ node: newNode })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in POST /api/trees/[treeId]/nodes:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}