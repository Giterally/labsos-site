import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError, type AuthContext } from '@/lib/auth-middleware'
import { PermissionService } from '@/lib/permission-service'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
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
      // Authenticate the request for private projects
      let authContext: AuthContext
      try {
        authContext = await authenticateRequest(request)
      } catch (error) {
        if (error instanceof AuthError) {
          return NextResponse.json(
            { message: error.message },
            { status: error.statusCode }
          )
        }
        return NextResponse.json(
          { message: 'Authentication failed' },
          { status: 401 }
        )
      }

      const { user, supabase } = authContext
      const permissionService = new PermissionService(supabase, user.id)
      const permissions = await permissionService.checkTreeAccess(treeId)
      if (!permissions.canRead) {
        return NextResponse.json({ message: 'Access denied' }, { status: 403 })
      }
      client = supabase
    }

    // Fetch tree blocks (unified system)
    const { data: treeBlocks, error: treeBlocksError } = await client
      .from('tree_blocks')
      .select('*')
      .eq('tree_id', treeId)
      .order('position', { ascending: true })

    if (treeBlocksError) {
      console.error('Error fetching tree blocks:', treeBlocksError)
      return NextResponse.json({ error: 'Failed to fetch tree blocks' }, { status: 500 })
    }

    // Get node counts for each block
    const blocksWithCounts = await Promise.all(
      (treeBlocks || []).map(async (block) => {
        const { count, error: countError } = await client
          .from('tree_nodes')
          .select('*', { count: 'exact', head: true })
          .eq('block_id', block.id)
        
        return {
          ...block,
          node_count: count || 0
        }
      })
    )

    // Return tree blocks in unified format with node counts
    return NextResponse.json({ 
      treeBlocks: blocksWithCounts
    })
  } catch (error) {
    console.error('Error in GET /api/trees/[treeId]/blocks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params
    const { name, blockType } = await request.json()

    if (!name || !blockType) {
      return NextResponse.json({ error: 'Name and block type are required' }, { status: 400 })
    }

    // Authenticate the request
    let authContext: AuthContext
    try {
      authContext = await authenticateRequest(request)
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.statusCode }
        )
      }
      return NextResponse.json(
        { message: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { user, supabase } = authContext

    // Initialize permission service
    const permissionService = new PermissionService(supabase, user.id)

    // Check tree permissions - only members can create blocks
    const permissions = await permissionService.checkTreeAccess(treeId)
    
    if (!permissions.canWrite) {
      return NextResponse.json(
        { message: 'You do not have permission to create blocks in this experiment tree' },
        { status: 403 }
      )
    }

    // Get the next position
    const { data: lastBlock, error: positionError } = await supabase
      .from('tree_blocks')
      .select('position')
      .eq('tree_id', treeId)
      .order('position', { ascending: false })
      .limit(1)

    const nextPosition = lastBlock && lastBlock.length > 0 ? lastBlock[0].position + 1 : 0

    // Create the tree block
    const { data: newBlock, error: createError } = await supabase
      .from('tree_blocks')
      .insert({
        tree_id: treeId,
        name,
        description: `${blockType} block`,
        block_type: blockType,
        position: nextPosition
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating tree block:', createError)
      return NextResponse.json({ error: 'Failed to create tree block' }, { status: 500 })
    }

    return NextResponse.json({ block: newBlock })
  } catch (error) {
    console.error('Error in POST /api/trees/[treeId]/blocks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
