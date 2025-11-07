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
 * Enriches node content with attachment references, adding document source information
 * Format: "Figure 3 (from UCL_dis.pdf)" or "[See Figure 3 (from UCL_dis.pdf)]"
 */
function enrichContentWithAttachmentReferences(
  nodes: ExtractedNode[],
  structuredDocs: Array<{ document_json: StructuredDocument }>
): void {
  console.log(`[CONTENT_ENRICHMENT] Starting content enrichment with attachment references`);
  
  // Build sourceId -> fileName map
  const sourceToFileName = new Map<string, string>();
  for (const doc of structuredDocs) {
    const structuredDoc = doc.document_json as StructuredDocument;
    if (structuredDoc.sourceId) {
      sourceToFileName.set(structuredDoc.sourceId, structuredDoc.fileName);
    }
    // Also map by fileName as fallback (in case sourceId doesn't match)
    sourceToFileName.set(structuredDoc.fileName, structuredDoc.fileName);
  }
  
  let nodesEnriched = 0;
  let referencesAdded = 0;
  
  for (const node of nodes) {
    if (!node.attachments || node.attachments.length === 0) continue;
    
    let enrichedContent = node.content.text;
    const addedReferences = new Set<string>(); // Track what we've added to avoid duplicates
    let nodeModified = false;
    
    // For each attachment, find or add reference
    for (const att of node.attachments) {
      const docName = sourceToFileName.get(att.sourceId) || 
                     sourceToFileName.get(att.fileName) || 
                     att.fileName || 
                     'document';
      
      // Extract type and number from fileName (e.g., "Figure 3", "Table 2", "Equation 1")
      const fileNameMatch = att.fileName.match(/^(Figure|Table|Equation|Fig\.?)\s+(\d+[a-zA-Z]?)/i);
      if (!fileNameMatch) {
        // Try to extract from relevance or other fields
        const relevanceMatch = att.relevance?.match(/(Figure|Table|Equation|Fig\.?)\s+(\d+[a-zA-Z]?)/i);
        if (!relevanceMatch) continue;
        
        const type = relevanceMatch[1].replace(/\./g, '').toLowerCase();
        const num = relevanceMatch[2];
        const normalizedType = type.startsWith('fig') ? 'Figure' : 
                              type.startsWith('tab') ? 'Table' : 
                              type.startsWith('eq') ? 'Equation' : 'Figure';
        const referenceText = `${normalizedType} ${num}`;
        const fullReference = `${referenceText} (from ${docName})`;
        
        // Check if already mentioned in content
        const patterns = [
          new RegExp(`\\b${referenceText}\\b`, 'gi'),
          new RegExp(`\\b${normalizedType.substring(0, 3)}\\.?\\s+${num}\\b`, 'gi'),
        ];
        
        let found = false;
        for (const pattern of patterns) {
          if (pattern.test(enrichedContent)) {
            // Replace existing mention with reference (only if not already there)
            enrichedContent = enrichedContent.replace(pattern, (match) => {
              // Check if this match already has a document reference
              const context = enrichedContent.substring(
                Math.max(0, enrichedContent.indexOf(match) - 50),
                Math.min(enrichedContent.length, enrichedContent.indexOf(match) + match.length + 50)
              );
              if (context.includes('(from')) {
                return match; // Already has reference
              }
              nodeModified = true;
              return `${match} (from ${docName})`;
            });
            found = true;
            referencesAdded++;
            break;
          }
        }
        
        // If not found in content, add at end
        if (!found && !addedReferences.has(referenceText)) {
          enrichedContent += ` [See ${fullReference}]`;
          addedReferences.add(referenceText);
          nodeModified = true;
          referencesAdded++;
        }
        continue;
      }
      
      const [_, typeRaw, num] = fileNameMatch;
      // Normalize type
      const type = typeRaw.toLowerCase().startsWith('fig') ? 'Figure' : 
                  typeRaw.toLowerCase().startsWith('tab') ? 'Table' : 
                  typeRaw.toLowerCase().startsWith('eq') ? 'Equation' : 'Figure';
      const referenceText = `${type} ${num}`;
      const fullReference = `${referenceText} (from ${docName})`;
      
      // Check if already mentioned in content
      const patterns = [
        new RegExp(`\\b${referenceText}\\b`, 'gi'),
        new RegExp(`\\b${type.substring(0, 3)}\\.?\\s+${num}\\b`, 'gi'),
        new RegExp(`\\(${type.substring(0, 3)}\\.?\\s+${num}\\)`, 'gi'),
      ];
      
      let found = false;
      for (const pattern of patterns) {
        // Use replace with function to check context for each match
        const originalContent = enrichedContent; // Keep original for context checking
        let replacementMade = false;
        
        enrichedContent = enrichedContent.replace(pattern, (match, offset) => {
          // Check if this match already has a document reference nearby
          const contextStart = Math.max(0, offset - 30);
          const contextEnd = Math.min(originalContent.length, offset + match.length + 50);
          const context = originalContent.substring(contextStart, contextEnd);
          
          if (context.includes('(from')) {
            return match; // Already has reference, don't modify
          }
          
          // Add document reference
          replacementMade = true;
          nodeModified = true;
          return `${match} (from ${docName})`;
        });
        
        if (replacementMade) {
          found = true;
          referencesAdded++;
          break;
        }
      }
      
      // If not found in content, add at end
      if (!found && !addedReferences.has(referenceText)) {
        enrichedContent += ` [See ${fullReference}]`;
        addedReferences.add(referenceText);
        nodeModified = true;
        referencesAdded++;
      }
    }
    
    if (nodeModified) {
      node.content.text = enrichedContent;
      nodesEnriched++;
    }
  }
  
  console.log(`[CONTENT_ENRICHMENT] Enriched ${nodesEnriched} nodes with ${referencesAdded} attachment references`);
}

