import { SupabaseClient } from '@supabase/supabase-js';
import { updateNodeEmbeddingWithQueue, type NodeContentData } from './embeddings';

/**
 * Helper function to fetch full node data and generate embedding
 * This is called asynchronously after node operations to avoid blocking the response
 */
export async function fetchNodeAndGenerateEmbedding(
  nodeId: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    // Fetch complete node data with all related content
    const { data: node, error: nodeError } = await supabase
      .from('tree_nodes')
      .select(`
        id,
        name,
        description,
        node_content(content),
        node_attachments(name, description),
        node_links(name, url, description)
      `)
      .eq('id', nodeId)
      .single();

    if (nodeError || !node) {
      console.error(`Error fetching node ${nodeId} for embedding:`, nodeError);
      return;
    }

    // Format data for embedding
    const nodeData: NodeContentData = {
      id: node.id,
      name: node.name || '',
      description: node.description || undefined,
      content: node.node_content?.[0]?.content || undefined,
      attachments: node.node_attachments?.map((a: any) => ({
        name: a.name,
        description: a.description || undefined,
      })) || [],
      links: node.node_links?.map((l: any) => ({
        name: l.name,
        url: l.url,
        description: l.description || undefined,
      })) || [],
    };

    // Update embedding (non-blocking, will queue on failure)
    const result = await updateNodeEmbeddingWithQueue(supabase, nodeId, nodeData);
    
    if (result.queued) {
      console.log(`Embedding for node ${nodeId} queued for retry`);
    }
  } catch (error) {
    console.error(`Error in fetchNodeAndGenerateEmbedding for node ${nodeId}:`, error);
    // Don't throw - we don't want to block the main operation
  }
}




