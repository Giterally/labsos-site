import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { supabaseServer } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; treeId: string } }
) {
  try {
    const { projectId, treeId } = params;

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID - handle both UUID and slug
    let resolvedProjectId = projectId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    // Check project access
    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get experiment tree
    const { data: tree, error: treeError } = await supabaseServer
      .from('experiment_trees')
      .select('*')
      .eq('id', treeId)
      .eq('project_id', resolvedProjectId)
      .single();

    if (treeError || !tree) {
      return NextResponse.json({ error: 'Experiment tree not found' }, { status: 404 });
    }

    // Get blocks for this tree
    const { data: blocks, error: blocksError } = await supabaseServer
      .from('tree_blocks')
      .select('*')
      .eq('tree_id', treeId)
      .order('position');

    if (blocksError) {
      return NextResponse.json({ error: 'Failed to fetch blocks' }, { status: 500 });
    }

    // Get nodes for each block
    const blocksWithNodes = await Promise.all(
      (blocks || []).map(async (block) => {
        const { data: nodes, error: nodesError } = await supabaseServer
          .from('tree_nodes')
          .select('*')
          .eq('block_id', block.id)
          .order('position');

        if (nodesError) {
          console.error('Error fetching nodes for block:', block.id, nodesError);
          return { ...block, nodes: [] };
        }

        return { ...block, nodes: nodes || [] };
      })
    );

    return NextResponse.json({ 
      tree: {
        ...tree,
        blocks: blocksWithNodes
      }
    });

  } catch (error) {
    console.error('Get experiment tree API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; treeId: string } }
) {
  try {
    const { projectId, treeId } = params;
    const body = await request.json();
    const { name, description } = body;
    

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID
    let resolvedProjectId = projectId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    // Check project access
    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update the experiment tree
    const { data: updatedTree, error: updateError } = await supabaseServer
      .from('experiment_trees')
      .update({
        name,
        description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', treeId)
      .eq('project_id', resolvedProjectId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Update experiment tree error:', updateError);
      return NextResponse.json({ error: `Failed to update experiment tree: ${updateError.message}` }, { status: 500 });
    }

    if (!updatedTree) {
      console.error('No tree returned after update');
      return NextResponse.json({ error: 'Tree not found after update' }, { status: 404 });
    }

    console.log('Successfully updated experiment tree:', updatedTree.id);
    return NextResponse.json({ 
      success: true, 
      tree: updatedTree 
    });

  } catch (error) {
    console.error('Update experiment tree API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; treeId: string } }
) {
  try {
    const { projectId, treeId } = params;
    

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID
    let resolvedProjectId = projectId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    // Check project access
    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete the experiment tree (cascade will handle blocks and nodes)
    const { error: deleteError } = await supabaseServer
      .from('experiment_trees')
      .delete()
      .eq('id', treeId)
      .eq('project_id', resolvedProjectId);

    if (deleteError) {
      console.error('Delete experiment tree error:', deleteError);
      return NextResponse.json({ error: `Failed to delete experiment tree: ${deleteError.message}` }, { status: 500 });
    }

    console.log('Successfully deleted experiment tree:', treeId);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete experiment tree API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}