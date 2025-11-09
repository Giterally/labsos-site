import { SupabaseClient } from '@supabase/supabase-js';

export interface TreeContext {
  tree: {
    id: string;
    name: string;
    description: string | null;
    status: string;
  };
  blocks: Array<{
    id: string;
    name: string;
    type: string;
    position: number;
    nodes: Array<{
      id: string;
      name: string;
      description: string | null;
      type: string;
      status: string;
      position: number;
      content: string | null;
      dependencies: Array<{
        to_node_name: string;
        dependency_type: string;
        evidence_text: string | null;
      }>;
    }>;
  }>;
}

/**
 * Fetch essential tree structure: tree, blocks, nodes, content, and dependencies
 */
export async function fetchTreeContext(
  supabase: SupabaseClient,
  treeId: string
): Promise<TreeContext | null> {
  console.log('[fetchTreeContext] Starting fetch for treeId:', treeId);
  console.log('[fetchTreeContext] Using client type:', supabase ? 'SupabaseClient' : 'null');
  
  try {
    // Fetch tree metadata
    console.log('[fetchTreeContext] Step 1: Fetching tree metadata...');
    const { data: tree, error: treeError } = await supabase
      .from('experiment_trees')
      .select('id, name, description, status')
      .eq('id', treeId)
      .single();

    if (treeError) {
      console.error('[fetchTreeContext] ERROR fetching tree:', {
        treeId,
        error: treeError.message,
        code: treeError.code,
        details: treeError.details,
        hint: treeError.hint,
        fullError: JSON.stringify(treeError, null, 2)
      });
      return null;
    }

    if (!tree) {
      console.error('[fetchTreeContext] Tree not found:', treeId);
      return null;
    }

    console.log('[fetchTreeContext] ✓ Tree fetched:', { id: tree.id, name: tree.name });

    // Fetch all blocks for this tree
    console.log('[fetchTreeContext] Step 2: Fetching blocks...');
    const { data: blocks, error: blocksError } = await supabase
      .from('tree_blocks')
      .select('id, name, block_type, position')
      .eq('tree_id', treeId)
      .order('position', { ascending: true });

    if (blocksError) {
      console.error('[fetchTreeContext] ERROR fetching blocks:', {
        treeId,
        error: blocksError.message,
        code: blocksError.code,
        details: blocksError.details,
        hint: blocksError.hint,
        fullError: JSON.stringify(blocksError, null, 2)
      });
      return null;
    }

    console.log('[fetchTreeContext] ✓ Blocks fetched:', blocks?.length || 0, 'blocks');
    if (blocks && blocks.length > 0) {
      console.log('[fetchTreeContext] Block details:', blocks.map(b => ({ id: b.id, name: b.name, block_type: b.block_type })));
    }

    // Fetch all nodes (basic fields only, no nested data)
    console.log('[fetchTreeContext] Step 3: Fetching nodes...');
    const { data: nodes, error: nodesError } = await supabase
      .from('tree_nodes')
      .select(`
        id,
        name,
        description,
        node_type,
        status,
        position,
        block_id
      `)
      .eq('tree_id', treeId)
      .order('position', { ascending: true });

    if (nodesError) {
      console.error('[fetchTreeContext] ERROR fetching nodes:', {
        treeId,
        error: nodesError.message,
        code: nodesError.code,
        details: nodesError.details,
        hint: nodesError.hint,
        fullError: JSON.stringify(nodesError, null, 2)
      });
      return null;
    }

    console.log('[fetchTreeContext] ✓ Nodes fetched:', nodes?.length || 0, 'nodes');
    if (nodes && nodes.length > 0) {
      console.log('[fetchTreeContext] Node details (first 3):', nodes.slice(0, 3).map(n => ({ id: n.id, name: n.name, block_id: n.block_id })));
    }

    // Fetch node content
    const nodeIds = (nodes || []).map(n => n.id);
    let nodeContentMap = new Map<string, string | null>();
    
    if (nodeIds.length > 0) {
      console.log('[fetchTreeContext] Step 4: Fetching node content for', nodeIds.length, 'nodes...');
      const { data: contentData, error: contentError } = await supabase
        .from('node_content')
        .select('node_id, content')
        .in('node_id', nodeIds);

      if (contentError) {
        console.error('[fetchTreeContext] ERROR fetching node content:', {
          error: contentError.message,
          code: contentError.code,
          details: contentError.details,
          hint: contentError.hint,
          fullError: JSON.stringify(contentError, null, 2)
        });
        // Don't return null - continue without content
      } else if (contentData) {
        contentData.forEach((item: any) => {
          nodeContentMap.set(item.node_id, item.content);
        });
        console.log('[fetchTreeContext] ✓ Node content fetched:', contentData.length, 'content entries');
      } else {
        console.log('[fetchTreeContext] ✓ No node content found (empty result)');
      }
    } else {
      console.log('[fetchTreeContext] Step 4: Skipping content fetch (no nodes)');
    }

    // Fetch dependencies

    // Fetch all dependencies for nodes in this tree (support both old and new schema)
    let dependenciesMap = new Map<string, Array<{
      to_node_name: string;
      dependency_type: string;
      evidence_text: string | null;
    }>>();

    if (nodeIds.length > 0) {
      console.log('[fetchTreeContext] Step 5: Fetching dependencies for', nodeIds.length, 'nodes...');
      
      // Query for new schema (from_node_id, to_node_id)
      const { data: newDeps, error: newDepsError } = await supabase
        .from('node_dependencies')
        .select(`
          from_node_id,
          to_node_id,
          dependency_type,
          evidence_text,
          to_node:tree_nodes!node_dependencies_to_node_id_fkey(name)
        `)
        .in('from_node_id', nodeIds);

      if (newDepsError) {
        console.error('[fetchTreeContext] ERROR fetching new schema dependencies:', {
          error: newDepsError.message,
          code: newDepsError?.code
        });
      } else {
        console.log('[fetchTreeContext] New schema dependencies:', newDeps?.length || 0);
      }

      // Query for old schema (node_id, depends_on_node_id) for backwards compatibility
      const { data: oldDeps, error: oldDepsError } = await supabase
        .from('node_dependencies')
        .select(`
          node_id,
          depends_on_node_id,
          dependency_type,
          evidence_text,
          depends_on:tree_nodes!node_dependencies_depends_on_node_id_fkey(name)
        `)
        .in('node_id', nodeIds)
        .is('from_node_id', null);

      if (oldDepsError) {
        console.error('[fetchTreeContext] ERROR fetching old schema dependencies:', {
          error: oldDepsError.message,
          code: oldDepsError?.code
        });
      } else {
        console.log('[fetchTreeContext] Old schema dependencies:', oldDeps?.length || 0);
      }

      // Combine and organize dependencies
      const allDeps = [
        ...(newDeps || []).map((dep: any) => ({
          from_node_id: dep.from_node_id,
          to_node_name: dep.to_node?.name || 'Unknown',
          dependency_type: dep.dependency_type,
          evidence_text: dep.evidence_text,
        })),
        ...(oldDeps || []).map((dep: any) => ({
          from_node_id: dep.node_id,
          to_node_name: dep.depends_on?.name || 'Unknown',
          dependency_type: dep.dependency_type,
          evidence_text: dep.evidence_text,
        })),
      ];

      allDeps.forEach((dep: any) => {
        if (!dependenciesMap.has(dep.from_node_id)) {
          dependenciesMap.set(dep.from_node_id, []);
        }
        dependenciesMap.get(dep.from_node_id)!.push({
          to_node_name: dep.to_node_name,
          dependency_type: dep.dependency_type,
          evidence_text: dep.evidence_text,
        });
      });

      console.log('[fetchTreeContext] ✓ Dependencies processed:', dependenciesMap.size, 'nodes with dependencies');
    } else {
      console.log('[fetchTreeContext] Step 5: Skipping dependencies fetch (no nodes)');
    }

    // Organize nodes by block
    console.log('[fetchTreeContext] Step 6: Organizing nodes by block...');
    const blocksWithNodes = (blocks || []).map(block => {
      const blockNodes = (nodes || [])
        .filter(node => node.block_id === block.id)
        .map(node => {
          // Get content from the map
          const content = nodeContentMap.get(node.id) || null;

          return {
            id: node.id,
            name: node.name,
            description: node.description,
            type: node.node_type,
            status: node.status,
            position: node.position,
            content: content,
            dependencies: dependenciesMap.get(node.id) || [],
          };
        })
        .sort((a, b) => a.position - b.position);

      return {
        id: block.id,
        name: block.name,
        type: block.block_type || 'custom',
        position: block.position,
        nodes: blockNodes,
      };
    });

    console.log('[fetchTreeContext] ✓ Organization complete:', {
      totalBlocks: blocksWithNodes.length,
      totalNodes: blocksWithNodes.reduce((sum, b) => sum + b.nodes.length, 0)
    });

    const result = {
      tree: {
        id: tree.id,
        name: tree.name,
        description: tree.description,
        status: tree.status,
      },
      blocks: blocksWithNodes,
    };

    console.log('[fetchTreeContext] ✓ SUCCESS - Returning tree context');
    return result;
  } catch (error) {
    console.error('[fetchTreeContext] FATAL ERROR:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    });
    return null;
  }
}

/**
 * Format tree context as a readable string for LLM consumption
 */
export function formatTreeContextForLLM(context: TreeContext): string {
  let formatted = `EXPERIMENT TREE: ${context.tree.name}\n`;
  
  if (context.tree.description) {
    formatted += `Description: ${context.tree.description}\n`;
  }
  
  formatted += `Status: ${context.tree.status}\n\n`;
  
  formatted += `STRUCTURE:\n`;
  formatted += `This tree contains ${context.blocks.length} block(s) with a total of ${context.blocks.reduce((sum, block) => sum + block.nodes.length, 0)} node(s).\n\n`;
  
  context.blocks.forEach((block, blockIndex) => {
    formatted += `\n---\n`;
    formatted += `BLOCK ${blockIndex + 1}: ${block.name} (Type: ${block.type}, Position: ${block.position})\n`;
    formatted += `Contains ${block.nodes.length} node(s):\n\n`;
    
    block.nodes.forEach((node, nodeIndex) => {
      formatted += `  ${nodeIndex + 1}. NODE: ${node.name}\n`;
      formatted += `     - Type: ${node.type}\n`;
      formatted += `     - Status: ${node.status}\n`;
      formatted += `     - Position: ${node.position}\n`;
      
      if (node.description) {
        formatted += `     - Description: ${node.description}\n`;
      }
      
      if (node.content) {
        // Truncate very long content to avoid token limits
        const contentPreview = node.content.length > 2000 
          ? node.content.substring(0, 2000) + '... [content truncated]'
          : node.content;
        formatted += `     - Content: ${contentPreview}\n`;
      }
      
      if (node.dependencies.length > 0) {
        formatted += `     - Dependencies (${node.dependencies.length}):\n`;
        node.dependencies.forEach(dep => {
          formatted += `       • ${dep.dependency_type}: depends on "${dep.to_node_name}"${dep.evidence_text ? ` (${dep.evidence_text})` : ''}\n`;
        });
      }
      
      formatted += `\n`;
    });
  });
  
  return formatted;
}

