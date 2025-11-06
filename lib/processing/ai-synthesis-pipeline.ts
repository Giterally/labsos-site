import { supabaseServer } from '../supabase-server';
import { progressTracker } from '../progress-tracker';
import { extractWorkflow } from '../ai/workflow-extractor';
import { extractWorkflowHierarchical } from '../ai/hierarchical-extractor';
import { mergeMultiDocumentWorkflows } from '../ai/multi-document-synthesis';
import { resolveAttachments } from './attachment-resolver';
import { extractDependenciesRuleBased } from './dependency-extractor';
import { detectNestedTrees } from './nested-tree-detector';
import { storeSynthesizedNode } from '../ai/synthesis';
import { cleanStructuredDocument } from './document-cleaner';
import { analyzeDocumentComplexity } from './document-analyzer';
import { calculateExtractionMetrics, logExtractionMetrics } from '../ai/extraction-metrics';
import type { StructuredDocument } from './parsers/pdf-parser';
import type { WorkflowExtractionResult, ExtractedNode } from '../ai/schemas/workflow-extraction-schema';
import { formatStructuredDocumentForLLM } from '../ai/workflow-extractor';

/**
 * Extract key topics from a structured document for matching
 * Used to match nodes to documents when attachments are missing
 */
function extractTopicsFromDocument(doc: StructuredDocument): string[] {
  const topics = new Set<string>();
  
  // Extract from filename (remove extension, split on underscores/hyphens)
  const filenameParts = doc.fileName
    .replace(/\.(pdf|xlsx?|txt|md|mp4|mp3|wav)$/i, '')
    .split(/[-_\s]+/)
    .filter(p => p.length > 3);
  filenameParts.forEach(p => topics.add(p.toLowerCase()));
  
  // Extract from section titles
  for (const section of doc.sections) {
    if (section.title) {
      // Extract key words from title (remove common words)
      const words = section.title
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3 && !['the', 'and', 'for', 'with', 'from', 'using'].includes(w));
      words.forEach(w => topics.add(w));
    }
  }
  
  // Extract from first paragraph (often contains key terms)
  if (doc.sections[0]?.content && doc.sections[0].content.length > 0) {
    const firstContent = doc.sections[0].content[0];
    if (firstContent.type === 'text' && 'text' in firstContent) {
      const firstText = (firstContent as any).text || '';
      const keywords = firstText
        .substring(0, 500)
        .toLowerCase()
        .match(/\b[a-z]{4,}\b/g) || [];
      keywords.slice(0, 10).forEach(k => topics.add(k));
    }
  }
  
  return Array.from(topics);
}

// Helper function to check if job was cancelled
async function checkCancellation(jobId: string): Promise<boolean> {
  try {
    const { data: job } = await supabaseServer
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .single();
    
    const cancelled = job?.status === 'cancelled';
    if (cancelled) {
      console.log('[FAST_IMPORT] Cancellation detected for job:', jobId);
    }
    return cancelled;
  } catch (error) {
    console.error('[FAST_IMPORT] Error checking cancellation:', error);
    return false;
  }
}

/**
 * Generate proposals using the new fast import pipeline
 * Single LLM call per document, no embeddings/clustering
 */
