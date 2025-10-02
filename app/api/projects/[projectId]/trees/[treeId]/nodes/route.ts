import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; treeId: string }> }
) {
  const { projectId, treeId } = await params

  try {
    // Mock data for now - replace with Supabase queries
    const mockNodes = [
      {
        id: "node-1",
        title: "Plasmid Preparation",
        description: "Prepare expression plasmid with target gene",
        node_type: "setup",
        content: "## Plasmid Preparation\n\n1. Transform competent E. coli cells with expression plasmid\n2. Plate on selective media\n3. Pick colonies and grow overnight cultures\n4. Extract plasmid DNA using miniprep kit\n5. Verify plasmid by restriction digest",
        step_number: 1,
        order_index: 1,
        metadata: {
          estimated_time: "2-3 hours",
          difficulty: "beginner",
          equipment: ["Thermal cycler", "Centrifuge", "Gel electrophoresis setup"]
        },
        tree_id: treeId,
        parent_node_id: null,
        created_by: "user-1",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-20T14:30:00Z"
      },
      {
        id: "node-2",
        title: "Cell Culture Setup",
        description: "Prepare E. coli culture for protein expression",
        node_type: "setup",
        content: "## Cell Culture Setup\n\n1. Inoculate 5ml LB broth with single colony\n2. Grow overnight at 37°C with shaking (200 rpm)\n3. Dilute 1:100 into fresh LB broth\n4. Grow to OD600 = 0.6-0.8\n5. Add IPTG to final concentration of 1mM",
        step_number: 2,
        order_index: 2,
        metadata: {
          estimated_time: "4-6 hours",
          difficulty: "beginner",
          equipment: ["Shaking incubator", "Spectrophotometer"]
        },
        tree_id: treeId,
        parent_node_id: null,
        created_by: "user-1",
        created_at: "2024-01-15T10:30:00Z",
        updated_at: "2024-01-20T15:00:00Z"
      }
    ]

    return NextResponse.json({ nodes: mockNodes })
  } catch (error) {
    console.error('Error fetching nodes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch nodes' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; treeId: string }> }
) {
  const { projectId, treeId } = await params

  try {
    const body = await req.json()
    const {
      title,
      description,
      node_type = 'protocol',
      content,
      step_number,
      order_index,
      parent_node_id,
      metadata = {}
    } = body

    // Validate required fields
    if (!title) {
      return NextResponse.json(
        { error: 'Missing required field: title' },
        { status: 400 }
      )
    }

    // Validate enum values
    const validNodeTypes = [
      'setup', 'calibration', 'run', 'analysis', 'post_processing', 
      'handover', 'protocol', 'equipment', 'data', 'code', 'video'
    ]

    if (!validNodeTypes.includes(node_type)) {
      return NextResponse.json(
        { error: 'Invalid node_type. Must be one of: ' + validNodeTypes.join(', ') },
        { status: 400 }
      )
    }

    // Mock node creation - replace with Supabase insert
    const newNode = {
      id: `node-${Date.now()}`,
      title,
      description: description || '',
      node_type,
      content: content || '',
      step_number: step_number || 1,
      order_index: order_index || 1,
      metadata,
      tree_id: treeId,
      parent_node_id: parent_node_id || null,
      created_by: 'user-1', // This should come from auth
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // In a real implementation, you would:
    // 1. Insert into Supabase nodes table
    // 2. Return the created node

    return NextResponse.json({ node: newNode }, { status: 201 })
  } catch (error) {
    console.error('Error creating node:', error)
    return NextResponse.json(
      { error: 'Failed to create node' },
      { status: 500 }
    )
  }
}