/**
 * Analyzes extraction gaps to identify potentially missing information
 */
function analyzeExtractionGaps(
  doc: StructuredDocument,
  extractionResult: WorkflowExtractionResult
): {
  missingFigures: number;
  missingMethods: number;
  missingAnalyses: number;
  recommendations: string[];
} {
  // Count figures/tables in document
  let docFigures = 0;
  let docTables = 0;
  for (const section of doc.sections || []) {
    for (const content of section.content || []) {
      if (content.type === 'figure') docFigures++;
      if (content.type === 'table') docTables++;
    }
  }
  
  const extractedResultNodes = extractionResult.blocks
    .filter(b => b.blockType === 'results')
    .reduce((sum, b) => sum + b.nodes.length, 0);
  
  // Count method keywords in document
  const methodKeywords = [
    'protocol', 'procedure', 'method', 'technique', 'test', 'analysis',
    'measurement', 'collection', 'preparation', 'extraction', 'amplification',
    'statistical', 'anova', 't-test', 'regression', 'model', 'algorithm',
    'calibration', 'validation', 'quality control'
  ];
  
  let methodKeywordCount = 0;
  for (const section of doc.sections || []) {
    const contentText = section.content
      .map(c => c.type === 'text' ? c.content : '')
      .join(' ')
      .toLowerCase();
    
    for (const keyword of methodKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = contentText.match(regex);
      if (matches) {
        methodKeywordCount += matches.length;
      }
    }
  }
  
  const extractedProtocolNodes = extractionResult.blocks
    .filter(b => b.blockType === 'protocol')
    .reduce((sum, b) => sum + b.nodes.length, 0);
  
  const extractedAnalysisNodes = extractionResult.blocks
    .filter(b => b.blockType === 'analysis')
    .reduce((sum, b) => sum + b.nodes.length, 0);
  
  const recommendations: string[] = [];
  
  const totalVisuals = docFigures + docTables;
  if (totalVisuals > 0 && extractedResultNodes < totalVisuals * 0.5) {
    recommendations.push(
      `Document has ${totalVisuals} figures/tables (${docFigures} figures, ${docTables} tables) but only ${extractedResultNodes} result nodes. ` +
      `Consider extracting more result nodes (target: ${Math.ceil(totalVisuals * 0.7)} nodes).`
    );
  }
  
  if (methodKeywordCount > 0 && extractedProtocolNodes < methodKeywordCount * 0.1) {
    recommendations.push(
      `Document mentions many methods (${methodKeywordCount} method keywords) but only ${extractedProtocolNodes} protocol nodes. ` +
      `Consider extracting more protocol nodes (target: ${Math.ceil(methodKeywordCount * 0.15)} nodes).`
    );
  }
  
  // Check for analysis keywords
  const analysisKeywords = ['anova', 't-test', 'chi-square', 'regression', 'correlation', 'statistical', 'test'];
  let analysisKeywordCount = 0;
  for (const section of doc.sections || []) {
    const contentText = section.content
      .map(c => c.type === 'text' ? c.content : '')
      .join(' ')
      .toLowerCase();
    
    for (const keyword of analysisKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = contentText.match(regex);
      if (matches) {
        analysisKeywordCount += matches.length;
      }
    }
  }
  
  if (analysisKeywordCount > 0 && extractedAnalysisNodes < analysisKeywordCount * 0.2) {
    recommendations.push(
      `Document mentions many analyses (${analysisKeywordCount} analysis keywords) but only ${extractedAnalysisNodes} analysis nodes. ` +
      `Consider extracting more analysis nodes (target: ${Math.ceil(analysisKeywordCount * 0.3)} nodes).`
    );
  }
  
  return {
    missingFigures: Math.max(0, totalVisuals - extractedResultNodes),
    missingMethods: Math.max(0, Math.ceil(methodKeywordCount * 0.15) - extractedProtocolNodes),
    missingAnalyses: Math.max(0, Math.ceil(analysisKeywordCount * 0.3) - extractedAnalysisNodes),
    recommendations
  };
}

