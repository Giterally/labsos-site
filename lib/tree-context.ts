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
      links: Array<{
        name: string;
        url: string;
        description: string | null;
        link_type: string | null;
      }>;
      attachments: Array<{
        name: string;
        file_type: string | null;
        file_url: string | null;
        description: string | null;
        version: string | null;
      }>;
      provenance: any | null;
      confidence: number | null;
      referenced_tree_ids: string[];
      referenced_trees?: Array<{
        name: string;
        description: string | null;
      }>;
      dependencies: Array<{
        to_node_name: string;
        dependency_type: string;
        evidence_text: string | null;
      }>;
    }>;
  }>;
  parent_trees?: Array<{
    tree_id: string;
    tree_name: string;
    tree_description: string | null;
    node_id: string;
    node_name: string;
  }>;
  child_trees?: Array<{
    tree_id: string;
    tree_name: string;
    tree_description: string | null;
    node_id: string;
    node_name: string;
  }>;
  hierarchy_info?: {
    block_count: number;
    node_count: number;
    dependency_chains: Array<{
      chain: string[];
      depth: number;
    }>;
  };
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

    // Fetch node content, links, attachments, and metadata
    const nodeIds = (nodes || []).map(n => n.id);
    let nodeContentMap = new Map<string, string | null>();
    let nodeLinksMap = new Map<string, Array<{ name: string; url: string; description: string | null; link_type: string | null }>>();
    let nodeAttachmentsMap = new Map<string, Array<{ name: string; file_type: string | null; description: string | null }>>();
    let nodeMetadataMap = new Map<string, { provenance: any | null; confidence: number | null; referenced_tree_ids: string[] }>();
    
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

      // Fetch node links
      console.log('[fetchTreeContext] Step 4b: Fetching node links for', nodeIds.length, 'nodes...');
      const { data: linksData, error: linksError } = await supabase
        .from('node_links')
        .select('node_id, name, url, description, link_type')
        .in('node_id', nodeIds)
        .order('position', { ascending: true });

      if (linksError) {
        console.error('[fetchTreeContext] ERROR fetching node links:', {
          error: linksError.message,
          code: linksError.code
        });
        // Continue without links
      } else if (linksData) {
        linksData.forEach((link: any) => {
          if (!nodeLinksMap.has(link.node_id)) {
            nodeLinksMap.set(link.node_id, []);
          }
          nodeLinksMap.get(link.node_id)!.push({
            name: link.name,
            url: link.url,
            description: link.description,
            link_type: link.link_type,
          });
        });
        console.log('[fetchTreeContext] ✓ Node links fetched:', linksData.length, 'link entries');
      }

      // Fetch node attachments
      console.log('[fetchTreeContext] Step 4c: Fetching node attachments for', nodeIds.length, 'nodes...');
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from('node_attachments')
        .select('node_id, name, file_type, file_url, description, version')
        .in('node_id', nodeIds)
        .order('position', { ascending: true });

      if (attachmentsError) {
        console.error('[fetchTreeContext] ERROR fetching node attachments:', {
          error: attachmentsError.message,
          code: attachmentsError.code
        });
        // Continue without attachments
      } else if (attachmentsData) {
        attachmentsData.forEach((attachment: any) => {
          if (!nodeAttachmentsMap.has(attachment.node_id)) {
            nodeAttachmentsMap.set(attachment.node_id, []);
          }
          nodeAttachmentsMap.get(attachment.node_id)!.push({
            name: attachment.name,
            file_type: attachment.file_type,
            file_url: attachment.file_url,
            description: attachment.description,
            version: attachment.version,
          });
        });
        console.log('[fetchTreeContext] ✓ Node attachments fetched:', attachmentsData.length, 'attachment entries');
      }

      // Fetch node metadata (provenance, confidence, referenced_tree_ids)
      console.log('[fetchTreeContext] Step 4d: Fetching node metadata for', nodeIds.length, 'nodes...');
      const { data: nodesWithMetadata, error: metadataError } = await supabase
        .from('tree_nodes')
        .select('id, provenance, confidence, referenced_tree_ids')
        .in('id', nodeIds);

      if (metadataError) {
        console.error('[fetchTreeContext] ERROR fetching node metadata:', {
          error: metadataError.message,
          code: metadataError.code
        });
        // Continue without metadata
      } else if (nodesWithMetadata) {
        nodesWithMetadata.forEach((node: any) => {
          nodeMetadataMap.set(node.id, {
            provenance: node.provenance,
            confidence: node.confidence,
            referenced_tree_ids: node.referenced_tree_ids || [],
          });
        });
        console.log('[fetchTreeContext] ✓ Node metadata fetched:', nodesWithMetadata.length, 'metadata entries');
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

    // Fetch referenced tree names if any nodes have referenced_tree_ids
    const allReferencedTreeIds = new Set<string>();
    nodes?.forEach(node => {
      const metadata = nodeMetadataMap.get(node.id);
      if (metadata?.referenced_tree_ids) {
        metadata.referenced_tree_ids.forEach((treeId: string) => {
          if (treeId) allReferencedTreeIds.add(treeId);
        });
      }
    });

    let referencedTreesMap = new Map<string, { name: string; description: string | null }>();
    if (allReferencedTreeIds.size > 0) {
      console.log('[fetchTreeContext] Step 5b: Fetching referenced tree names for', allReferencedTreeIds.size, 'trees...');
      const { data: referencedTrees, error: treesError } = await supabase
        .from('experiment_trees')
        .select('id, name, description')
        .in('id', Array.from(allReferencedTreeIds));

      if (treesError) {
        console.error('[fetchTreeContext] ERROR fetching referenced trees:', {
          error: treesError.message,
          code: treesError.code
        });
      } else if (referencedTrees) {
        referencedTrees.forEach((tree: any) => {
          referencedTreesMap.set(tree.id, {
            name: tree.name,
            description: tree.description,
          });
        });
        console.log('[fetchTreeContext] ✓ Referenced trees fetched:', referencedTrees.length, 'trees');
      }
    }

    // Organize nodes by block
    console.log('[fetchTreeContext] Step 6: Organizing nodes by block...');
    const blocksWithNodes = (blocks || []).map(block => {
      const blockNodes = (nodes || [])
        .filter(node => node.block_id === block.id)
        .map(node => {
          // Get content, links, attachments, and metadata from maps
          const content = nodeContentMap.get(node.id) || null;
          const links = nodeLinksMap.get(node.id) || [];
          const attachments = nodeAttachmentsMap.get(node.id) || [];
          const metadata = nodeMetadataMap.get(node.id) || { provenance: null, confidence: null, referenced_tree_ids: [] };
          
          // Get referenced tree names if available
          const referencedTrees = metadata.referenced_tree_ids
            ?.map((treeId: string) => referencedTreesMap.get(treeId))
            .filter(Boolean) || [];

          return {
            id: node.id,
            name: node.name,
            description: node.description,
            type: node.node_type,
            status: node.status,
            position: node.position,
            content: content,
            links: links,
            attachments: attachments,
            provenance: metadata.provenance,
            confidence: metadata.confidence,
            referenced_tree_ids: metadata.referenced_tree_ids,
            referenced_trees: referencedTrees.length > 0 ? referencedTrees : undefined,
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

    // Fetch parent trees (trees that reference this tree)
    console.log('[fetchTreeContext] Step 7: Fetching parent trees...');
    const { data: parentNodes, error: parentError } = await supabase
      .from('tree_nodes')
      .select(`
        id,
        name,
        tree_id,
        tree:experiment_trees!tree_id (
          id,
          name,
          description
        )
      `)
      .contains('referenced_tree_ids', [treeId]);

    let parentTrees: Array<{
      tree_id: string;
      tree_name: string;
      tree_description: string | null;
      node_id: string;
      node_name: string;
    }> = [];

    if (!parentError && parentNodes) {
      parentNodes.forEach((node: any) => {
        const parentTree = Array.isArray(node.tree) ? node.tree[0] : node.tree;
        if (parentTree) {
          parentTrees.push({
            tree_id: parentTree.id,
            tree_name: parentTree.name,
            tree_description: parentTree.description,
            node_id: node.id,
            node_name: node.name,
          });
        }
      });
      console.log('[fetchTreeContext] ✓ Parent trees fetched:', parentTrees.length);
    } else if (parentError) {
      console.error('[fetchTreeContext] ERROR fetching parent trees:', parentError.message);
    }

    // Fetch child trees (trees referenced by nodes in this tree)
    console.log('[fetchTreeContext] Step 8: Fetching child trees...');
    const allChildTreeIds = new Set<string>();
    const childTreeNodeMap = new Map<string, { node_id: string; node_name: string }[]>();
    
    nodes?.forEach(node => {
      const metadata = nodeMetadataMap.get(node.id);
      if (metadata?.referenced_tree_ids) {
        metadata.referenced_tree_ids.forEach((treeId: string) => {
          if (treeId) {
            allChildTreeIds.add(treeId);
            if (!childTreeNodeMap.has(treeId)) {
              childTreeNodeMap.set(treeId, []);
            }
            childTreeNodeMap.get(treeId)!.push({
              node_id: node.id,
              node_name: node.name,
            });
          }
        });
      }
    });

    let childTrees: Array<{
      tree_id: string;
      tree_name: string;
      tree_description: string | null;
      node_id: string;
      node_name: string;
    }> = [];

    if (allChildTreeIds.size > 0) {
      const { data: childTreesData, error: childTreesError } = await supabase
        .from('experiment_trees')
        .select('id, name, description')
        .in('id', Array.from(allChildTreeIds));

      if (!childTreesError && childTreesData) {
        childTreesData.forEach((tree: any) => {
          const referencingNodes = childTreeNodeMap.get(tree.id) || [];
          referencingNodes.forEach(nodeInfo => {
            childTrees.push({
              tree_id: tree.id,
              tree_name: tree.name,
              tree_description: tree.description,
              node_id: nodeInfo.node_id,
              node_name: nodeInfo.node_name,
            });
          });
        });
        console.log('[fetchTreeContext] ✓ Child trees fetched:', childTrees.length);
      } else if (childTreesError) {
        console.error('[fetchTreeContext] ERROR fetching child trees:', childTreesError.message);
      }
    }

    // Build hierarchy info
    console.log('[fetchTreeContext] Step 9: Building hierarchy info...');
    const dependencyChains: Array<{ chain: string[]; depth: number }> = [];
    const visited = new Set<string>();

    const buildChain = (nodeId: string, chain: string[] = [], depth: number = 0): void => {
      if (visited.has(nodeId) || depth > 10) return; // Prevent infinite loops
      visited.add(nodeId);

      const node = nodes?.find(n => n.id === nodeId);
      if (!node) return;

      const newChain = [...chain, node.name];
      const deps = dependenciesMap.get(nodeId) || [];

      if (deps.length === 0) {
        // End of chain
        if (newChain.length > 1) {
          dependencyChains.push({ chain: newChain, depth });
        }
      } else {
        deps.forEach(dep => {
          const depNode = nodes?.find(n => n.name === dep.to_node_name);
          if (depNode) {
            buildChain(depNode.id, newChain, depth + 1);
          }
        });
      }
    };

    // Build chains starting from nodes with no dependencies
    nodes?.forEach(node => {
      const deps = dependenciesMap.get(node.id) || [];
      if (deps.length === 0) {
        buildChain(node.id);
      }
    });

    const hierarchyInfo = {
      block_count: blocksWithNodes.length,
      node_count: blocksWithNodes.reduce((sum, b) => sum + b.nodes.length, 0),
      dependency_chains: dependencyChains.slice(0, 10), // Limit to 10 chains to avoid token bloat
    };

    console.log('[fetchTreeContext] ✓ Hierarchy info built');

    const result: TreeContext = {
      tree: {
        id: tree.id,
        name: tree.name,
        description: tree.description,
        status: tree.status,
      },
      blocks: blocksWithNodes,
      ...(parentTrees.length > 0 && { parent_trees: parentTrees }),
      ...(childTrees.length > 0 && { child_trees: childTrees }),
      hierarchy_info: hierarchyInfo,
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

  // Add hierarchy information
  if (context.hierarchy_info) {
    formatted += `HIERARCHY:\n`;
    formatted += `- This tree contains ${context.hierarchy_info.block_count} block(s) with ${context.hierarchy_info.node_count} total node(s)\n`;
    formatted += `- Blocks are workflow sections that organize nodes into logical groups\n`;
    formatted += `- Nodes are individual steps/components within blocks\n`;
    if (context.hierarchy_info.dependency_chains.length > 0) {
      formatted += `- Dependency chains (showing workflow relationships):\n`;
      context.hierarchy_info.dependency_chains.forEach((chain, idx) => {
        formatted += `  ${idx + 1}. ${chain.chain.join(' → ')}\n`;
      });
    }
    formatted += `\n`;
  }

  // Add nesting hierarchy information
  if (context.parent_trees && context.parent_trees.length > 0) {
    formatted += `NESTING HIERARCHY - PARENT TREES (trees that reference this tree):\n`;
    context.parent_trees.forEach((parent, idx) => {
      formatted += `  ${idx + 1}. "${parent.tree_name}"`;
      if (parent.tree_description) {
        formatted += ` - ${parent.tree_description}`;
      }
      formatted += `\n     Referenced by node "${parent.node_name}" in that tree\n`;
    });
    formatted += `\n`;
  }

  if (context.child_trees && context.child_trees.length > 0) {
    formatted += `NESTING HIERARCHY - CHILD TREES (trees referenced by nodes in this tree):\n`;
    const uniqueChildTrees = new Map<string, { tree_name: string; tree_description: string | null; nodes: string[] }>();
    context.child_trees.forEach(child => {
      if (!uniqueChildTrees.has(child.tree_id)) {
        uniqueChildTrees.set(child.tree_id, {
          tree_name: child.tree_name,
          tree_description: child.tree_description,
          nodes: [],
        });
      }
      uniqueChildTrees.get(child.tree_id)!.nodes.push(child.node_name);
    });
    uniqueChildTrees.forEach((child, idx) => {
      formatted += `  ${idx + 1}. "${child.tree_name}"`;
      if (child.tree_description) {
        formatted += ` - ${child.tree_description}`;
      }
      formatted += `\n     Referenced by node(s): ${child.nodes.join(', ')}\n`;
    });
    formatted += `\n`;
  }
  
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
      
      if (node.links.length > 0) {
        formatted += `     - Links (${node.links.length}):\n`;
        node.links.forEach(link => {
          formatted += `       • ${link.name}${link.link_type ? ` (${link.link_type})` : ''}: ${link.url}`;
          if (link.description) {
            formatted += ` - ${link.description}`;
          }
          formatted += `\n`;
        });
      }
      
      if (node.attachments.length > 0) {
        formatted += `     - Attachments (${node.attachments.length}):\n`;
        node.attachments.forEach(attachment => {
          formatted += `       • ${attachment.name}${attachment.file_type ? ` (${attachment.file_type})` : ''}`;
          if (attachment.version) {
            formatted += ` - Version: ${attachment.version}`;
          }
          if (attachment.file_url) {
            formatted += ` - URL: ${attachment.file_url}`;
          }
          if (attachment.description) {
            formatted += ` - ${attachment.description}`;
          }
          formatted += `\n`;
        });
      }
      
      if (node.provenance) {
        // Summarize provenance instead of full JSON
        const prov = node.provenance;
        let provSummary = 'Source: ';
        if (prov.source) {
          provSummary += prov.source;
        } else if (prov.sources && Array.isArray(prov.sources) && prov.sources.length > 0) {
          const sourceTypes = [...new Set(prov.sources.map((s: any) => s.source_type || 'unknown'))];
          provSummary += sourceTypes.join(', ');
          provSummary += ` (${prov.sources.length} chunk${prov.sources.length > 1 ? 's' : ''})`;
        } else {
          provSummary += 'unknown';
        }
        if (prov.confidence !== undefined) {
          provSummary += `, confidence: ${prov.confidence}`;
        } else if (node.confidence !== null) {
          provSummary += `, confidence: ${node.confidence}`;
        }
        formatted += `     - Provenance: ${provSummary}\n`;
      } else if (node.confidence !== null) {
        formatted += `     - Confidence: ${node.confidence}\n`;
      }
      
      if (node.referenced_tree_ids && node.referenced_tree_ids.length > 0) {
        if (node.referenced_trees && node.referenced_trees.length > 0) {
          const treeNames = node.referenced_trees.map(t => t.name).join(', ');
          formatted += `     - References nested tree(s): ${treeNames}\n`;
        } else {
          formatted += `     - References ${node.referenced_tree_ids.length} nested tree(s)\n`;
        }
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

