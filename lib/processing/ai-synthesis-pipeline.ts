import { supabaseServer } from '../supabase-server';
import { clusterChunks, storeClusteringResults } from '../ai/clustering';
import { synthesizeNode, storeSynthesizedNode, calculateConfidence } from '../ai/synthesis';
import { detectDuplicates, mergeNodes } from '../ai/deduplication';
import { progressTracker } from '../progress-tracker';
import { generateWorkflowOutline, type WorkflowOutline, summarizeOutline, getDependencySections } from '../ai/planning-agent';
import { retrieveContextForSynthesis, checkDuplication } from '../ai/rag-retriever';

export async function generateProposals(projectId: string, jobId?: string) {
  // Generate jobId if not provided
  const trackingJobId = jobId || `proposals_${projectId}_${Date.now()}`;
  
  // Initialize progress
  await progressTracker.updateWithPersistence(trackingJobId, {
    stage: 'initializing',
    current: 0,
    total: 100,
    message: 'Initializing proposal generation...',
  });
  try {
    console.log(`[AI SYNTHESIS] Starting proposal generation for project: ${projectId}`);

    // NOTE: Do NOT clear existing proposals upfront.
    // We will generate new proposals first and only delete older ones after success.

    // Get all preprocessed chunks for the project
    let chunks;
    try {
      const { data: chunksData, error: chunksError } = await supabaseServer
        .from('chunks')
        .select('id, text, source_type, source_ref, metadata, embedding')
        .eq('project_id', projectId);

      if (chunksError) {
        throw new Error(`Database error fetching chunks: ${chunksError.message}`);
      }

      if (!chunksData || chunksData.length === 0) {
        throw new Error('No preprocessed chunks found for project. Please ensure files have been uploaded and processed successfully.');
      }

      // Validate embeddings exist
      const chunksWithoutEmbeddings = chunksData.filter(c => !c.embedding);
      if (chunksWithoutEmbeddings.length > 0) {
        console.warn(`[AI SYNTHESIS] Warning: ${chunksWithoutEmbeddings.length}/${chunksData.length} chunks missing embeddings`);
      }

      chunks = chunksData;
      console.log(`[AI SYNTHESIS] Found ${chunks.length} preprocessed chunks (${chunks.length - chunksWithoutEmbeddings.length} with embeddings)`);
    } catch (error: any) {
      await progressTracker.errorWithPersistence(trackingJobId, `Failed to fetch chunks: ${error.message}`);
      throw error;
    }

    // Step 0: Generate workflow outline using Planning Agent
    let workflowOutline: WorkflowOutline | null = null;
    try {
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'initializing',
        current: 5,
        total: 100,
        message: 'Analyzing document structure with Planning Agent...',
      });
      
      console.log(`[AI SYNTHESIS] Generating workflow outline with Planning Agent...`);
      workflowOutline = await generateWorkflowOutline(projectId);
      
      console.log(`[AI SYNTHESIS] Planning Agent generated outline:`);
      console.log(summarizeOutline(workflowOutline));
      
      // Store outline in project metadata for user review
      await supabaseServer
        .from('projects')
        .update({
          metadata: {
            workflowOutline,
            outlineGeneratedAt: new Date().toISOString(),
          }
        })
        .eq('id', projectId);
      
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'initializing',
        current: 10,
        total: 100,
        message: `Outline complete: ${workflowOutline.phases.length} phases, ~${workflowOutline.estimatedNodes} nodes`,
      });
    } catch (planningError: any) {
      console.error('[AI SYNTHESIS] Planning Agent failed, continuing without outline:', planningError);
      // Continue without outline - clustering will still work
      workflowOutline = null;
    }

    // Step 1: Cluster chunks
    let clusters;
    try {
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'clustering',
        current: 15,
        total: 100,
        message: `Clustering ${chunks.length} chunks...`,
      });
      
      console.log(`[AI SYNTHESIS] Clustering chunks`);
      clusters = await clusterChunks(projectId, {
        minClusterSize: 1, // Allow single-chunk nodes for hash-based embeddings
        maxClusterSize: 10,
        similarityThreshold: 0.3, // Lowered for hash-based embeddings
        maxClusters: 20,
      });

      await storeClusteringResults(projectId, clusters);
      console.log(`[AI SYNTHESIS] Generated ${clusters.length} clusters`);
    } catch (error: any) {
      const errorMsg = `Clustering failed: ${error.message}`;
      console.error(`[AI SYNTHESIS] ${errorMsg}`, error);
      await progressTracker.errorWithPersistence(trackingJobId, errorMsg);
      throw new Error(errorMsg);
    }

    // Step 2: Synthesize nodes from clusters (and unclustered later)
    // Pre-compute unclustered chunks to set an accurate total upfront
    const clusteredChunkIds = new Set();
    clusters.forEach(cluster => {
      cluster.chunkIds.forEach(id => clusteredChunkIds.add(id));
    });
    const unclusteredChunksPre = chunks.filter(chunk => !clusteredChunkIds.has(chunk.id));

    const totalItemsToSynthesize =
      clusters.length +
      (chunks.length === 1 && clusters.length === 0 ? 1 : 0) +
      unclusteredChunksPre.length;

    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'synthesizing',
      current: 20,
      total: 100,
      message: `Synthesizing nodes from ${clusters.length} clusters (0/${totalItemsToSynthesize})...`,
    });
    
    console.log(`[AI SYNTHESIS] Synthesizing nodes`);
    const proposedNodes = [];
    let synthesizedCount = 0;

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
      synthesizedCount++;

      const progressPercent = Math.round(20 + (synthesizedCount / totalItemsToSynthesize) * 60);
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'synthesizing',
        current: progressPercent,
        total: 100,
        message: `Synthesizing nodes: ${synthesizedCount}/${totalItemsToSynthesize} complete...`,
      });

      console.log(`[AI SYNTHESIS] Synthesized single-chunk node ${nodeId} with confidence ${confidence}`);
    }

    // Process regular clusters
    for (const cluster of clusters) {
      try {
        // Get chunks for this cluster
        const { data: clusterChunks, error: chunksError } = await supabaseServer
          .from('chunks')
          .select('id, text, source_type, source_ref, metadata')
          .eq('project_id', projectId)
          .in('id', cluster.chunkIds);

        if (chunksError || !clusterChunks) {
          console.error(`[AI SYNTHESIS] Failed to fetch chunks for cluster ${cluster.clusterId}:`, chunksError);
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
          coherence: 1.0, // Default coherence for cluster objects
        };

        // Use RAG to retrieve additional context
        let ragContext = null;
        if (workflowOutline) {
          try {
            // Try to find matching section in outline
            const clusterText = clusterObj.chunks.map(c => c.text).join(' ').substring(0, 500);
            const matchingSection = workflowOutline.phases
              .flatMap(p => p.sections)
              .find(s => clusterText.toLowerCase().includes(s.title.toLowerCase().substring(0, 20)));
            
            if (matchingSection) {
              console.log(`[AI SYNTHESIS] Retrieving RAG context for section: "${matchingSection.title}"`);
              ragContext = await retrieveContextForSynthesis(
                projectId,
                clusterObj.chunks.map(c => c.id),
                matchingSection,
                { maxRelatedChunks: 8, maxDependencyChunks: 4 }
              );
              
              // Check for duplication
              const dupCheck = checkDuplication(matchingSection.title, ragContext.existingNodes);
              if (dupCheck.isDuplicate) {
                console.log(`[AI SYNTHESIS] Skipping duplicate node: "${matchingSection.title}" (${(dupCheck.similarity * 100).toFixed(0)}% similar to "${dupCheck.duplicateOf?.title}")`);
                continue; // Skip this cluster, it's a duplicate
              }
            }
          } catch (ragError: any) {
            console.warn(`[AI SYNTHESIS] RAG retrieval failed, continuing without context:`, ragError.message);
          }
        }

        // Synthesize node from chunks with RAG context
        const synthesizedNode = await synthesizeNode({
          chunks: clusterObj.chunks,
          projectContext: project ? {
            name: project.name,
            description: project.description,
          } : undefined,
          retrievedContext: ragContext,
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
        synthesizedCount++;

        const progressPercent = Math.round(20 + (synthesizedCount / totalItemsToSynthesize) * 60);
        await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'synthesizing',
          current: progressPercent,
          total: 100,
          message: `Synthesized ${synthesizedCount}/${totalItemsToSynthesize} nodes...`,
        });

        console.log(`[AI SYNTHESIS] Synthesized node ${nodeId} with confidence ${confidence}`);
      } catch (clusterError: any) {
        console.error(`[AI SYNTHESIS] Failed to synthesize cluster ${cluster.clusterId}:`, clusterError);
        // Continue with other clusters even if one fails
        const progressPercent = Math.round(20 + (synthesizedCount / totalItemsToSynthesize) * 60);
        await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'synthesizing',
          current: progressPercent,
          total: 100,
          message: `Warning: Failed to synthesize 1 cluster. Continuing... (${synthesizedCount}/${totalItemsToSynthesize})`,
        });
      }
    }

    // Step 3: Handle unclustered chunks (fallback for hash-based embeddings)
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
            
            // Update overall synthesized count and progress
            synthesizedCount++;
            const progressPercent = Math.round(20 + (synthesizedCount / totalItemsToSynthesize) * 60);
            await progressTracker.updateWithPersistence(trackingJobId, {
              stage: 'synthesizing',
              current: progressPercent,
              total: 100,
              message: `Synthesized ${synthesizedCount}/${totalItemsToSynthesize} nodes...`,
            });

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
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'deduplicating',
      current: 85,
      total: 100,
      message: `Detecting and merging duplicate nodes...`,
    });
    
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

    // Finalize: keep only the proposals created in this run (safe regeneration)
    const createdIds = proposedNodes.map(p => p.nodeId);

    // Delete older proposals that are not part of this generation
    if (createdIds.length > 0) {
      // Fetch existing proposed IDs
      const { data: existingProposed } = await supabaseServer
        .from('proposed_nodes')
        .select('id')
        .eq('project_id', projectId)
        .eq('status', 'proposed');

      const idsToDelete = (existingProposed || [])
        .map((r: any) => r.id)
        .filter((id: string) => !createdIds.includes(id));

      if (idsToDelete.length > 0) {
        const { error: cleanupError } = await supabaseServer
          .from('proposed_nodes')
          .delete()
          .in('id', idsToDelete);
        if (cleanupError) {
          console.warn('[AI SYNTHESIS] Cleanup of old proposals failed:', cleanupError);
        } else {
          console.log(`[AI SYNTHESIS] Removed ${idsToDelete.length} old proposals`);
        }
      }
    }

    const finalCount = createdIds.length;
    console.log(`[AI SYNTHESIS] Final node count: ${finalCount}`);

    // Mark as complete
    await progressTracker.completeWithPersistence(trackingJobId, `Generated ${finalCount} nodes successfully`);

    return {
      success: true,
      clustersGenerated: clusters.length,
      nodesGenerated: finalCount,
      proposedNodes: proposedNodes,
      duplicatesRemoved: proposedNodes.length - finalCount,
      jobId: trackingJobId,
    };

  } catch (error: any) {
    console.error(`[AI SYNTHESIS] Error generating proposals for project ${projectId}:`, error);
    
    // Mark as error
    await progressTracker.errorWithPersistence(trackingJobId, error.message || 'Failed to generate proposals');
    
    throw error;
  }
}