/**
 * Generates a 1-line summary of node content for the description field
 * Falls back to smart truncation if content is very short
 */
function generateNodeSummary(content: string, title: string): string {
  const trimmedContent = content.trim();
  
  // If content is already short (< 150 chars), use it as-is
  if (trimmedContent.length < 150) {
    return trimmedContent;
  }
  
  // Split into sentences
  const sentences = trimmedContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  if (sentences.length === 0) {
    // Fallback: just truncate
    return trimmedContent.substring(0, 120).trim();
  }
  
  // Strategy 1: Use first sentence if it's a good summary (80-120 chars)
  const firstSentence = sentences[0].trim();
  if (firstSentence.length >= 80 && firstSentence.length <= 120) {
    return firstSentence;
  }
  
  // Strategy 2: Combine first two sentences if combined length is reasonable
  if (sentences.length >= 2) {
    const combined = `${sentences[0].trim()}. ${sentences[1].trim()}`;
    if (combined.length <= 120) {
      return combined;
    }
    // If combined is too long, try to shorten second sentence
    const shortened = `${sentences[0].trim()}. ${sentences[1].trim().substring(0, 80)}`;
    if (shortened.length <= 120) {
      return shortened;
    }
  }
  
  // Strategy 3: Extract key sentence (one that contains important keywords)
  // Look for sentences with action verbs or key terms
  const keyTerms = ['method', 'protocol', 'analysis', 'result', 'procedure', 'technique', 'approach', 
                    'configuration', 'implementation', 'process', 'performed', 'used', 'applied'];
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    if (keyTerms.some(term => lowerSentence.includes(term))) {
      const trimmed = sentence.trim();
      if (trimmed.length <= 120) {
        return trimmed;
      }
      // If too long, truncate at word boundary
      if (trimmed.length > 120) {
        const truncated = trimmed.substring(0, 117);
        const lastSpace = truncated.lastIndexOf(' ');
        return lastSpace > 80 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
      }
    }
  }
  
  // Strategy 4: Use first sentence, truncated to 120 chars at word boundary
  if (firstSentence.length > 120) {
    const truncated = firstSentence.substring(0, 117);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 80 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  }
  
  // Fallback: Use first sentence as-is
  return firstSentence;
}

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
      // Mark as cancelled (status will remain 'cancelled' via complete_job_progress function)
      await progressTracker.completeWithPersistence(trackingJobId, 'Generation cancelled by user');
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
          
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ========== COMPLEXITY ANALYSIS ==========`);
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Document: "${originalFileName}"`);
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Sections: ${structuredDoc.sections.length}`);
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Strategy: ${complexity.extractionStrategy}`);
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Estimated nodes: ${complexity.estimatedNodeCount}`);
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Use hierarchical: ${complexity.shouldUseHierarchical}`);
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Recommended provider: ${complexity.recommendedProvider}`);
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ==========================================`);

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
          
          // VALIDATION: Check if extraction met expectations
          const expectedNodes = complexity.estimatedNodeCount;
          const coverageRatio = expectedNodes > 0 ? totalNodes / expectedNodes : 0;
          
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ✓ Extraction successful: ${extractionResult.blocks.length} blocks, ${totalNodes} nodes in ${duration}ms`);
          console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Extraction validation:`);
          console.log(`  - Expected nodes: ${expectedNodes}`);
          console.log(`  - Actual nodes: ${totalNodes}`);
          console.log(`  - Coverage: ${(coverageRatio * 100).toFixed(1)}%`);
          
          if (coverageRatio < 0.5) {
            console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ⚠️  WARNING: Severe under-extraction detected!`);
            console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] Expected at least ${Math.floor(expectedNodes * 0.5)} nodes, got ${totalNodes}`);
            console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] This may indicate prompt issues or LLM not following instructions.`);
          } else if (coverageRatio < 0.7) {
            console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] ⚠️  WARNING: Moderate under-extraction detected (coverage < 70%)`);
          }
          
          // Calculate and log extraction metrics
          const metrics = calculateExtractionMetrics(complexity, extractionResult);
          logExtractionMetrics(metrics, originalFileName);
          
          // Perform gap analysis
          const gapAnalysis = analyzeExtractionGaps(structuredDoc, extractionResult);
          if (gapAnalysis.recommendations.length > 0) {
            console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] 📊 Gap Analysis:`);
            console.log(`  - Missing figures/tables: ${gapAnalysis.missingFigures}`);
            console.log(`  - Missing methods: ${gapAnalysis.missingMethods}`);
            console.log(`  - Missing analyses: ${gapAnalysis.missingAnalyses}`);
            console.log(`[FAST_IMPORT] [${i + 1}/${structuredDocs.length}] 💡 Recommendations:`);
            gapAnalysis.recommendations.forEach((rec, idx) => {
              console.log(`  ${idx + 1}. ${rec}`);
            });
          }

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

    // Process ALL nodes for ALL documents (aggressive attachment detection)
    for (const doc of structuredDocs) {
      const structuredDoc = doc.document_json as StructuredDocument;
      
      // Process ALL nodes - don't filter, let the resolver check content
      console.log(`[FAST_IMPORT] Resolving attachments for all ${allProposedNodes.length} nodes from document: "${structuredDoc.fileName}"`);
      
      await resolveAttachments(allProposedNodes, structuredDoc);
    }

    const totalAttachments = allProposedNodes.reduce((sum, n) => 
      sum + (n.attachments?.length || 0), 0
    );
    console.log(`[FAST_IMPORT] ✅ Resolved ${totalAttachments} total attachments across all nodes`);

    // Step 3.5: Enrich content with attachment references
    console.log(`[FAST_IMPORT] Enriching node content with attachment document references...`);
    enrichContentWithAttachmentReferences(allProposedNodes, structuredDocs);
    console.log(`[FAST_IMPORT] ✅ Content enrichment complete`);

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
        // Generate a proper 1-line summary instead of truncating content
        const nodeSummary = generateNodeSummary(node.content.text, node.title);
        
        const synthesizedNode = {
          title: node.title,
          short_summary: nodeSummary,
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

    // Step 7: Complete - Mark job as completed in database
    await progressTracker.completeWithPersistence(
      trackingJobId,
      `Completed: ${storedNodeIds.length} proposals generated`
    );

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
      await progressTracker.completeWithPersistence(trackingJobId, 'Generation cancelled by user');
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
