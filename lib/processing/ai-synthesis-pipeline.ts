import { supabaseServer } from '../supabase-server';
import { clusterChunks, storeClusteringResults } from '../ai/clustering';
import { synthesizeNode, storeSynthesizedNode, calculateConfidence } from '../ai/synthesis';
import { detectDuplicates, mergeNodes } from '../ai/deduplication';

export async function generateProposals(projectId: string) {
  try {
    console.log(`[AI SYNTHESIS] Starting proposal generation for project: ${projectId}`);

    // Clear ALL existing proposals to prevent duplicates and invalid node types
    console.log(`[AI SYNTHESIS] Clearing ALL existing proposals for project: ${projectId}`);
    const { error: deleteError } = await supabaseServer
      .from('proposed_nodes')
      .delete()
      .eq('project_id', projectId);

    if (deleteError) {
      console.warn(`[AI SYNTHESIS] Warning: Failed to clear existing proposals: ${deleteError.message}`);
    } else {
      console.log(`[AI SYNTHESIS] Successfully cleared existing proposals`);
    }

    // Get all preprocessed chunks for the project
    const { data: chunks, error: chunksError } = await supabaseServer
      .from('chunks')
      .select('id, text, source_type, source_ref, metadata, embedding')
      .eq('project_id', projectId);

    if (chunksError || !chunks || chunks.length === 0) {
      throw new Error(`No preprocessed chunks found for project: ${chunksError?.message}`);
    }

    console.log(`[AI SYNTHESIS] Found ${chunks.length} preprocessed chunks`);

    // Step 1: Cluster chunks
    console.log(`[AI SYNTHESIS] Clustering chunks`);
    const clusters = await clusterChunks(projectId, {
      minClusterSize: 1, // Allow single-chunk nodes for hash-based embeddings
      maxClusterSize: 10,
      similarityThreshold: 0.3, // Lowered for hash-based embeddings
      maxClusters: 20,
    });

    await storeClusteringResults(projectId, clusters);
    console.log(`[AI SYNTHESIS] Generated ${clusters.length} clusters`);

    // Step 2: Synthesize nodes from clusters
    console.log(`[AI SYNTHESIS] Synthesizing nodes`);
    const proposedNodes = [];

    // Handle single chunks that didn't get clustered
    if (chunks.length === 1 && clusters.length === 0) {
      console.log(`[AI SYNTHESIS] Single chunk detected, creating individual node`);
      
      // Get project context
      const { data: project } = await supabaseServer
        .from('projects')
        .select('name, description')
        .eq('id', projectId)
        .single();

      // Create a mock cluster for the single chunk
      const singleChunk = chunks[0];
      const mockCluster = {
        id: `single_${singleChunk.id}`,
        chunks: [{
          id: singleChunk.id,
          text: singleChunk.text,
          sourceType: singleChunk.source_type,
          sourceRef: singleChunk.source_ref,
          metadata: singleChunk.metadata,
        }],
        centroid: singleChunk.embedding,
        size: 1,
        coherence: 1.0,
      };

      // Synthesize node from single chunk
      const synthesizedNode = await synthesizeNode({
        chunks: mockCluster.chunks,
        projectContext: project ? {
          name: project.name,
          description: project.description,
        } : undefined,
      });
      
      // Calculate confidence
      const confidence = calculateConfidence(synthesizedNode);

      // Store synthesized node
      const nodeId = await storeSynthesizedNode(
        projectId,
        synthesizedNode,
        'proposed'
      );
      proposedNodes.push({ nodeId, confidence });

      console.log(`[AI SYNTHESIS] Synthesized single-chunk node ${nodeId} with confidence ${confidence}`);
    }

    // Process regular clusters
    for (const cluster of clusters) {
      // Get chunks for this cluster
      const { data: clusterChunks, error: chunksError } = await supabaseServer
        .from('chunks')
        .select('id, text, source_type, source_ref, metadata')
        .eq('project_id', projectId)
        .in('id', cluster.chunkIds);

      if (chunksError || !clusterChunks) {
        console.error(`Failed to fetch chunks for cluster ${cluster.clusterId}:`, chunksError);
        continue;
      }

      // Get project context
      const { data: project } = await supabaseServer
        .from('projects')
        .select('name, description')
        .eq('id', projectId)
        .single();

      // Create cluster object for synthesis
      const clusterObj = {
        id: cluster.clusterId,
        chunks: clusterChunks.map(chunk => ({
          id: chunk.id,
          text: chunk.text,
          sourceType: chunk.source_type,
          sourceRef: chunk.source_ref,
          metadata: chunk.metadata,
        })),
        centroid: cluster.centroid,
        size: cluster.size,
        coherence: cluster.coherence,
      };

      // Synthesize node from chunks
      const synthesizedNode = await synthesizeNode({
        chunks: clusterObj.chunks,
        projectContext: project ? {
          name: project.name,
          description: project.description,
        } : undefined,
      });

      // Calculate confidence
      const confidence = calculateConfidence(synthesizedNode);

      // Store synthesized node
      const nodeId = await storeSynthesizedNode(
        projectId,
        synthesizedNode,
        'proposed'
      );
      proposedNodes.push({ nodeId, confidence });

      console.log(`[AI SYNTHESIS] Synthesized node ${nodeId} with confidence ${confidence}`);
    }

    // Step 3: Handle unclustered chunks (fallback for hash-based embeddings)
    const clusteredChunkIds = new Set();
    clusters.forEach(cluster => {
      cluster.chunkIds.forEach(id => clusteredChunkIds.add(id));
    });

    const unclusteredChunks = chunks.filter(chunk => !clusteredChunkIds.has(chunk.id));
    
    if (unclusteredChunks.length > 0) {
      console.log(`[AI SYNTHESIS] Processing ${unclusteredChunks.length} unclustered chunks in parallel batches`);
      
      // Get project context once
      const { data: project } = await supabaseServer
        .from('projects')
        .select('name, description')
        .eq('id', projectId)
        .single();

      // Process chunks in parallel batches
      const batchSize = 8; // Process 8 chunks in parallel
      const batches = [];
      
      for (let i = 0; i < unclusteredChunks.length; i += batchSize) {
        const batch = unclusteredChunks.slice(i, i + batchSize);
        batches.push(batch);
      }

      console.log(`[AI SYNTHESIS] Processing ${batches.length} batches of unclustered chunks`);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[AI SYNTHESIS] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} chunks)`);

        // Process batch in parallel
        const batchPromises = batch.map(async (chunk) => {
          try {
            // Create a mock cluster for the unclustered chunk
            const mockCluster = {
              id: `unclustered_${chunk.id}`,
              chunks: [{
                id: chunk.id,
                text: chunk.text,
                sourceType: chunk.source_type,
                sourceRef: chunk.source_ref,
                metadata: chunk.metadata,
              }],
              centroid: chunk.embedding,
              size: 1,
              avgSimilarity: 1.0,
              coherence: 1.0,
            };

            // Synthesize node from unclustered chunk
            const synthesizedNode = await synthesizeNode({
              chunks: mockCluster.chunks,
              projectContext: project ? {
                name: project.name,
                description: project.description,
              } : undefined,
            });

            // Calculate confidence
            const confidence = calculateConfidence(synthesizedNode);

            // Store synthesized node
            const nodeId = await storeSynthesizedNode(
              projectId,
              synthesizedNode,
              'proposed'
            );

            console.log(`[AI SYNTHESIS] Synthesized unclustered chunk node ${nodeId} with confidence ${confidence}`);
            
            return { nodeId, confidence };
          } catch (error) {
            console.error(`[AI SYNTHESIS] Failed to process unclustered chunk ${chunk.id}:`, error);
            return null; // Return null for failed chunks
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Add successful results to proposedNodes
        batchResults.forEach(result => {
          if (result) {
            proposedNodes.push(result);
          }
        });

        console.log(`[AI SYNTHESIS] Completed batch ${batchIndex + 1}/${batches.length}`);
      }
    }

    console.log(`[AI SYNTHESIS] Proposal generation completed for project ${projectId}`);
    console.log(`[AI SYNTHESIS] Generated ${proposedNodes.length} proposed nodes`);

    // Step 4: Deduplication pass
    console.log(`[AI SYNTHESIS] Running deduplication pass...`);
    
    if (proposedNodes.length > 1) {
      try {
        // Fetch all proposed nodes with their full data
        const { data: fullProposedNodes, error: fetchError } = await supabaseServer
          .from('proposed_nodes')
          .select('*')
          .eq('project_id', projectId)
          .eq('status', 'proposed');

        if (fetchError || !fullProposedNodes) {
          console.warn('[AI SYNTHESIS] Failed to fetch nodes for deduplication:', fetchError);
        } else {
          // Detect duplicates
          const duplicates = await detectDuplicates(fullProposedNodes);

          if (duplicates.length > 0) {
            console.log(`[AI SYNTHESIS] Found ${duplicates.length} duplicate pairs, merging...`);
            
            // Track which nodes to delete
            const nodesToDelete = new Set<string>();
            const nodesToUpdate: any[] = [];

            // Process each duplicate pair
            for (const dup of duplicates) {
              // Skip if already marked for deletion
              if (nodesToDelete.has(dup.node1Id) || nodesToDelete.has(dup.node2Id)) {
                continue;
              }

              // Find the actual node objects
              const node1 = fullProposedNodes.find(n => n.id === dup.node1Id);
              const node2 = fullProposedNodes.find(n => n.id === dup.node2Id);

              if (!node1 || !node2) continue;

              // Merge the nodes
              const mergedNode = mergeNodes(node1, node2);
              
              // Mark lower confidence node for deletion
              const toDelete = node1.confidence >= node2.confidence ? node2.id : node1.id;
              const toUpdate = node1.confidence >= node2.confidence ? node1.id : node2.id;
              
              nodesToDelete.add(toDelete);
              nodesToUpdate.push({
                id: toUpdate,
                node_json: mergedNode.node_json,
                confidence: mergedNode.confidence,
              });

              console.log(`[AI SYNTHESIS] Merged duplicate: "${node1.node_json.title}" + "${node2.node_json.title}" (${dup.similarity.toFixed(1)}% similar)`);
            }

            // Delete duplicate nodes
            if (nodesToDelete.size > 0) {
              const { error: deleteError } = await supabaseServer
                .from('proposed_nodes')
                .delete()
                .in('id', Array.from(nodesToDelete));

              if (deleteError) {
                console.error('[AI SYNTHESIS] Failed to delete duplicate nodes:', deleteError);
              } else {
                console.log(`[AI SYNTHESIS] Deleted ${nodesToDelete.size} duplicate nodes`);
              }
            }

            // Update merged nodes
            for (const update of nodesToUpdate) {
              const { error: updateError } = await supabaseServer
                .from('proposed_nodes')
                .update({
                  node_json: update.node_json,
                  confidence: update.confidence,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', update.id);

              if (updateError) {
                console.error(`[AI SYNTHESIS] Failed to update merged node ${update.id}:`, updateError);
              }
            }

            console.log(`[AI SYNTHESIS] Deduplication complete: ${nodesToDelete.size} duplicates removed, ${nodesToUpdate.length} nodes merged`);
          } else {
            console.log(`[AI SYNTHESIS] No duplicates found`);
          }
        }
      } catch (dedupError) {
        console.error('[AI SYNTHESIS] Deduplication failed, continuing without it:', dedupError);
      }
    } else {
      console.log(`[AI SYNTHESIS] Skipping deduplication (only ${proposedNodes.length} node)`);
    }

    // Final count after deduplication
    const { data: finalNodes } = await supabaseServer
      .from('proposed_nodes')
      .select('id')
      .eq('project_id', projectId)
      .eq('status', 'proposed');

    const finalCount = finalNodes?.length || proposedNodes.length;
    console.log(`[AI SYNTHESIS] Final node count after deduplication: ${finalCount}`);

    return {
      success: true,
      clustersGenerated: clusters.length,
      nodesGenerated: finalCount,
      proposedNodes: proposedNodes,
      duplicatesRemoved: proposedNodes.length - finalCount,
    };

  } catch (error: any) {
    console.error(`[AI SYNTHESIS] Error generating proposals for project ${projectId}:`, error);
    throw error;
  }
}
