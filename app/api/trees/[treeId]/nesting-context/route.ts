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

    // Get current tree info and check project visibility
    const { data: currentTree, error: treeError } = await supabaseServer
      .from('experiment_trees')
      .select('id, name, description, status, project_id')
      .eq('id', treeId)
      .single()

    if (treeError || !currentTree) {
      return NextResponse.json({ error: 'Tree not found' }, { status: 404 })
    }

    const { data: project, error: projectError } = await supabaseServer
      .from('projects')
      .select('visibility')
      .eq('id', currentTree.project_id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    let client: any = supabaseServer
    let userPermissions: PermissionService | null = null

    // Authenticate if private project
    if (project.visibility === 'private') {
      const auth = await authenticateRequest(request)
      const permissions = new PermissionService(auth.supabase, auth.user.id)
      const access = await permissions.checkTreeAccess(treeId)
      
      if (!access.canRead) {
        return NextResponse.json({ message: 'Access denied' }, { status: 403 })
      }
      
      client = auth.supabase
      userPermissions = permissions
    }

    // Find parent trees (nodes that reference this tree in their referenced_tree_ids array)
    const { data: parentNodes, error: parentError } = await client
      .from('tree_nodes')
      .select(`
        id,
        name,
        tree_id,
        referenced_tree_ids,
        tree:experiment_trees!tree_id (
          id,
          name,
          project_id
        )
      `)
      .contains('referenced_tree_ids', [treeId])

    if (parentError) {
      console.error('Error fetching parent nodes:', parentError)
      return NextResponse.json({ error: 'Failed to fetch parent trees' }, { status: 500 })
    }

    // Find child trees (nodes in this tree that reference other trees)
    // Filter out null (empty arrays are filtered in JavaScript below at lines 113-118)
    const { data: childNodes, error: childError } = await client
      .from('tree_nodes')
      .select(`
        id,
        name,
        referenced_tree_ids
      `)
      .eq('tree_id', treeId)
      .not('referenced_tree_ids', 'is', null)

    if (childError) {
      console.error('Error fetching child nodes:', childError)
      return NextResponse.json({ error: 'Failed to fetch child trees' }, { status: 500 })
    }

    // Filter and format parent trees (check permissions if needed)
    const parents = await Promise.all(
      (parentNodes || []).map(async (node: any) => {
        const tree = Array.isArray(node.tree) ? node.tree[0] : node.tree
        if (!tree) return null

        // Check permission if needed
        if (userPermissions) {
          const canAccess = await userPermissions.checkTreeAccess(tree.id)
          if (!canAccess.canRead) return null
        }

        return {
          tree_id: tree.id,
          tree_name: tree.name,
          node_id: node.id,
          node_name: node.name
        }
      })
    )

    // Collect all unique child tree IDs
    const allChildTreeIds = new Set<string>()
    childNodes?.forEach((node: any) => {
      if (node.referenced_tree_ids && Array.isArray(node.referenced_tree_ids)) {
        node.referenced_tree_ids.forEach((id: string) => {
          if (id) allChildTreeIds.add(id)
        })
      }
    })

    // Fetch all child trees
    let childTreesMap = new Map()
    if (allChildTreeIds.size > 0) {
      const { data: childTrees, error: childTreesError } = await client
        .from('experiment_trees')
        .select('id, name, project_id')
        .in('id', Array.from(allChildTreeIds))
      
      if (!childTreesError && childTrees) {
        for (const tree of childTrees) {
          if (userPermissions) {
            const canAccess = await userPermissions.checkTreeAccess(tree.id)
            if (canAccess.canRead) {
              childTreesMap.set(tree.id, {
                id: tree.id,
                name: tree.name
              })
            }
          } else {
            childTreesMap.set(tree.id, {
              id: tree.id,
              name: tree.name
            })
          }
        }
      }
    }

    // Filter and format child trees (check permissions if needed)
    const children: Array<{tree_id: string, tree_name: string, node_id: string, node_name: string}> = []
    childNodes?.forEach((node: any) => {
      if (node.referenced_tree_ids && Array.isArray(node.referenced_tree_ids)) {
        node.referenced_tree_ids.forEach((treeId: string) => {
          const tree = childTreesMap.get(treeId)
          if (tree) {
            children.push({
              tree_id: tree.id,
              tree_name: tree.name,
              node_id: node.id,
              node_name: node.name
            })
          }
        })
      }
    })

    return NextResponse.json({
      current: {
        id: currentTree.id,
        name: currentTree.name,
        description: currentTree.description,
        status: currentTree.status,
        project_id: currentTree.project_id
      },
      parents: parents.filter(p => p !== null),
      children: children
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error in GET /api/trees/[treeId]/nesting-context:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

