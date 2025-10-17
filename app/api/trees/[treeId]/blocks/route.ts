import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'
import { checkTreePermission } from '@/lib/permission-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  try {
    const { treeId } = await params

    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    let userId: string | undefined

    if (authHeader) {
      // Extract the token
      const token = authHeader.replace('Bearer ', '')
      
      // Verify the token and get user
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
      }
    }

    // Check tree permissions
    const permissions = await checkTreePermission(treeId, userId)
    
    if (!permissions.canView) {
      return NextResponse.json(
        { message: 'Access denied' },
        { status: 403 }
      )
    }

    // Fetch tree blocks (unified system)
    const { data: treeBlocks, error: treeBlocksError } = await supabase
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
        const { count, error: countError } = await supabase
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

    // Get the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'No authorization header' },
        { status: 401 }
      )
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      )
    }

    // Check tree permissions - only members can create blocks
    const permissions = await checkTreePermission(treeId, user.id)
    
    if (!permissions.canEdit) {
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