export async function generateProposals(projectId: string, jobId?: string) {
  const trackingJobId = jobId || `proposals_${projectId}_${Date.now()}`;
  
  // Initialize progress
  await progressTracker.updateWithPersistence(trackingJobId, {
    stage: 'initializing',
    current: 0,
    total: 100,
    message: 'Initializing fast import pipeline...',
  });
  
  console.log('[FAST_IMPORT] ===== Starting proposal generation =====');
  console.log('[FAST_IMPORT] Project ID:', projectId);
  console.log('[FAST_IMPORT] Job ID:', trackingJobId);
  
  // Check for cancellation immediately after initialization
  if (await checkCancellation(trackingJobId)) {
    console.log('[FAST_IMPORT] Job was cancelled before processing started');
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'complete',
      current: 100,
      total: 100,
      message: 'Generation cancelled by user',
    });
    return {
      success: false,
      proposalsGenerated: 0,
      nestedTreeCandidates: 0,
      cancelled: true,
    };
  }
  
  try {
    // Validate configuration before starting
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    
    if (!hasAnthropicKey && !hasOpenAIKey) {
      const errorMsg = 'No LLM API key found (ANTHROPIC_API_KEY or OPENAI_API_KEY not set)';
      console.error('[FAST_IMPORT] Configuration error:', errorMsg);
      await progressTracker.errorWithPersistence(trackingJobId, errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log(`[FAST_IMPORT] LLM Provider: ${hasAnthropicKey ? 'Anthropic' : 'OpenAI'}`);

    // Get project context
    console.log('[FAST_IMPORT] Loading project context...');
    const { data: project, error: projectError } = await supabaseServer
      .from('projects')
      .select('name, description')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[FAST_IMPORT] Failed to load project:', projectError);
      throw new Error(`Failed to load project: ${projectError.message}`);
    }

    const projectContext = project ? {
      name: project.name,
      description: project.description || undefined,
    } : undefined;

    console.log(`[FAST_IMPORT] Project: "${project?.name || 'Unknown'}"`);

    // Step 1: Load structured documents
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'loading',
      current: 10,
      total: 100,
      message: 'Loading structured documents...',
    });

    console.log('[FAST_IMPORT] Querying structured documents...');
    const { data: structuredDocs, error: docsError } = await supabaseServer
      .from('structured_documents')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (docsError) {
      console.error('[FAST_IMPORT] Database error loading documents:', docsError);
      throw new Error(`Failed to load structured documents: ${docsError.message}`);
    }

    if (!structuredDocs || structuredDocs.length === 0) {
      const errorMsg = 'No structured documents found. Please ensure files have been uploaded and preprocessed.';
      console.warn('[FAST_IMPORT]', errorMsg);
      await progressTracker.errorWithPersistence(trackingJobId, errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`[FAST_IMPORT] Found ${structuredDocs.length} structured document(s)`);
    
    // Log document details
    structuredDocs.forEach((doc, i) => {
      const structuredDoc = doc.document_json as StructuredDocument;
      console.log(`[FAST_IMPORT]   Document ${i + 1}: "${structuredDoc.fileName}" (${structuredDoc.sections?.length || 0} sections)`);
    });

    // Step 2: Extract workflow from each document (single LLM call per document)
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'extracting',
      current: 20,
      total: 100,
      message: `Extracting workflows from ${structuredDocs.length} documents...`,
    });

    const allProposedNodes: ExtractedNode[] = [];
    const extractionResults: WorkflowExtractionResult[] = [];
    const extractionAttempts: Array<{
      documentIndex: number;
      fileName: string;
      success: boolean;
      nodesExtracted: number;
      error?: string;
      duration?: number;
    }> = [];

    // Process documents in batches to avoid rate limiting
    const batchSize = 5;
    const delayMs = 1000; // 1 second between batches
    const EXTRACTION_TIMEOUT = 120000; // 2 minutes per document

    console.log(`[FAST_IMPORT] Starting extraction from ${structuredDocs.length} documents (batch size: ${batchSize})`);

    for (let batchStart = 0; batchStart < structuredDocs.length; batchStart += batchSize) {
      const batch = structuredDocs.slice(batchStart, batchStart + batchSize);
      const batchNumber = Math.floor(batchStart / batchSize) + 1;
      const totalBatches = Math.ceil(structuredDocs.length / batchSize);
      
      console.log(`[FAST_IMPORT] ===== Processing batch ${batchNumber}/${totalBatches} (${batch.length} documents) =====`);

      // Process batch in parallel
      const batchPromises = batch.map(async (doc, batchIndex) => {
        const i = batchStart + batchIndex;
        const startTime = Date.now();
        
        // Check for cancellation
        if (await checkCancellation(trackingJobId)) {
          throw new Error('Job was cancelled');
        }

        let structuredDoc = doc.document_json as StructuredDocument;
        const originalFileName = structuredDoc.fileName;
        
        // Clean the document before extraction (removes noise, fixes formatting)
        structuredDoc = cleanStructuredDocument(structuredDoc);
        
        // Check if document has meaningful content after cleaning
        const formattedDoc = formatStructuredDocumentForLLM(structuredDoc);
        const docLength = formattedDoc.length;
        
        console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Processing: "${originalFileName}"`);
        console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Sections: ${structuredDoc.sections.length} (after cleaning)`);
        console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Formatted length: ${docLength} chars`);

        if (docLength < 100) {
          const warning = `Document too short after cleaning (${docLength} chars), skipping extraction`;
          console.warn(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ${warning}`);
          extractionAttempts.push({
            documentIndex: i,
            fileName: originalFileName,
            success: false,
            nodesExtracted: 0,
            error: warning,
            duration: Date.now() - startTime,
          });
          return { success: false, error: warning, index: i };
        }

        await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'extracting',
          current: 20 + Math.floor((i / structuredDocs.length) * 60),
          total: 100,
          message: `Extracting from ${originalFileName} (${structuredDoc.sections.length} sections)...`,
        });

        try {
          // Step 1: Analyze document complexity
          const complexity = analyzeDocumentComplexity(structuredDoc);
          
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Complexity analysis:`);
          console.log(`  - Strategy: ${complexity.extractionStrategy}`);
          console.log(`  - Estimated nodes: ${complexity.estimatedNodeCount}`);
          console.log(`  - Use hierarchical: ${complexity.shouldUseHierarchical}`);
          console.log(`  - Recommended provider: ${complexity.recommendedProvider}`);

          // Step 2: Choose extraction approach
          let extractionResult: WorkflowExtractionResult;
          
          // Fast path for simple documents (backward compatible)
          if (complexity.estimatedNodeCount < 15 && !complexity.shouldUseHierarchical) {
            console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Simple document, using standard extraction`);
            
            const extractionPromise = extractWorkflow(structuredDoc, projectContext, complexity);
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Extraction timeout after ${EXTRACTION_TIMEOUT}ms`)), EXTRACTION_TIMEOUT);
            });
            
            extractionResult = await Promise.race([extractionPromise, timeoutPromise]);
          } else {
            // Complexity-aware extraction
            console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Complex document, using adaptive extraction`);
            
            if (complexity.shouldUseHierarchical) {
              console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Using hierarchical extraction (large document)`);
              
              const extractionPromise = extractWorkflowHierarchical(structuredDoc, projectContext, complexity);
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Extraction timeout after ${EXTRACTION_TIMEOUT * 3}ms`)), EXTRACTION_TIMEOUT * 3);
              });
              
              extractionResult = await Promise.race([extractionPromise, timeoutPromise]);
            } else {
              console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Using single-pass extraction with complexity-aware prompt`);
              
              const extractionPromise = extractWorkflow(structuredDoc, projectContext, complexity);
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Extraction timeout after ${EXTRACTION_TIMEOUT}ms`)), EXTRACTION_TIMEOUT);
              });
              
              extractionResult = await Promise.race([extractionPromise, timeoutPromise]);
            }
          }
          
          const duration = Date.now() - startTime;
          const totalNodes = extractionResult.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
          
          // Calculate and log extraction metrics
          const metrics = calculateExtractionMetrics(complexity, extractionResult);
          logExtractionMetrics(metrics, originalFileName);
          
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ✓ Extraction successful: ${extractionResult.blocks.length} blocks, ${totalNodes} nodes in ${duration}ms`);

          if (totalNodes > 0) {
            // Log sample node
            const firstBlock = extractionResult.blocks[0];
            if (firstBlock && firstBlock.nodes.length > 0) {
              const sampleNode = firstBlock.nodes[0];
              console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Sample node: "${sampleNode.title}" (type: ${sampleNode.type})`);
            }
          } else {
            console.warn(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ⚠ Extraction returned 0 nodes`);
          }

          extractionAttempts.push({
            documentIndex: i,
            fileName: originalFileName,
            success: true,
            nodesExtracted: totalNodes,
            duration,
          });

          return { success: true, result: extractionResult, index: i, complexity, metrics };
        } catch (error: any) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          console.error(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ✗ Extraction failed:`, errorMessage);
          
          // Log more details for debugging
          if (error instanceof Error && error.stack) {
            const stackPreview = error.stack.split('\n').slice(0, 3).join('\n');
            console.error(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Stack trace:`, stackPreview);
          }

          // Log specific error types
          if (error.name === 'ZodError') {
            console.error(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Schema validation failed:`, error.errors?.slice(0, 3));
          }

          extractionAttempts.push({
            documentIndex: i,
            fileName: originalFileName,
            success: false,
            nodesExtracted: 0,
            error: errorMessage,
            duration,
          });

          return { success: false, error: errorMessage, index: i };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // Process successful results
      for (const batchResult of batchResults) {
        if (batchResult.success && batchResult.result) {
          const extractionResult = batchResult.result;
          const complexity = (batchResult as any).complexity;
          const metrics = (batchResult as any).metrics;
          extractionResults.push(extractionResult);

          const totalNodes = extractionResult.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
          console.log(`[FAST_IMPORT] Batch result: Extracted ${extractionResult.blocks.length} blocks, ${totalNodes} nodes`);

          // Get document info for this batch result
          const attempt = extractionAttempts.find(a => a.documentIndex === batchResult.index);
          const documentFileName = attempt?.fileName || 'unknown';

          // Flatten nodes from all blocks
          for (const block of extractionResult.blocks) {
            for (const node of block.nodes) {
              // Add block context and extraction metrics to node
              node.metadata = {
                ...node.metadata,
                blockName: block.blockName,
                blockType: block.blockType,
                extractionMetrics: metrics, // Store metrics from document-level calculation
                documentSource: documentFileName,
                complexity: complexity?.extractionStrategy
              };
              allProposedNodes.push(node);
            }
          }
        } else {
          const attempt = extractionAttempts.find(a => a.documentIndex === batchResult.index);
          console.error(`[FAST_IMPORT] Batch extraction failed for document ${batchResult.index + 1}: ${attempt?.error || 'Unknown error'}`);
        }
      }

      // Delay between batches (except for last batch)
      if (batchStart + batchSize < structuredDocs.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    // Log comprehensive extraction summary
    console.log(`[FAST_IMPORT] ===== EXTRACTION SUMMARY =====`);
    console.log(`[FAST_IMPORT] Total documents processed: ${extractionAttempts.length}`);
    const successfulExtractions = extractionAttempts.filter(a => a.success);
    const failedExtractions = extractionAttempts.filter(a => !a.success);
    console.log(`[FAST_IMPORT] Successful: ${successfulExtractions.length}/${extractionAttempts.length}`);
    console.log(`[FAST_IMPORT] Failed: ${failedExtractions.length}/${extractionAttempts.length}`);
    console.log(`[FAST_IMPORT] Total nodes extracted: ${allProposedNodes.length}`);
    
    if (successfulExtractions.length > 0) {
      console.log(`[FAST_IMPORT] Successful extractions:`);
      successfulExtractions.forEach(s => {
        console.log(`[FAST_IMPORT]   ✓ "${s.fileName}": ${s.nodesExtracted} nodes in ${s.duration}ms`);
      });
    }
    
    if (failedExtractions.length > 0) {
      console.log(`[FAST_IMPORT] Failed extractions:`);
      failedExtractions.forEach(f => {
        console.log(`[FAST_IMPORT]   ✗ "${f.fileName}": ${f.error} (${f.duration}ms)`);
      });
    }

    if (allProposedNodes.length === 0) {
      const errorDetails = failedExtractions.length > 0
        ? ` All ${failedExtractions.length} extraction(s) failed. ` +
          `Sample errors: ${failedExtractions.slice(0, 3).map(f => `"${f.fileName}": ${f.error}`).join('; ')}`
        : ' All extractions returned empty results.';
      throw new Error(`No nodes extracted from any documents.${errorDetails}`);
    }

    console.log(`[FAST_IMPORT] Extracted ${allProposedNodes.length} nodes total`);

    // Step 2.5: Merge multi-document workflows if we have multiple documents
    if (extractionResults.length > 1) {
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'merging',
        current: 55,
        total: 100,
        message: `Merging ${extractionResults.length} document workflows...`,
      });

      console.log(`[FAST_IMPORT] Merging ${extractionResults.length} document workflows into single coherent workflow`);
      
      try {
        const mergedWorkflow = await mergeMultiDocumentWorkflows(extractionResults, projectContext);
        
        // Replace extraction results with merged workflow
        extractionResults.length = 0;
        extractionResults.push(mergedWorkflow);
        
        // Rebuild allProposedNodes from merged workflow
        allProposedNodes.length = 0;
        for (const block of mergedWorkflow.blocks) {
          for (const node of block.nodes) {
            node.metadata = {
              ...node.metadata,
              blockName: block.blockName,
              blockType: block.blockType,
            };
            allProposedNodes.push(node);
          }
        }
        
        console.log(`[FAST_IMPORT] Merged workflow: ${mergedWorkflow.blocks.length} blocks, ${allProposedNodes.length} nodes`);
        
        // Store merge metadata in extraction results for later use in tree building
        (extractionResults[0] as any).mergeMetadata = {
          sourceDocumentCount: extractionResults.length,
          mergedAt: new Date().toISOString(),
          mergeStrategy: 'llm',
        };
      } catch (error: any) {
        console.error(`[FAST_IMPORT] Failed to merge workflows, using fallback concatenation:`, error);
        // Fallback merge already handled in mergeMultiDocumentWorkflows
        const fallbackResult = extractionResults.length > 0 ? extractionResults[0] : null;
        if (fallbackResult) {
          (fallbackResult as any).mergeMetadata = {
            sourceDocumentCount: extractionResults.length,
            mergedAt: new Date().toISOString(),
            mergeStrategy: 'fallback',
          };
        }
      }
    }

    // Step 3: Resolve attachments
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'resolving',
      current: 60,
      total: 100,
      message: 'Resolving attachments...',
    });

    for (const doc of structuredDocs) {
      const structuredDoc = doc.document_json as StructuredDocument;
      
      // Process ALL nodes for this document, not just those with existing attachments
      const nodesForDoc = allProposedNodes.filter(n => {
        // Check if node has attachments pointing to this document
        const hasAttachmentsForDoc = n.attachments.some(a => a.sourceId === structuredDoc.sourceId);
        
        // Also process nodes that have no attachments yet (they might need figure/table detection)
        const hasNoAttachments = n.attachments.length === 0;
        
        // Check if node content mentions topics from this document (extract from section titles)
        const docTopics = extractTopicsFromDocument(structuredDoc);
        const contentMentionsDoc = hasNoAttachments && docTopics.some(topic => 
          n.content.text.toLowerCase().includes(topic.toLowerCase())
        );
        
        return hasAttachmentsForDoc || contentMentionsDoc;
      });
      
      if (nodesForDoc.length > 0) {
        await resolveAttachments(nodesForDoc, structuredDoc);
      }
    }

    console.log(`[FAST_IMPORT] Resolved attachments for all nodes`);

    // Step 4: Extract dependencies (rule-based)
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'dependencies',
      current: 70,
      total: 100,
      message: 'Extracting dependencies...',
    });

    extractDependenciesRuleBased(allProposedNodes);
    console.log(`[FAST_IMPORT] Extracted dependencies`);

    // Step 5: Detect nested trees
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'nesting',
      current: 80,
      total: 100,
      message: 'Detecting nested trees...',
    });

    const nestedTreeCandidates = detectNestedTrees(allProposedNodes);
    console.log(`[FAST_IMPORT] Found ${nestedTreeCandidates.length} nested tree candidates`);

    // Step 6: Store proposals
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'storing',
      current: 85,
      total: 100,
      message: `Storing ${allProposedNodes.length} proposals...`,
    });

    const storedNodeIds: string[] = [];
    
    for (let i = 0; i < allProposedNodes.length; i++) {
      const node = allProposedNodes[i];
      
      // Check for cancellation
      if (await checkCancellation(trackingJobId)) {
        throw new Error('Job was cancelled');
      }

      try {
        // Convert ExtractedNode to SynthesizedNode format for storage
        const synthesizedNode = {
          title: node.title,
          short_summary: node.content.text.substring(0, 100),
          content: {
            text: node.content.text,
            structured_steps: node.content.preservedFormatting?.isNumberedList && node.content.preservedFormatting.listItems
              ? node.content.preservedFormatting.listItems.map((item, idx) => ({
                  step_no: idx + 1,
                  action: item,
                  params: {},
                }))
              : [],
          },
          metadata: {
            node_type: node.nodeType,
            tags: node.metadata?.tags || [],
            status: node.status,
            parameters: node.parameters || {},
            estimated_time_minutes: node.metadata?.estimatedTimeMinutes,
            blockName: node.metadata?.blockName,
            blockType: node.metadata?.blockType,
            isNestedTree: node.isNestedTree,
            extractionMetrics: node.metadata?.extractionMetrics, // Store extraction quality metrics
            complexity: node.metadata?.complexity,
            documentSource: node.metadata?.documentSource,
          },
          dependencies: node.dependencies.map(dep => ({
            referenced_title: dep.referencedNodeTitle,
            dependency_type: dep.dependencyType,
            extractedPhrase: dep.extractedPhrase || '',
            evidence: dep.extractedPhrase || '',
            confidence: 0.8, // Default confidence for rule-based
          })),
          attachments: node.attachments.map(att => ({
            id: att.sourceId,
            name: att.fileName,
            range: att.pageRange ? `${att.pageRange[0]}-${att.pageRange[1]}` : undefined,
          })),
          provenance: {
            sources: node.attachments.map(att => ({
              chunk_id: att.sourceId,
              source_type: structuredDocs.find(d => (d.document_json as StructuredDocument).sourceId === att.sourceId)?.document_json?.type || 'unknown',
              snippet: node.content.text.substring(0, 200),
            })),
            generated_by: 'fast-import-v1',
            confidence: 0.85,
            mergeMetadata: extractionResults.length > 1 ? (extractionResults[0] as any).mergeMetadata || null : null,
          },
        };

        const nodeId = await storeSynthesizedNode(projectId, synthesizedNode, 'proposed');
        storedNodeIds.push(nodeId);

        // Update progress
        if ((i + 1) % 10 === 0 || i === allProposedNodes.length - 1) {
          await progressTracker.updateWithPersistence(trackingJobId, {
            stage: 'storing',
            current: 85 + Math.floor(((i + 1) / allProposedNodes.length) * 10),
            total: 100,
            message: `Stored ${i + 1}/${allProposedNodes.length} proposals...`,
          });
        }
      } catch (error: any) {
        console.error(`[FAST_IMPORT] Failed to store node ${node.nodeId}:`, error);
        // Continue with other nodes
      }
    }

    console.log(`[FAST_IMPORT] Stored ${storedNodeIds.length} proposals`);

    // Step 7: Complete
    await progressTracker.updateWithPersistence(trackingJobId, {
      stage: 'complete',
      current: 100,
      total: 100,
      message: `Completed: ${storedNodeIds.length} proposals generated`,
    });

    console.log(`[FAST_IMPORT] ✓ Proposal generation completed: ${storedNodeIds.length} proposals`);

    return {
      success: true,
      proposalsGenerated: storedNodeIds.length,
      nestedTreeCandidates: nestedTreeCandidates.length,
    };

  } catch (error: any) {
    console.error('[FAST_IMPORT] Error generating proposals:', error);
    
    // Check if error was due to cancellation
    if (error.message?.includes('cancelled') || await checkCancellation(trackingJobId)) {
      console.log('[FAST_IMPORT] Error was due to cancellation');
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'complete',
        current: 100,
        total: 100,
        message: 'Generation cancelled by user',
      });
      return {
        success: false,
        proposalsGenerated: 0,
        nestedTreeCandidates: 0,
        cancelled: true,
      };
    }
    
    await progressTracker.errorWithPersistence(trackingJobId, `Failed to generate proposals: ${error.message}`);
    throw error;
  }
}
