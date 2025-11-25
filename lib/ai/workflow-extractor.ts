import { selectProviderForDocument, getFallbackProvider, shouldAttemptFallback } from './provider';
import { WorkflowExtractionResultSchema, type WorkflowExtractionResult } from './schemas/workflow-extraction-schema';
import { StructuredDocument } from '../processing/parsers/pdf-parser';

/**
 * Workflow Extraction Modes:
 * 
 * SINGLE-PASS (default):
 * - One LLM call extracts entire workflow
 * - Cost: ~$0.32 for 100-page document
 * - Quality: 5-7/10
 * - Best for: Simple/moderate documents
 * 
 * MULTI-PASS (enable with ENABLE_MULTI_PASS_EXTRACTION=true):
 * - Three LLM calls: Discovery → Extraction → Verification
 * - Cost: ~$0.22 for 100-page document (30% cheaper)
 * - Quality: 8-10/10
 * - Best for: Dissertations, complex documents
 * - Guarantees completeness via verification pass
 */

/**
 * Extract workflow structure from a structured document using smart provider selection
 * Uses GPT-4o for smaller documents, Gemini for large documents
 * 
 * @param complexity - Optional complexity analysis to adjust extraction strategy
 */
export async function extractWorkflow(
  structuredDoc: StructuredDocument | StructuredDocument[],
  projectContext?: { name?: string; description?: string },
  complexity?: { estimatedNodeCount: number; extractionStrategy: 'simple' | 'moderate' | 'complex' | 'comprehensive' }
): Promise<WorkflowExtractionResult> {
  const documents = Array.isArray(structuredDoc) ? structuredDoc : [structuredDoc];
  const primaryDoc = documents[0];
  
  // Check if multi-pass extraction is enabled
  const useMultiPass = process.env.ENABLE_MULTI_PASS_EXTRACTION === 'true';
  
  // For dissertations/comprehensive documents, multi-pass is recommended
  const isComprehensive = complexity?.extractionStrategy === 'comprehensive';
  const shouldUseMultiPass = useMultiPass && isComprehensive;
  
  if (shouldUseMultiPass) {
    console.log(`[WORKFLOW_EXTRACTOR] Using MULTI-PASS extraction (comprehensive document)`);
    
    try {
      // Import multi-pass extractor
      const { extractWorkflowMultiPass } = await import('./multi-pass-extractor');
      
      // Get provider
      const provider = selectProviderForDocument(primaryDoc);
      
      // Run multi-pass extraction
      const multiPassResult = await extractWorkflowMultiPass(
        documents,
        provider,
        projectContext
      );
      
      console.log(`[WORKFLOW_EXTRACTOR] Multi-pass extraction successful`);
      console.log(`[WORKFLOW_EXTRACTOR] Quality score: ${multiPassResult.metadata.verificationResult.qualityScore}/10`);
      
      return multiPassResult.result;
      
    } catch (error) {
      console.error(`[WORKFLOW_EXTRACTOR] Multi-pass extraction failed, falling back to single-pass:`, error);
      // Fall through to single-pass extraction
    }
  }
  
  // EXISTING SINGLE-PASS EXTRACTION CODE
  console.log(`[WORKFLOW_EXTRACTOR] Using SINGLE-PASS extraction`);
  
  const startTime = Date.now();
  console.log(`[WORKFLOW_EXTRACTOR] Starting extraction from ${primaryDoc.type} document: "${primaryDoc.fileName}"`);

  // Format structured document for LLM
  const formattedDocument = formatStructuredDocumentForLLM(primaryDoc);
  console.log(`[WORKFLOW_EXTRACTOR] Formatted document: ${formattedDocument.length} chars, ${primaryDoc.sections.length} sections`);

  // Check if document has meaningful content
  if (formattedDocument.trim().length < 100) {
    throw new Error(`Document too short after formatting (${formattedDocument.length} chars). Document may be empty or all content was filtered out.`);
  }

  // Select optimal provider based on document size
  const provider = selectProviderForDocument(primaryDoc);
  const modelInfo = provider.getModelInfo();
  
  console.log(`[WORKFLOW_EXTRACTOR] Using model: ${modelInfo.name}`);
  console.log(`[WORKFLOW_EXTRACTOR] Model capacity: ${modelInfo.maxInputTokens} input tokens, ${modelInfo.maxOutputTokens} output tokens`);
  if (complexity) {
    console.log(`[WORKFLOW_EXTRACTOR] Complexity strategy: ${complexity.extractionStrategy} (estimated ${complexity.estimatedNodeCount} nodes)`);
  }

  try {
    const llmStartTime = Date.now();
    // Extract workflow using selected provider (already validated by provider)
    const result = await provider.extractWorkflowFromDocument(primaryDoc, projectContext, complexity);
    const llmDuration = Date.now() - llmStartTime;
    
    const totalDuration = Date.now() - startTime;
    const totalNodes = result.blocks.reduce((sum, b) => sum + b.nodes.length, 0);

    console.log(`[WORKFLOW_EXTRACTOR] ✓ Extraction complete: ${result.blocks.length} blocks, ${totalNodes} nodes`);
    console.log(`[WORKFLOW_EXTRACTOR] Total time: ${totalDuration}ms (LLM: ${llmDuration}ms, processing: ${totalDuration - llmDuration}ms)`);

    // Post-extraction validation logging
    // Helper function for similarity (simple word overlap)
    const calculateSimilarity = (str1: string, str2: string): number => {
      const words1 = str1.split(/\s+/);
      const words2 = str2.split(/\s+/);
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      const intersection = words1.filter(x => set2.has(x));
      const union = new Set([...words1, ...words2]);
      return intersection.length / union.size;
    };

    // Warn if over-fragmented
    if (result.blocks.length > 9) {
      console.warn(`[WORKFLOW_EXTRACTOR] Warning: ${result.blocks.length} blocks detected. Consider consolidation.`);
    }

    // Warn about single-node blocks
    const singleNodeBlocks = result.blocks.filter(b => b.nodes.length === 1);
    if (singleNodeBlocks.length > 0) {
      console.warn(`[WORKFLOW_EXTRACTOR] Warning: ${singleNodeBlocks.length} block(s) with only 1 node:`, 
        singleNodeBlocks.map(b => b.blockName));
    }

    // Check for potential duplicates (>60% similarity in names)
    const blockNames = result.blocks.map(b => b.blockName.toLowerCase());
    for (let i = 0; i < blockNames.length; i++) {
      for (let j = i + 1; j < blockNames.length; j++) {
        const similarity = calculateSimilarity(blockNames[i], blockNames[j]);
        if (similarity > 0.6) {
          console.warn(`[WORKFLOW_EXTRACTOR] Potential duplicate blocks detected:`,
            `"${result.blocks[i].blockName}" and "${result.blocks[j].blockName}" (${Math.round(similarity * 100)}% similar)`);
        }
      }
    }

    return result;
  } catch (error: any) {
    // Check if error is rate limit or truncation and fallback provider is available
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStatus = (error as any)?.status;
    const isRateLimit = errorStatus === 429 || 
      errorMessage?.includes('rate limit') || 
      errorMessage?.includes('Rate limit') ||
      errorMessage?.includes('rate_limit');
    
    const isTruncationError = 
      errorMessage?.includes('exceeded') && errorMessage?.includes('output limit') ||
      errorMessage?.includes('too large') ||
      errorMessage?.includes('truncated') ||
      errorMessage?.includes('Unterminated string') ||
      errorMessage?.includes('cut off');
    
    if ((isRateLimit || isTruncationError) && shouldAttemptFallback(provider, primaryDoc)) {
      const errorType = isTruncationError ? 'truncation' : 'rate limit';
      console.log(`[WORKFLOW_EXTRACTOR] ${errorType} detected, falling back to alternative provider`);
      try {
        const fallbackProvider = getFallbackProvider(provider, primaryDoc);
        const fallbackModelInfo = fallbackProvider.getModelInfo();
        console.log(`[WORKFLOW_EXTRACTOR] Attempting extraction with fallback provider: ${fallbackModelInfo.name}`);
        
        const fallbackStartTime = Date.now();
        const fallbackResult = await fallbackProvider.extractWorkflowFromDocument(primaryDoc, projectContext, complexity);
        const fallbackDuration = Date.now() - fallbackStartTime;
        
        const totalDuration = Date.now() - startTime;
        const totalNodes = fallbackResult.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
        
        console.log(`[WORKFLOW_EXTRACTOR] ✓ Fallback extraction complete: ${fallbackResult.blocks.length} blocks, ${totalNodes} nodes`);
        console.log(`[WORKFLOW_EXTRACTOR] Fallback time: ${fallbackDuration}ms, Total time: ${totalDuration}ms`);
        
        // Post-extraction validation logging (fallback path)
        // Helper function for similarity (simple word overlap)
        const calculateSimilarity = (str1: string, str2: string): number => {
          const words1 = str1.split(/\s+/);
          const words2 = str2.split(/\s+/);
          const set1 = new Set(words1);
          const set2 = new Set(words2);
          const intersection = words1.filter(x => set2.has(x));
          const union = new Set([...words1, ...words2]);
          return intersection.length / union.size;
        };

        // Warn if over-fragmented
        if (fallbackResult.blocks.length > 9) {
          console.warn(`[WORKFLOW_EXTRACTOR] Warning: ${fallbackResult.blocks.length} blocks detected. Consider consolidation.`);
        }

        // Warn about single-node blocks
        const singleNodeBlocks = fallbackResult.blocks.filter(b => b.nodes.length === 1);
        if (singleNodeBlocks.length > 0) {
          console.warn(`[WORKFLOW_EXTRACTOR] Warning: ${singleNodeBlocks.length} block(s) with only 1 node:`, 
            singleNodeBlocks.map(b => b.blockName));
        }

        // Check for potential duplicates (>60% similarity in names)
        const blockNames = fallbackResult.blocks.map(b => b.blockName.toLowerCase());
        for (let i = 0; i < blockNames.length; i++) {
          for (let j = i + 1; j < blockNames.length; j++) {
            const similarity = calculateSimilarity(blockNames[i], blockNames[j]);
            if (similarity > 0.6) {
              console.warn(`[WORKFLOW_EXTRACTOR] Potential duplicate blocks detected:`,
                `"${fallbackResult.blocks[i].blockName}" and "${fallbackResult.blocks[j].blockName}" (${Math.round(similarity * 100)}% similar)`);
            }
          }
        }
        
        return fallbackResult;
      } catch (fallbackError: any) {
        console.error(`[WORKFLOW_EXTRACTOR] ✗ Fallback provider also failed:`, fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
        // Continue to original error handling below
      }
    }
    const totalDuration = Date.now() - startTime;
    console.error(`[WORKFLOW_EXTRACTOR] ✗ Extraction failed after ${totalDuration}ms`);
    console.error(`[WORKFLOW_EXTRACTOR] Error type: ${error?.constructor?.name || typeof error}`);
    console.error(`[WORKFLOW_EXTRACTOR] Error message: ${error instanceof Error ? error.message : String(error)}`);
    
    // If schema validation fails, provide detailed error info
    if (error.name === 'ZodError') {
      console.error(`[WORKFLOW_EXTRACTOR] Schema validation failed with ${error.errors?.length || 0} errors:`);
      const errorPreview = error.errors?.slice(0, 5).map((e: any) => 
        `  - ${e.path.join('.')}: ${e.message}`
      ).join('\n');
      console.error(`[WORKFLOW_EXTRACTOR] Validation errors:\n${errorPreview}`);
      
      // Try to log what we got
      if (error.data) {
        console.error(`[WORKFLOW_EXTRACTOR] Invalid response data:`, JSON.stringify(error.data).substring(0, 500));
      }
      
      throw new Error(`Invalid workflow extraction result: ${error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ')}`);
    }
    
    // Check for truncation/token limit errors (preserve user-friendly messages)
    if (error.message?.includes('too large') || error.message?.includes('cut off') || error.message?.includes('processing limit')) {
      console.error(`[WORKFLOW_EXTRACTOR] Document too large - truncation detected`);
      // Preserve the user-friendly error message from the provider
      throw error;
    }
    
    // Check for API errors
    if (error.message?.includes('API') || error.message?.includes('key') || error.message?.includes('authentication')) {
      console.error(`[WORKFLOW_EXTRACTOR] Possible API configuration issue`);
      throw new Error(`LLM API error: ${error.message}. Please check your API key configuration.`);
    }
    
    // Check for timeout errors
    if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
      console.error(`[WORKFLOW_EXTRACTOR] Request timed out`);
      throw new Error(`LLM request timed out: ${error.message}`);
    }
    
    throw new Error(`Failed to extract workflow: ${error.message || String(error)}`);
  }
}

/**
 * Format structured document for LLM consumption while preserving hierarchy
 * Exported for use in document validation before extraction
 */
export function formatStructuredDocumentForLLM(doc: StructuredDocument): string {
  let output = '';

  for (const section of doc.sections) {
    // Preserve heading hierarchy
    const headingPrefix = '#'.repeat(section.level);
    output += `\n${headingPrefix} ${section.title}\n`;
    
    if (section.sectionNumber) {
      output += `(Section ${section.sectionNumber})\n`;
    }
    
    output += `[Page ${section.pageRange[0]}-${section.pageRange[1]}]\n\n`;

    for (const block of section.content) {
      switch (block.type) {
        case 'text':
          output += `${block.content}\n\n`;
          break;
        case 'list':
          // Preserve list formatting
          if (block.formatting?.isNumberedList) {
            output += `${block.content}\n`; // Already has "1.", "2.", etc.
          } else {
            output += `- ${block.content}\n`;
          }
          break;
        case 'table':
          output += `[TABLE]\n${block.content}\n[/TABLE]\n\n`;
          break;
        case 'figure':
          output += `[FIGURE: Page ${block.pageNumber}]\n${block.content}\n\n`;
          break;
        case 'code':
          output += `\`\`\`\n${block.content}\n\`\`\`\n\n`;
          break;
      }
    }
  }

  return output;
}

/**
 * Detect document domain based on content analysis
 */
function detectDocumentDomain(doc: StructuredDocument): 'finance' | 'biology' | 'ml-ai' | 'engineering' | 'chemistry' | 'general' {
  const fullText = JSON.stringify(doc).toLowerCase();
  
  // Finance domain indicators
  if (fullText.includes('portfolio') || fullText.includes('trading') || 
      fullText.includes('bond') || fullText.includes('stock') || 
      fullText.includes('financial') || fullText.includes('kalman filter') ||
      fullText.includes('yield') || fullText.includes('sentiment analysis') ||
      fullText.includes('roi') || fullText.includes('backtesting')) {
    return 'finance';
  }
  
  // Biology domain indicators
  if (fullText.includes('cell') || fullText.includes('protein') || 
      fullText.includes('dna') || fullText.includes('rna') || 
      fullText.includes('gene') || fullText.includes('pcr') ||
      fullText.includes('sequencing') || fullText.includes('western blot') ||
      fullText.includes('extraction') && (fullText.includes('rna') || fullText.includes('dna'))) {
    return 'biology';
  }
  
  // ML/AI domain indicators
  if ((fullText.includes('neural') || fullText.includes('learning') || 
       fullText.includes('deep learning') || fullText.includes('transformer') ||
       fullText.includes('bert') || fullText.includes('gpt') ||
       fullText.includes('classification') || fullText.includes('regression')) &&
      (fullText.includes('model') || fullText.includes('training') || 
       fullText.includes('algorithm'))) {
    return 'ml-ai';
  }
  
  // Engineering domain indicators
  if (fullText.includes('circuit') || fullText.includes('signal processing') ||
      fullText.includes('control system') || fullText.includes('robotics') ||
      fullText.includes('mechanical') || fullText.includes('electrical')) {
    return 'engineering';
  }
  
  // Chemistry domain indicators
  if (fullText.includes('synthesis') || fullText.includes('reaction') ||
      fullText.includes('compound') || fullText.includes('molecule') ||
      fullText.includes('chromatography') || fullText.includes('spectroscopy')) {
    return 'chemistry';
  }
  
  return 'general';
}

/**
 * Detect key sections in the document for better mapping guidance
 */
function detectDocumentSections(doc: StructuredDocument): {
  hasMethodology: boolean;
  hasResults: boolean;
  hasDiscussion: boolean;
  hasDataSection: boolean;
  methodsSectionTitle?: string;
  resultsSectionTitle?: string;
} {
  const sections = doc.sections || [];
  const sectionTitles = sections.map(s => s.title.toLowerCase());
  
  return {
    hasMethodology: sectionTitles.some(t => 
      t.includes('method') || t.includes('procedure') || t.includes('protocol')
    ),
    hasResults: sectionTitles.some(t =>
      t.includes('result') || t.includes('finding') || t.includes('outcome')
    ),
    hasDiscussion: sectionTitles.some(t =>
      t.includes('discussion') || t.includes('conclusion') || t.includes('implication')
    ),
    hasDataSection: sectionTitles.some(t =>
      t.includes('data') || t.includes('feature') || t.includes('preprocessing')
    ),
    methodsSectionTitle: sections.find(s => 
      s.title.toLowerCase().includes('method')
    )?.title,
    resultsSectionTitle: sections.find(s =>
      s.title.toLowerCase().includes('result')
    )?.title
  };
}

/**
 * Build user prompt for workflow extraction with explicit structure
 * Exported for use by AI providers
 * 
 * @param complexity - Optional complexity analysis to adjust prompt for document scale
 */
export function buildUserPrompt(
  structuredDoc: StructuredDocument,
  formattedDocument: string,
  projectContext?: { name?: string; description?: string },
  complexity?: { estimatedNodeCount: number; extractionStrategy: 'simple' | 'moderate' | 'complex' | 'comprehensive' }
): string {
  // Detect document domain and sections for better mapping guidance
  const domain = detectDocumentDomain(structuredDoc);
  const detectedSections = detectDocumentSections(structuredDoc);
  // Base instructions
  const baseInstructions = `You are analyzing a research document to extract its experimental workflow.
Your goal is to create a comprehensive experiment tree with nodes representing protocols, data collection, analyses, and results.

CRITICAL CLARIFICATION: "Comprehensive extraction" means EXTRACTING MANY SEPARATE NODES with detailed content, NOT consolidating items into fewer nodes.
- Extract MANY nodes (one per figure, one per test, one per method, etc.)
- Each node should have DETAILED, COMPREHENSIVE content (multiple paragraphs)
- DO NOT consolidate distinct items into fewer nodes just to make them "comprehensive"
- Better to have 20 detailed nodes than 10 "comprehensive" consolidated nodes

CRITICAL: Extract ALL experiments, methods, analyses, and results from the document.
Do not summarize or condense—create separate nodes for each distinct:
- Protocol or procedure
- Data collection method
- Analysis technique
- Result or finding
Each node should be atomic and specific, with detailed content.`;

  // Scale-specific guidance - ENHANCED with explicit extraction intensity
  let extractionIntensityGuidance = '';
  let exampleAdjustment = '';

  if (complexity) {
    switch (complexity.extractionStrategy) {
      case 'simple':
        extractionIntensityGuidance = `
## EXTRACTION INTENSITY: SIMPLE DOCUMENT

This document should yield approximately 5-15 nodes (target: ${complexity.estimatedNodeCount} nodes).

**Your task:**
- Extract the main experimental workflow (protocol → data → analysis → results)
- Create 1-3 protocol nodes for key methods
- Create 1-2 data collection nodes
- Create 1-2 analysis nodes
- Create 2-5 result nodes (one per major finding/figure)

**Example structure:**
- Protocol Block: 2 nodes
- Data Creation Block: 1 node
- Analysis Block: 1 node
- Results Block: 3 nodes
Total: ~7 nodes

**Content detail:**
- Each node can contain multiple paragraphs if needed
- Include all relevant details from the source
- Don't summarize - preserve complete information

**Block Naming Guidelines:**

- Analyze the document to identify 3-7 major thematic phases

- Create descriptive block names that reflect actual content, not generic categories

- **CRITICAL: Block names MUST be specific and domain-relevant. Use terminology from the source document.**

**BAD examples (too generic - DO NOT USE THESE):**
- "Data Block"
- "Methodology Block"  
- "Analysis Block"
- "Results Block"
- "Protocol Block"
- "Data Creation Block"

**GOOD examples (specific and descriptive - USE THESE AS TEMPLATES):**
- "Financial Data Preparation & Feature Engineering"
- "Kalman Filter Model Implementation"
- "Performance Evaluation & Comparison"
- "Model Performance & ROI Analysis"
- "Cell Culture Preparation & Quality Control"
- "RNA Extraction & Purification Protocol"
- "Sequencing Data Generation & Quality Assessment"
- "Bioinformatics Analysis Pipeline & Statistical Validation"

**Domain-Specific Examples:**

* **Biology/Wet Lab:**
  - "Cell Culture Preparation Protocol"
  - "RNA Extraction & Purification"
  - "Sequencing Data Generation"
  - "Differential Expression Analysis & Statistical Validation"

* **Machine Learning/AI:**
  - "Dataset Curation & Preprocessing"
  - "Model Architecture Design & Configuration"
  - "Training & Hyperparameter Optimization"
  - "Benchmark Evaluation & Ablation Studies"

* **Finance/Economics:**
  - "Financial Data Preparation & Feature Engineering"
  - "Kalman Filter Implementation & State Space Modeling"
  - "Performance Backtesting & Risk Analysis"
  - "ROI Analysis & Portfolio Optimization"

**Block Naming Strategy:**

1. **Read the document title and abstract first** - Identify the main topic, methods, and domain terminology

2. **Extract key terms** from the document:
   - Method names (e.g., "Kalman Filter", "ANOVA", "PCR")
   - Data types (e.g., "Bond Yield", "RNA-seq", "Financial Time Series")
   - Analysis types (e.g., "Sentiment Analysis", "Differential Expression", "Performance Evaluation")
   - Outcome metrics (e.g., "ROI", "Accuracy", "Gene Expression Levels")

3. **Incorporate these terms into block names:**
   - For data sections: "[Specific Data Type] Collection & Preprocessing"
   - For method sections: "[Specific Method Name] Implementation"
   - For analysis sections: "[Specific Analysis Type] & Comparison"
   - For results sections: "[Specific Outcome Metric] Performance Analysis"

4. **Use domain terminology** - If the document mentions "Kalman Filter", use that in the block name. If it mentions "Bond Yield Prediction", use that terminology.

**Block Organization:**

- Group related nodes into coherent phases

- Each block should represent a distinct stage of the workflow

- Blocks should flow logically from preparation → execution → evaluation

- Block names should immediately convey what that phase accomplishes

**Block Consolidation Guidelines:**

CRITICAL: Avoid creating multiple blocks for the same conceptual phase.

Common consolidation patterns:
- "Data Collection", "Data Preprocessing", "Data Cleaning" 
  → ONE block: "Data Collection & Preprocessing"
  
- "Sentiment Analysis Setup", "Sentiment Analysis Configuration", "Sentiment Analysis Integration"
  → ONE block: "Sentiment Analysis Ensemble Configuration"
  
- "Model Training", "Model Optimization", "Hyperparameter Tuning"
  → ONE block: "Model Training & Optimization"
  
- "Performance Evaluation", "Results Analysis", "Performance Metrics"
  → ONE block: "Performance Evaluation & Analysis"

Rule: If two potential blocks describe sequential steps in the SAME phase, 
merge them with descriptive naming (e.g., "Feature Selection & Engineering" 
instead of separate "Feature Selection" and "Feature Engineering" blocks).

**Block Count Targets (adapt to document complexity):**

Document size guidance:
- Short paper (10-30 pages): Aim for 3-5 blocks
- Standard paper (30-80 pages): Aim for 4-7 blocks
- Long paper/thesis (80-150 pages): Aim for 5-9 blocks
- Dissertation (150+ pages): Aim for 6-12 blocks

Default target: 4-6 major blocks for most documents.

Only create MORE blocks when:
1. The document explicitly describes distinct, non-overlapping phases
2. Phases occur at different times (not parallel sub-tasks)
3. Each phase has substantial unique methodology (not just parameter variations)

Only create FEWER blocks when:
1. Document is very focused on a single methodology
2. Phases are tightly integrated and inseparable

**Workflow Diagram Integration:**

If the document contains a workflow diagram (commonly in figures like "Figure 2: 
Methodology Workflow" or "Experimental Pipeline"):
1. Identify the main phases shown in the diagram
2. Use the diagram's structure as the primary guide for block organization
3. Block names should reflect the phase names or descriptions in the diagram
4. Respect the sequential order shown in the diagram

Look for text references like:
- "As shown in Figure X, our workflow consists of..."
- "The experimental pipeline (Figure X) includes..."
- "Following the methodology in Figure X..."

**Block Size Guidelines:**

- Each block should contain at least 2 nodes
- If a phase has only 1 node, reconsider if it should be:
  a) Merged into a related block
  b) Expanded with more detail from the document
  c) Actually a nested tree procedure (not a standalone block)
  
- Blocks can naturally vary in size (2-10 nodes)
- Imbalance is acceptable if it reflects document structure
- Don't force artificial balance by splitting logical phases

**Block Sequencing:**

Blocks should follow the natural flow described in the document.

Typical sequence (adapt to actual document):
1. Data acquisition/preparation phase
2. Methodology development/implementation phase
3. Experimental execution/analysis phase
4. Results evaluation/interpretation phase

However, ALWAYS adapt to the document's actual structure. Some documents:
- Interleave methodology and results
- Present multiple parallel workflows
- Describe iterative refinement cycles

Follow the document, don't force a template.
`;
        exampleAdjustment = `
**Example structure for a machine learning paper (30 pages):**

GOOD (consolidated, 4 blocks):
- Dataset Curation & Preprocessing: 3 nodes
- Model Architecture Design & Training: 4 nodes
- Performance Evaluation & Benchmarking: 3 nodes
- Results Analysis & Discussion: 2 nodes
Total: 4 blocks, ~12 nodes

BAD (over-fragmented, 9 blocks):
- Data Collection: 1 node
- Data Preprocessing: 2 nodes
- Model Architecture: 2 nodes
- Training Setup: 1 node
- Training Execution: 1 node
- Evaluation Metrics: 2 nodes
- Benchmark Comparison: 1 node
- Results: 1 node
- Discussion: 1 node
Total: 9 blocks, ~12 nodes (same content, too fragmented!)

**Example structure for a biology protocol (40 pages):**

GOOD (consolidated, 5 blocks):
- Sample Preparation & Quality Control: 3 nodes
- RNA Extraction & Purification: 4 nodes
- Library Preparation & Sequencing: 3 nodes
- Bioinformatics Analysis Pipeline: 4 nodes
- Statistical Validation & Results: 3 nodes
Total: 5 blocks, ~17 nodes

**Example structure for a finance dissertation (150 pages):**

GOOD (consolidated, 7 blocks):
- Financial Data Collection & Preparation: 3 nodes
- Feature Engineering & Selection: 4 nodes
- Kalman Filter Model Implementation: 5 nodes
- Sentiment Analysis Integration: 3 nodes
- Performance Evaluation & Comparison: 4 nodes
- Trading Simulation & ROI Analysis: 3 nodes
- Sustainability & Implications Analysis: 2 nodes
Total: 7 blocks, ~24 nodes

BAD (over-fragmented, 12 blocks):
- Data Collection: 2 nodes
- Data Preprocessing: 2 nodes
- Feature Selection: 2 nodes
- Kalman Filter Setup: 2 nodes
- Model Training: 2 nodes
- Sentiment Analysis Setup: 1 node
- Sentiment Integration: 1 node
- Performance Metrics: 3 nodes
- ROI Analysis: 2 nodes
- Results: 2 nodes
- Discussion: 2 nodes
- Sustainability: 1 node
Total: 12 blocks, ~22 nodes (similar content, twice as many blocks!)

EXAMPLE OUTPUT STRUCTURE (for a machine learning paper):
{
  "blocks": [
    {
      "blockName": "Dataset Curation & Preprocessing",
      "blockType": "data",
      "blockDescription": "Data collection, cleaning, and feature engineering steps",
      "nodes": [
        {
          "nodeId": "node-1",
          "title": "Data Collection Protocol",
          "dependencies": []
        }
        // 2 nodes total
      ]
    },
    {
      "blockName": "Model Architecture Design",
      "blockType": "methodology",
      "blockDescription": "Neural network architecture specification and configuration",
      "nodes": [
        {
          "nodeId": "node-2",
          "title": "Architecture Specification",
          "dependencies": [
            {
              "referencedNodeTitle": "Data Collection Protocol",
              "dependencyType": "requires",
              "extractedPhrase": "after data collection",
              "confidence": 0.9
            }
          ]
        }
        // 2 nodes total
      ]
    },
    {
      "blockName": "Training & Optimization",
      "blockType": "methodology",
      "blockDescription": "Model training procedures and hyperparameter tuning",
      "nodes": [
        {
          "nodeId": "node-3",
          "title": "Training Loop Implementation",
          "dependencies": [
            {
              "referencedNodeTitle": "Architecture Specification",
              "dependencyType": "uses_output",
              "extractedPhrase": "using the specified architecture",
              "confidence": 0.9
            }
          ]
        }
        // 2 nodes total
      ]
    },
    {
      "blockName": "Benchmark Evaluation",
      "blockType": "results",
      "blockDescription": "Performance metrics and comparison with baseline models",
      "nodes": [
        {
          "nodeId": "node-4",
          "title": "Performance Metrics Calculation",
          "dependencies": [
            {
              "referencedNodeTitle": "Training Loop Implementation",
              "dependencyType": "uses_output",
              "extractedPhrase": "based on trained model",
              "confidence": 0.95
            }
          ]
        }
        // 2 nodes total
      ]
    }
  ]
}

EXAMPLE OUTPUT STRUCTURE (for a biology protocol):
{
  "blocks": [
    {
      "blockName": "Sample Preparation & Quality Control",
      "blockType": "methodology",
      "blockDescription": "Cell culture maintenance and sample collection procedures",
      "nodes": [
        {
          "nodeId": "node-1",
          "title": "Cell Culture Maintenance",
          "dependencies": []
        }
        // 2 nodes total
      ]
    },
    {
      "blockName": "RNA Extraction Protocol",
      "blockType": "methodology",
      "blockDescription": "RNA isolation and purification procedures",
      "nodes": [
        {
          "nodeId": "node-2",
          "title": "Cell Lysis & RNA Isolation",
          "dependencies": [
            {
              "referencedNodeTitle": "Cell Culture Maintenance",
              "dependencyType": "requires",
              "extractedPhrase": "after cell culture",
              "confidence": 0.9
            }
          ]
        }
        // 3 nodes total
      ]
    },
    {
      "blockName": "Sequencing & Data Generation",
      "blockType": "data",
      "blockDescription": "Library preparation and sequencing run procedures",
      "nodes": [
        {
          "nodeId": "node-3",
          "title": "Library Preparation",
          "dependencies": [
            {
              "referencedNodeTitle": "Cell Lysis & RNA Isolation",
              "dependencyType": "uses_output",
              "extractedPhrase": "using extracted RNA",
              "confidence": 0.9
            }
          ]
        }
        // 2 nodes total
      ]
    },
    {
      "blockName": "Bioinformatics Analysis Pipeline",
      "blockType": "analysis",
      "blockDescription": "Read alignment, quality filtering, and differential expression analysis",
      "nodes": [
        {
          "nodeId": "node-4",
          "title": "Read Alignment & Quality Control",
          "dependencies": [
            {
              "referencedNodeTitle": "Library Preparation",
              "dependencyType": "uses_output",
              "extractedPhrase": "using sequencing data",
              "confidence": 0.95
            }
          ]
        }
        // 2 nodes total
      ]
    }
  ]
}

REMEMBER: Dependencies must be objects with referencedNodeTitle, dependencyType, extractedPhrase, and optionally confidence.`;
        break;

      case 'moderate':
        extractionIntensityGuidance = `
## EXTRACTION INTENSITY: MODERATE DOCUMENT

This document should yield approximately 15-30 nodes (target: ${complexity.estimatedNodeCount} nodes).

**Your task:**
- Extract ALL distinct experimental procedures (not just main ones)
- Create separate nodes for each protocol variation
- Create nodes for ALL data collection methods
- Create nodes for ALL analysis techniques
- Create nodes for ALL major results with their figures/tables

**Example structure:**
- Protocol Block: 5-8 nodes (each distinct procedure)
- Data Creation Block: 3-5 nodes (each data source/collection method)
- Analysis Block: 4-7 nodes (each statistical test/analysis)
- Results Block: 8-12 nodes (each finding/figure/comparison)
Total: 20-32 nodes

**DO NOT SKIP:**
- Validation protocols
- Control experiments
- Preliminary results
- Supporting analyses

**Content detail:**
- Nodes can be comprehensive with multiple paragraphs
- Include all methodological details, not just summaries
- Preserve complete context from source document
`;
        exampleAdjustment = `
EXAMPLE OUTPUT STRUCTURE (for moderate documents):
{
  "blocks": [
    {
      "blockName": "Protocol Block",
      "nodes": [
        {
          "nodeId": "node-1",
          "title": "Sample Collection",
          "dependencies": []
        }
        // 1-3 protocol nodes total
      ]
    },
    {
      "blockName": "Data Creation Block",
      "nodes": [
        {
          "nodeId": "node-2",
          "title": "Data Collection",
          "dependencies": [
            {
              "referencedNodeTitle": "Sample Collection",
              "dependencyType": "requires",
              "extractedPhrase": "after sample collection",
              "confidence": 0.9
            }
          ]
        }
        // 1-2 data collection nodes total
      ]
    },
    {
      "blockName": "Analysis Block",
      "nodes": [
        {
          "nodeId": "node-3",
          "title": "Statistical Analysis",
          "dependencies": [
            {
              "referencedNodeTitle": "Data Collection",
              "dependencyType": "uses_output",
              "extractedPhrase": "using collected data",
              "confidence": 0.9
            }
          ]
        }
        // 1-2 analysis nodes total
      ]
    },
    {
      "blockName": "Results Block",
      "nodes": [
        {
          "nodeId": "node-4",
          "title": "Analysis Results",
          "dependencies": [
            {
              "referencedNodeTitle": "Statistical Analysis",
              "dependencyType": "uses_output",
              "extractedPhrase": "based on statistical analysis",
              "confidence": 0.95
            }
          ]
        }
        // 2-5 result nodes total
      ]
    }
  ]
}

REMEMBER: Dependencies must be objects with referencedNodeTitle, dependencyType, extractedPhrase, and optionally confidence.`;
        break;

      case 'moderate':
        extractionIntensityGuidance = `
## EXTRACTION INTENSITY: MODERATE DOCUMENT

This document should yield approximately 15-30 nodes (target: ${complexity.estimatedNodeCount} nodes).

**Your task:**
- Extract ALL distinct experimental procedures (not just main ones)
- Create separate nodes for each protocol variation
- Create nodes for ALL data collection methods
- Create nodes for ALL analysis techniques
- Create nodes for ALL major results with their figures/tables

**Example structure:**
- Protocol Block: 5-8 nodes (each distinct procedure)
- Data Creation Block: 3-5 nodes (each data source/collection method)
- Analysis Block: 4-7 nodes (each statistical test/analysis)
- Results Block: 8-12 nodes (each finding/figure/comparison)
Total: 20-32 nodes

**DO NOT SKIP:**
- Validation protocols
- Control experiments
- Preliminary results
- Supporting analyses

**Content detail:**
- Nodes can be comprehensive with multiple paragraphs
- Include all methodological details, not just summaries
- Preserve complete context from source document
`;
        exampleAdjustment = `
EXAMPLE OUTPUT STRUCTURE (for moderate documents):
{
  "blocks": [
    {
      "blockName": "Protocol Block",
      "nodes": [
        // 3-8 protocol nodes
      ]
    },
    {
      "blockName": "Data Creation Block",
      "nodes": [
        // 3-6 data collection nodes
      ]
    },
    {
      "blockName": "Analysis Block",
      "nodes": [
        // 4-8 analysis nodes
      ]
    },
    {
      "blockName": "Results Block",
      "nodes": [
        // 5-10 result nodes
      ]
    }
  ]
}`;
        break;

      case 'complex':
        extractionIntensityGuidance = `
## EXTRACTION INTENSITY: COMPLEX DOCUMENT

This document should yield approximately 30-50 nodes (target: ${complexity.estimatedNodeCount} nodes).

**Your task:**
- Extract EVERY protocol mentioned, including sub-protocols and variations
- Create separate nodes for EVERY data processing step
- Create nodes for EVERY analysis method, even minor ones
- Include ALL results, even supporting or negative results

**Example structure:**
- Protocol Block: 8-15 nodes (detailed protocols + sub-protocols)
- Data Creation Block: 6-10 nodes (all data sources + processing)
- Analysis Block: 10-15 nodes (every statistical test + validation)
- Results Block: 15-25 nodes (every finding/figure/table/comparison)
Total: 39-65 nodes

**CRITICAL - Extract these even if they seem minor:**
- Preliminary experiments
- Validation studies
- Control conditions
- Baseline measurements
- Supplementary analyses
- Error analysis
- Sensitivity testing

**Content detail:**
- Each node should be comprehensive with full context
- Multiple paragraphs per node are expected and encouraged
- Include all parameters, conditions, and methodological details
- Preserve complete information from source, don't summarize
`;
        exampleAdjustment = `
EXAMPLE OUTPUT STRUCTURE (for complex documents):
{
  "blocks": [
    {
      "blockName": "Protocol Block",
      "nodes": [
        // 8-15 protocol nodes (one per distinct method)
      ]
    },
    {
      "blockName": "Data Creation Block",
      "nodes": [
        // 8-15 data collection nodes
      ]
    },
    {
      "blockName": "Analysis Block",
      "nodes": [
        // 10-20 analysis nodes (one per technique/test)
      ]
    },
    {
      "blockName": "Results Block",
      "nodes": [
        // 10-20 result nodes (one per major finding/figure)
      ]
    }
  ]
}`;
        break;

      case 'comprehensive':
        // For comprehensive documents, restructure prompt with critical rules at top
        extractionIntensityGuidance = `
## EXTRACTION INTENSITY: COMPREHENSIVE DOCUMENT (DISSERTATION/THESIS)

This document should yield approximately 40-100+ nodes (target: ${complexity.estimatedNodeCount} nodes).

**Your task:**
- Extract EVERY SINGLE protocol, sub-protocol, and protocol variation
- Create nodes for EVERY experimental condition
- Extract EVERY data processing and cleaning step
- Create separate nodes for EVERY statistical test
- Include ALL results: main, supporting, supplementary, negative, preliminary
- Extract methodological validations
- Include literature review protocols if they involve systematic methods

**Content detail for comprehensive documents:**
- Each node should be DETAILED and COMPREHENSIVE
- Multiple paragraphs (3-10+ paragraphs) per node are EXPECTED
- Include ALL methodological details, parameters, and conditions
- Preserve complete context - don't summarize or truncate
- Long, detailed content is BETTER than short, incomplete content
- Each node should be self-contained with full information

**ABSOLUTELY DO NOT SKIP:**
- Every figure and table should have a corresponding result node
- Every mentioned statistical test should be a separate analysis node
- Every experimental condition should be a separate protocol node
- Pilot studies and preliminary experiments
- Validation and verification procedures
- Control experiments and baselines
- Sensitivity analyses
- Error analyses
- Supplementary methods
- Appendix protocols (if they contain actual methods)

**RED FLAGS - If you're not hitting these numbers, you're under-extracting:**
- Fewer than 15 protocol nodes in a dissertation = TOO FEW, extract more
- Fewer than 10 analysis nodes in a dissertation = TOO FEW, extract more
- Fewer than 20 result nodes in a dissertation = TOO FEW, extract more
- Total nodes < 40 for a dissertation = UNDER-EXTRACTION (aim for 40+)
- Total nodes < 30 for a complex document = UNDER-EXTRACTION

**SCALING WITH DOCUMENT SIZE:**
- Small experiment (10-30 pages): 5-15 nodes ✓
- Medium experiment (30-80 pages): 15-30 nodes ✓
- Large experiment (80-150 pages): 30-50 nodes ✓
- Dissertation/Thesis (150+ pages): 40-100+ nodes ✓

The number of nodes MUST scale with the amount of information in the document.

**EXAMPLE - What "extract everything" means:**

If the Methods section says:
"Statistical analysis was performed using ANOVA, followed by Tukey post-hoc tests. Normality was assessed with Shapiro-Wilk tests, and variance homogeneity with Levene's test."

You should create AT LEAST 4 analysis nodes:
1. "Normality Testing with Shapiro-Wilk"
2. "Variance Homogeneity Testing with Levene's Test"
3. "ANOVA Statistical Analysis"
4. "Tukey Post-Hoc Pairwise Comparisons"

NOT just 1 node called "Statistical Analysis" - that's under-extraction!
`;
        exampleAdjustment = `
EXAMPLE OUTPUT STRUCTURE (for comprehensive documents):
{
  "blocks": [
    {
      "blockName": "Protocol Block",
      "nodes": [
        // 15-25 protocol nodes (one per distinct method)
      ]
    },
    {
      "blockName": "Data Creation Block",
      "nodes": [
        // 15-25 data collection nodes
      ]
    },
    {
      "blockName": "Analysis Block",
      "nodes": [
        // 20-35 analysis nodes (one per technique/test)
      ]
    },
    {
      "blockName": "Results Block",
      "nodes": [
        // 20-40 result nodes (one per major finding/figure)
      ]
    }
  ]
}`;
        break;
    }
  } else {
    // Default guidance for backward compatibility
    extractionIntensityGuidance = `
Extract this document into an experiment tree structure and return it as structured JSON.
Be thorough and extract all experimental steps, methods, analyses, and results.
`;
        exampleAdjustment = `
EXAMPLE OUTPUT (with proper dependency format):
{
  "treeName": "Plant Growth Under Stress Conditions Study",
  "treeDescription": "Experimental workflow for studying plant responses to environmental stress",
  "blocks": [
    {
      "blockName": "Protocol Block",
      "blockType": "protocol",
      "position": 1,
      "nodes": [
        {
          "nodeId": "proto-001",
          "title": "Seed Preparation Protocol",
          "content": {
            "text": "Seeds were sterilized using 70% ethanol for 2 minutes, followed by 10% bleach solution for 10 minutes, then rinsed three times with sterile water."
          },
          "nodeType": "protocol",
          "status": "draft",
          "dependencies": [],
          "attachments": [],
          "parameters": {
            "ethanol_concentration": "70%",
            "sterilization_time": "2 minutes"
          }
        }
      ]
    },
    {
      "blockName": "Data Creation Block",
      "blockType": "data_creation",
      "position": 2,
      "nodes": [
        {
          "nodeId": "data-001",
          "title": "Growth Measurements",
          "content": {
            "text": "Plant height and leaf count were measured daily using the Seed Preparation Protocol. Measurements were taken at the same time each day under controlled conditions."
          },
          "nodeType": "data_creation",
          "status": "draft",
          "dependencies": [
            {
              "referencedNodeTitle": "Seed Preparation Protocol",
              "dependencyType": "requires",
              "extractedPhrase": "using the Seed Preparation Protocol",
              "confidence": 0.95
            }
          ],
          "attachments": [],
          "parameters": {
            "measurement_frequency": "daily",
            "metrics": ["height", "leaf_count"]
          }
        }
      ]
    },
    {
      "blockName": "Analysis Block",
      "blockType": "analysis",
      "position": 3,
      "nodes": [
        {
          "nodeId": "analysis-001",
          "title": "Statistical Analysis of Growth Data",
          "content": {
            "text": "Growth data collected from daily measurements were analyzed using ANOVA to determine significant differences between treatment groups. Post-hoc Tukey tests were performed for pairwise comparisons."
          },
          "nodeType": "analysis",
          "status": "draft",
          "dependencies": [
            {
              "referencedNodeTitle": "Growth Measurements",
              "dependencyType": "uses_output",
              "extractedPhrase": "Growth data collected from daily measurements",
              "confidence": 0.9
            }
          ],
          "attachments": [],
          "parameters": {
            "statistical_test": "ANOVA",
            "post_hoc": "Tukey"
          }
        }
      ]
    },
    {
      "blockName": "Results Block",
      "blockType": "results",
      "position": 4,
      "nodes": [
        {
          "nodeId": "results-001",
          "title": "Treatment Effects on Plant Growth",
          "content": {
            "text": "ANOVA revealed significant differences in plant height between treatment groups (F=12.4, p<0.001). Stress-treated plants showed 30% reduced growth compared to controls."
          },
          "nodeType": "results",
          "status": "draft",
          "dependencies": [
            {
              "referencedNodeTitle": "Statistical Analysis of Growth Data",
              "dependencyType": "uses_output",
              "extractedPhrase": "ANOVA revealed significant differences",
              "confidence": 0.95
            }
          ],
          "attachments": [],
          "parameters": {}
        }
      ]
    }
  ],
  "nestedTrees": []
}`;
  }

  const contentExclusionGuidance = `
## CONTENT TO EXCLUDE (DO NOT CREATE NODES FOR):

**Never create nodes for:**

1. **References/Bibliography sections** - These are metadata, not experimental steps
2. **Acknowledgments sections** - Not part of the workflow
3. **Author affiliations** - Metadata only
4. **Funding statements** - Not experimental content
5. **Conflicts of Interest** - Not experimental content
6. **Abstract/Introduction with no methods** - Only extract if it describes actual procedures
7. **Appendices with supplementary references only** - Unless they contain protocols

**How to identify reference sections:**

- Section titles: "References", "Bibliography", "Works Cited", "Literature Cited"
- Content is mostly citations: [1] Author et al. (2020)...
- No actionable experimental steps

**If you encounter references:**

- DO NOT create a node
- References will be captured separately in provenance
- Skip to the next section with actual content

**Example of what NOT to extract:**

❌ BAD:
{
  "title": "References",
  "content": { "text": "[1] Smith et al. (2020)..." },
  "nodeType": "protocol"
}

✅ GOOD: Skip this section entirely, move to next section with experimental content.

**What TO keep:**

✅ Methods sections that cite papers (we want the methods, citations are fine)
✅ Results sections that cite figures (need the results)
✅ Appendices with protocols or methods (even if some references)
✅ Methodology with inline citations (methods are valuable)

`;

  const structureGuidance = `
IMPORTANT NODE GRANULARITY RULES:

1. One node = one distinct method/procedure/analysis/result
2. If a section describes multiple experiments → create multiple nodes
3. If a protocol has sub-steps → create main node + nested tree reference
4. Each figure/table → usually indicates a separate result node
5. Methods section → often 5-10+ protocol nodes
6. Results section → often 10-20+ result nodes

## CONTENT LENGTH AND DETAIL:

**Node content can be LONG - this is GOOD:**
- Nodes can contain multiple paragraphs (2-5+ paragraphs is fine)
- Include ALL relevant details from the source document
- Preserve complete context, not just summaries
- Long, detailed content is better than short, incomplete content
- Each node should be self-contained and comprehensive

## CONTENT LENGTH REQUIREMENTS:

**Content length target:**
- AIM for 300-500+ characters (2-4 full paragraphs) when source content is available
- If source content is sparse, extract ALL available text plus surrounding context (minimum 150 characters)
- Extract surrounding context, not just the single sentence
- Include relevant details from the paragraph/section and adjacent paragraphs
- Preserve full context for understanding - extract maximum available, not minimum required

**Exception for short content:**
- Short content (1 sentence) is ONLY acceptable if:
  - The node has attachments (figures/tables/equations)
  - AND the attachment contains the detailed information
  - Even then, try to include 1-2 sentences of context

**Example of GOOD content extraction:**

❌ BAD (too short):
"Configuration of a sentiment analysis ensemble to process financial news and social media data."

✅ GOOD (with context):
"Configuration of a sentiment analysis ensemble to process financial news and social media data. The ensemble combines three models: a transformer-based classifier for news articles, a fine-tuned BERT model for social media posts, and a rule-based filter for financial terminology. Each model was trained on domain-specific datasets and outputs confidence scores that are weighted and combined using a voting mechanism. The configuration includes hyperparameters for each model (learning rate: 0.001, batch size: 32) and ensemble weights (transformer: 0.4, BERT: 0.4, rule-based: 0.2)."

**Content extraction strategy:**
1. Start with the key sentence/phrase
2. Extract the full paragraph(s) containing the key information, plus 1-2 adjacent paragraphs when available (if source is sparse, extract all available sentences)
3. Include relevant parameters, conditions, or details mentioned nearby
4. Preserve the exact wording from the source when possible
5. If the section is short, look for related content in adjacent paragraphs

**CRITICAL: DO NOT CONSOLIDATE DISTINCT ITEMS**

**Default action: SPLIT into separate nodes**
- Extract separate nodes for each distinct procedure/method/analysis/result
- Even if items are related or similar, extract them as separate nodes
- Each node should have detailed content, but still be a separate node
- The "ONE NODE PER X" rules (see below) override any "keep together" guidance

**When to split a long section into multiple nodes:**
- Split if the section describes DISTINCT procedures/methods/analyses
- Split if different experimental conditions are described
- Split if multiple statistical tests are performed
- Split if multiple results/findings are presented
- Split if multiple figures/tables are mentioned
- Split if multiple subsections exist
- When in doubt: SPLIT into separate nodes

**Exception - Keep together ONLY if:**
- It's ONE continuous procedure with multiple steps that CANNOT be meaningfully separated
- Steps are so tightly coupled that describing them separately loses all meaning
- It's a single result with detailed explanation (not multiple findings)
- The "ONE NODE PER X" rules do NOT apply (e.g., it's truly one inseparable process)

**Remember: The "ONE NODE PER X" rules take precedence over "keep together" guidance.**

**Example - SPLIT:**
Section: "We performed ANOVA, followed by Tukey post-hoc tests, and assessed normality with Shapiro-Wilk tests."
→ Create 3 separate nodes (ANOVA, Tukey, Normality Testing)

**Example - KEEP TOGETHER:**
Section: "The DNA extraction protocol involved: (1) cell lysis with buffer A, (2) protein precipitation with buffer B, (3) DNA precipitation with ethanol, (4) washing steps, (5) resuspension in TE buffer."
→ Create 1 comprehensive node: "DNA Extraction Protocol" with all steps

## OVERLAP AND DUPLICATION:

**Acceptable overlap (OK):**
- Contextual overlap: Nodes can reference the same background/methods
- Procedural overlap: Related nodes can mention shared steps
- Result overlap: Multiple nodes can reference the same figure/table
- ~10-20% content overlap between related nodes is acceptable

**Excessive overlap (NOT OK):**
- Duplicate nodes: Two nodes describing the exact same procedure
- Redundant nodes: One node is a subset of another
- Copy-paste content: Same text appearing in multiple nodes
- >30% identical content between nodes = likely duplicate

**How to avoid excessive overlap:**
- Each node should have a UNIQUE focus/purpose
- If two nodes seem similar, check: Are they actually different procedures?
- DO NOT merge distinct items into one node - extract separate nodes even if they're related
- Use dependencies to link related nodes rather than duplicating content
- It's better to have multiple detailed nodes with some overlap than to consolidate and lose information

${complexity && complexity.estimatedNodeCount > 20 ? `
EXAMPLE from a dissertation:
Methods section "Statistical Analysis" might contain:
- Node: "Normality Testing" (protocol)
- Node: "Variance Testing" (protocol)
- Node: "ANOVA Implementation" (analysis)
- Node: "Post-hoc Pairwise Comparisons" (analysis)
Do NOT combine these into one "Statistical Analysis" node.` : ''}

## STEP 1: COUNT BEFORE EXTRACTING (MANDATORY FIRST STEP)

Before you start extracting, COUNT these items in the document explicitly:

**Count these items and write down the numbers:**
1. Count ALL figures mentioned (Figure 1, Figure 2, etc.) → Write: "X figures found"
2. Count ALL tables mentioned (Table 1, Table 2, etc.) → Write: "X tables found"
3. Count ALL statistical tests mentioned (ANOVA, t-test, chi-square, etc.) → Write: "X tests found"
4. Count ALL subsections in Methods section → Write: "X subsections found"
5. Count ALL experimental conditions/treatments → Write: "X conditions found"
6. Count ALL distinct protocols/procedures → Write: "X protocols found"
7. Count ALL model/algorithm implementations → Write: "X models found"
8. Count ALL validation/verification steps → Write: "X validations found"

**Then extract nodes based on these counts:**
- At least 1 result node per figure (if 15 figures → at least 15 result nodes)
- At least 1 result node per table (if 8 tables → at least 8 result nodes)
- At least 1 analysis node per statistical test (if 5 tests → at least 5 analysis nodes)
- At least 1 protocol node per Methods subsection (if 8 subsections → at least 8 protocol nodes)
- At least 1 node per experimental condition (if 3 conditions → at least 3 nodes)
- At least 1 node per distinct protocol/procedure
- At least 1 node per model/algorithm
- At least 1 node per validation step

**If your final node count is significantly less than your item count, you're under-extracting.**
**Go back and extract the missing nodes.**

## ONE NODE PER X - MANDATORY RULES:

**ALWAYS create separate nodes for:**
- One node per figure (Figure 1 = Node 1, Figure 2 = Node 2, etc.)
- One node per table (Table 1 = Node 1, Table 2 = Node 2, etc.)
- One node per statistical test (ANOVA = Node 1, Tukey = Node 2, etc.)
- One node per experimental condition (Treatment A = Node 1, Treatment B = Node 2, etc.)
- One node per subsection in Methods (Subsection 1 = Node 1, Subsection 2 = Node 2, etc.)
- One node per distinct protocol/procedure mentioned
- One node per model/algorithm implementation
- One node per validation/verification step
- One node per preprocessing/transformation step
- One node per distinct result/finding

**Exception - Combine ONLY if:**
- Steps are part of ONE continuous procedure that cannot be separated
- Steps are tightly coupled and describing them separately loses meaning
- It's a single result with detailed explanation (not multiple findings)

**When in doubt: SPLIT into separate nodes.**
**It's better to have 2 nodes with some overlap than 1 node missing information.**

## SPECIFIC EXTRACTION EXAMPLES (FOLLOW THESE PATTERNS):

**Example 1: Statistical Tests**
Document says: "We performed ANOVA (F=12.4, p<0.001), followed by Tukey post-hoc tests, and assessed normality with Shapiro-Wilk tests (W=0.98, p=0.12)."

Extract 3 nodes:
1. "ANOVA Statistical Analysis" (F=12.4, p<0.001)
2. "Tukey Post-Hoc Pairwise Comparisons"
3. "Shapiro-Wilk Normality Testing" (W=0.98, p=0.12)

NOT 1 node: "Statistical Analysis"

**Example 2: Figures**
Document mentions: "Figure 1 shows treatment effects. Figure 2 shows control results. Figure 3 shows comparison."

Extract 3 nodes:
1. "Treatment Effects Results (Figure 1)"
2. "Control Results (Figure 2)"
3. "Treatment vs Control Comparison (Figure 3)"

NOT 1 node: "Results from Figures 1-3"

**Example 3: Methods Subsections**
Methods section has: "3.1 Sample Collection", "3.2 DNA Extraction", "3.3 PCR Amplification"

Extract 3 nodes:
1. "Sample Collection Protocol"
2. "DNA Extraction Protocol"
3. "PCR Amplification Protocol"

NOT 1 node: "Experimental Methods"

**Example 4: Experimental Conditions**
Document says: "Treatment A (n=20) showed X. Treatment B (n=18) showed Y. Control (n=15) showed Z."

Extract 3 nodes:
1. "Treatment A Results" (n=20, showed X)
2. "Treatment B Results" (n=18, showed Y)
3. "Control Results" (n=15, showed Z)

NOT 1 node: "Treatment Results"

**Example 5: Tables**
Document mentions: "Table 1 summarizes demographics. Table 2 shows baseline characteristics. Table 3 presents outcomes."

Extract 3 nodes:
1. "Demographics Summary (Table 1)"
2. "Baseline Characteristics (Table 2)"
3. "Outcome Results (Table 3)"

NOT 1 node: "Summary Tables"

**Follow these patterns for similar content in the document.**

## DEPENDENCY FORMAT (CRITICAL):

For EVERY node, you must extract dependencies as OBJECTS, not strings.

**Dependency Object Structure:**
{
  "referencedNodeTitle": "Exact title of the referenced node",
  "dependencyType": "requires" | "uses_output" | "follows" | "validates",
  "extractedPhrase": "The exact text from the document showing this dependency",
  "confidence": 0.7-1.0
}

**Dependency Types:**
- "requires": Node A requires Node B to be completed first (prerequisite)
- "uses_output": Node A uses the output/results from Node B
- "follows": Node A follows Node B sequentially (temporal relationship)
- "validates": Node A validates or verifies Node B's results

**How to Extract Dependencies:**
1. Read each node's content carefully
2. Look for phrases indicating relationships:
   - "using data from X" → uses_output
   - "based on X" → uses_output
   - "after X was completed" → follows
   - "requires X" → requires
   - "validates X" → validates
3. Record the EXACT phrase showing the dependency
4. Create a dependency object with all fields

**Example Dependency Extraction:**
If node content says: "The statistical analysis was performed using data from the Sample Collection protocol"
Extract:
{
  "referencedNodeTitle": "Sample Collection",
  "dependencyType": "uses_output",
  "extractedPhrase": "using data from the Sample Collection protocol",
  "confidence": 0.9
}

NEVER use string arrays like ["Node 1", "Node 2"] - always use objects!`;

  const nestedTreeGuidance = `
## NESTED TREES (Use Sparingly - Only for Reusable Sub-Workflows)

**What is a nested tree?**

A nested tree is a **reusable, self-contained sub-workflow** that:
1. **Could be used in other experiments** (reusability test)
2. **Has its own complete workflow** (protocol → [data] → [analysis] → [results])
3. **Makes sense to view/edit independently** (logical isolation)

**When to mark as nested tree:**

✅ **GOOD nested tree examples:**
- "DNA Extraction Protocol" with 5+ steps → reusable, complete procedure
- "Western Blot Procedure" with protocol → controls → analysis → validation (4+ nodes)
- "Sample Preparation and Sterilization" → standard protocol used in many experiments
- "PCR Amplification Workflow" → complete sub-workflow with multiple steps

❌ **BAD nested tree examples (should stay in main tree):**
- "Kalman Filter Implementation" (1 node) → single step, not a workflow
- "State-Space Framework Setup" (1 node) → configuration step, not reusable
- "Statistical Analysis" (1 node: ANOVA) → single analysis, not a workflow
- "Feature Selection" → part of main experiment, not reusable

**Key rules:**

1. **Single-node protocols:** ❌ Never nested trees
   - Even if content has numbered steps
   - Numbered steps within one node = well-structured node, not a nested tree
   - Needs multiple related nodes to be a nested tree

2. **Multi-node protocols (3+ nodes):** ✅ Potentially nested if:
   - Has its own data collection/analysis/results nodes
   - Could be extracted to a separate experiment
   - Title suggests reusability ("Standard X Protocol", "X Procedure")

3. **Decision criteria:**
   - Is it reusable in other contexts? → Yes = nested tree candidate
   - Is it experiment-specific? → No = keep in main tree
   - Does it have a complete workflow? → Yes = nested tree candidate

**How to mark nested trees:**

If a protocol meets ALL criteria above, add:

{
  "isNestedTree": true,
  "metadata": {
    "nestedTreeReason": "Reusable multi-step DNA extraction protocol with validation"
  }
}

**Default:** DO NOT mark as nested tree unless you're very confident it meets criteria.
Most protocols should stay in the main tree.

**Remember:** Nested trees can be 1-3 nodes OR 10+ nodes - it depends on what makes logical sense for presenting the information. The key is reusability and logical isolation, not node count.

`;

  // Calculate extraction intensity multiplier for comprehensive documents
  const extractionIntensityMultiplier = complexity && complexity.estimatedNodeCount > 50 ? 1.5 : 1.0;
  const adjustedTarget = complexity ? Math.floor(complexity.estimatedNodeCount * extractionIntensityMultiplier) : undefined;

  const extractionChecklist = `
## MANDATORY EXTRACTION CHECKLIST (VERIFY BEFORE FINALIZING):

Before completing extraction, verify you have extracted:

**For Methods/Protocols:**
- [ ] Every distinct experimental procedure mentioned
- [ ] Every protocol variation or modification
- [ ] Every validation or quality control step
- [ ] Every sample preparation method
- [ ] Every measurement technique
- [ ] Every calibration procedure
- [ ] Every control experiment setup
- [ ] Every method subsection (if Methods has 8 subsections, extract ~8 protocol nodes)

**For Data Collection:**
- [ ] Every data collection method
- [ ] Every data source mentioned
- [ ] Every measurement type
- [ ] Every data preprocessing step
- [ ] Every data transformation procedure
- [ ] Every data cleaning step

**For Analysis:**
- [ ] Every statistical test mentioned (ANOVA, t-test, chi-square, etc.)
- [ ] Every analysis technique
- [ ] Every model implementation
- [ ] Every validation analysis
- [ ] Every sensitivity analysis
- [ ] Every error analysis
- [ ] Every post-hoc test (Tukey, Bonferroni, etc.)

**For Results:**
- [ ] Every figure mentioned (Figure 1, Figure 2, etc.)
- [ ] Every table mentioned (Table 1, Table 2, etc.)
- [ ] Every major finding
- [ ] Every supporting result
- [ ] Every negative result
- [ ] Every preliminary result
- [ ] Every comparison result

**Verification Questions (Answer honestly):**
1. If the document mentions "ANOVA and Tukey tests" - did you create 2 nodes or 1?
   → Should be 2 nodes (one for ANOVA, one for Tukey)
2. If the document has 15 figures - did you create ~15 result nodes?
   → Should be close to 15 (at minimum 8-10)
3. If Methods section has 8 subsections - did you create ~8 protocol nodes?
   → Should be close to 8 (at minimum 4-5)
4. If Results section mentions 20 findings - did you extract all 20?
   → Should be all 20 (or at least 15+)
5. If Analysis section mentions 5 different tests - did you create 5 analysis nodes?
   → Should be 5 nodes (one per test)

**Target Node Count:**
${adjustedTarget ? `This document should yield approximately ${adjustedTarget} nodes (target: ${complexity.estimatedNodeCount}, but aim for ${adjustedTarget} to ensure nothing is missed).` : complexity ? `This document should yield approximately ${complexity.estimatedNodeCount} nodes.` : 'Extract comprehensively based on document content.'}

**If you answered "no" or "less than target" to any verification question, you are UNDER-EXTRACTING.**
**Go back and extract the missing information as separate nodes.**
**It is BETTER to have too many nodes than to miss important information.**

**Final Check:**
- Count your total nodes: ${adjustedTarget ? `Are you close to ${adjustedTarget}?` : complexity ? `Are you close to ${complexity.estimatedNodeCount}?` : 'Is this comprehensive?'}
- If significantly below target, review the document again and extract more nodes
- Remember: Each distinct method/test/finding should be its own node

## STEP 2: SECOND PASS REVIEW (MANDATORY)

After your initial extraction, perform a SECOND PASS review:

**Review each section systematically and ask:**

**For Methods Section:**
- [ ] Did I extract a node for EVERY subsection? (Check: 3.1, 3.2, 3.3...)
- [ ] Did I extract a node for EVERY procedure variation?
- [ ] Did I extract a node for EVERY validation step?
- [ ] Did I extract a node for EVERY quality control measure?
- [ ] If Methods has 8 subsections → did I extract at least 8 protocol nodes?

**For Results Section:**
- [ ] Did I extract a node for EVERY figure mentioned? (Check: Figure 1, 2, 3...)
- [ ] Did I extract a node for EVERY table mentioned? (Check: Table 1, 2, 3...)
- [ ] Did I extract a node for EVERY major finding?
- [ ] Did I extract a node for EVERY comparison result?
- [ ] If Results mentions 20 figures → did I extract at least 20 result nodes?

**For Analysis Section:**
- [ ] Did I extract a node for EVERY statistical test? (Check: ANOVA, t-test, etc.)
- [ ] Did I extract a node for EVERY model implementation?
- [ ] Did I extract a node for EVERY validation analysis?
- [ ] If Analysis mentions 8 tests → did I extract at least 8 analysis nodes?

**For Data Section:**
- [ ] Did I extract a node for EVERY data collection method?
- [ ] Did I extract a node for EVERY preprocessing step?
- [ ] Did I extract a node for EVERY transformation procedure?
- [ ] If Data section has 5 subsections → did I extract at least 5 data nodes?

**Cross-check with your counts from Step 1:**
- Compare your node count to your item count from Step 1
- If node count < item count, you're missing nodes
- Go back and extract nodes for any missing items

**If you find ANY item mentioned but not extracted:**
- Create a node for it immediately
- Even if it seems "minor" or "similar" to another node
- Better to have two similar nodes than to miss information

**Final verification:**
- Review the entire document one more time
- Check that every figure, table, test, method, and finding has a corresponding node
- If anything is missing, extract it now

`;

  // Extract key terms from document title and first sections for context
  const documentTitle = structuredDoc.fileName || 'Untitled Document';
  const firstSectionText = structuredDoc.sections[0]?.content
    ?.map(c => c.type === 'text' ? c.content : '')
    .join(' ')
    .substring(0, 1000) || '';
  
  const keyTermsGuidance = `
**DOCUMENT CONTEXT FOR BLOCK NAMING:**

Document Title: "${documentTitle}"
Document Length: ~${structuredDoc.sections.length} sections

First Section Preview: "${firstSectionText.substring(0, 500)}..."

**BLOCK ORGANIZATION INSTRUCTIONS:**

1. IDENTIFY MAJOR PHASES
   - Read the document title and abstract/introduction to understand the overall workflow
   - Look for workflow diagrams (Figures showing experimental pipeline or methodology flow)
   - Identify 4-7 major conceptual phases (unless document clearly requires more)

2. EXTRACT KEY TERMINOLOGY
   - Method names: "${documentTitle}" likely involves specific methods - use them in block names
   - Data types: What kind of data is being processed? Use specific terms
   - Analysis techniques: What analytical approaches are described?
   - Phases: What are the main stages described in the document?

3. CONSOLIDATE RELATED PHASES
   - If you identify "Data Collection" and "Data Preprocessing", merge into "Data Collection & Preprocessing"
   - If you identify multiple setup/configuration steps, merge into one "Configuration" block
   - If you identify multiple evaluation steps, merge into one "Evaluation" block

4. NAME BLOCKS DESCRIPTIVELY
   - Use terminology from THIS document (especially from the title and key sections)
   - Be specific about what phase accomplishes (not just generic "Analysis")
   - Format: "[Specific Activity] & [Related Activity]" or "[Domain-Specific Phase Name]"

5. CHECK FOR REDUNDANCY
   - Before finalizing blocks, scan your proposed names
   - If two blocks sound similar or cover the same phase, merge them
   - Target: 4-6 blocks for most documents (fewer = better if phases are truly combined)

For this document about "${documentTitle}":
- Expected major phases based on title and content preview:
  (The LLM should infer these from the document, but guide it to think about 4-6 major stages)
- Use domain-specific terminology when naming blocks
- Consolidate related procedures into coherent phases

`;

  // For comprehensive documents, restructure prompt with critical rules at top
  const isComprehensive = complexity?.extractionStrategy === 'comprehensive';
  
  // Generate domain-specific examples based on detected domain
  let domainExamples = '';
  if (domain === 'finance') {
    domainExamples = `
===========================================
💰 YOU ARE ANALYZING A FINANCE DOCUMENT
===========================================

Use these naming patterns:

✅ GOOD Block Names for Finance:
   - "Financial Data Preparation & Feature Engineering"
   - "Kalman Filter Model Development & Implementation"  
   - "Portfolio Optimization Methodology"
   - "Trading Strategy Backtesting & Validation"
   - "Performance Evaluation & Risk Analysis"
   - "Sentiment Analysis Ensemble Configuration"
   - "Bond Yield Prediction & State Space Modeling"

❌ BAD Block Names to AVOID:
   - "Data Block"
   - "Model Implementation Analysis State Space" (nonsense - too wordy)
   - "Analysis Techniques" (too generic)
   - "Methodology Block" (too generic)
   - "Financial Analysis" (too vague)

CRITICAL: For finance papers, use specific method names (Kalman Filter, ARIMA, etc.) in block names.
`;
  } else if (domain === 'biology') {
    domainExamples = `
===========================================
🧬 YOU ARE ANALYZING A BIOLOGY DOCUMENT
===========================================

Use these naming patterns:

✅ GOOD Block Names for Biology:
   - "RNA Extraction & Purification Protocol"
   - "Cell Culture Preparation & Quality Control"
   - "Sequencing Data Generation & Quality Assessment"
   - "Western Blot Analysis & Protein Detection"
   - "PCR Amplification & Gel Electrophoresis"
   - "Bioinformatics Analysis Pipeline & Statistical Validation"
   - "Differential Expression Analysis & Gene Ontology"

❌ BAD Block Names to AVOID:
   - "Protocol Block"
   - "Data Collection Block" (too generic)
   - "Analysis Block" (too generic)
   - "Results Block" (too generic)
   - "Experimental Methods" (too vague)

CRITICAL: For biology papers, use specific technique names (PCR, Western Blot, RNA-seq, etc.) in block names.
`;
  } else if (domain === 'ml-ai') {
    domainExamples = `
===========================================
🤖 YOU ARE ANALYZING A MACHINE LEARNING/AI DOCUMENT
===========================================

Use these naming patterns:

✅ GOOD Block Names for ML/AI:
   - "Dataset Curation & Preprocessing"
   - "Neural Network Architecture Design & Configuration"
   - "Training & Hyperparameter Optimization"
   - "Benchmark Evaluation & Ablation Studies"
   - "Feature Engineering & Selection Pipeline"
   - "Model Training & Validation Protocol"
   - "Transfer Learning & Fine-Tuning"

❌ BAD Block Names to AVOID:
   - "Data Block"
   - "Model Block" (too generic)
   - "Training Block" (too generic)
   - "Analysis Block" (too generic)
   - "Machine Learning Methods" (too vague)

CRITICAL: For ML/AI papers, use specific architecture names (CNN, Transformer, BERT, etc.) or technique names in block names.
`;
  } else if (domain === 'engineering') {
    domainExamples = `
===========================================
⚙️ YOU ARE ANALYZING AN ENGINEERING DOCUMENT
===========================================

Use these naming patterns:

✅ GOOD Block Names for Engineering:
   - "Signal Processing & Filter Design"
   - "Control System Implementation & Tuning"
   - "Circuit Design & Simulation"
   - "Robotic System Configuration & Calibration"
   - "Sensor Data Acquisition & Preprocessing"
   - "Performance Testing & Validation"

❌ BAD Block Names to AVOID:
   - "Design Block" (too generic)
   - "Implementation Block" (too generic)
   - "Testing Block" (too generic)
   - "Engineering Methods" (too vague)

CRITICAL: For engineering papers, use specific system/component names or technique names in block names.
`;
  } else if (domain === 'chemistry') {
    domainExamples = `
===========================================
⚗️ YOU ARE ANALYZING A CHEMISTRY DOCUMENT
===========================================

Use these naming patterns:

✅ GOOD Block Names for Chemistry:
   - "Compound Synthesis & Purification Protocol"
   - "Reaction Optimization & Yield Analysis"
   - "Chromatography Separation & Analysis"
   - "Spectroscopy Characterization & Validation"
   - "Sample Preparation & Quality Control"
   - "Catalyst Development & Testing"

❌ BAD Block Names to AVOID:
   - "Synthesis Block" (too generic)
   - "Analysis Block" (too generic)
   - "Characterization Block" (too generic)
   - "Chemical Methods" (too vague)

CRITICAL: For chemistry papers, use specific technique names (NMR, HPLC, GC-MS, etc.) in block names.
`;
  }
  
  // Critical extraction rules (only for comprehensive documents)
  const criticalExtractionRules = isComprehensive ? `
===========================================
🎯 CRITICAL EXTRACTION RULES - READ FIRST
===========================================

${domainExamples}

BLOCK NAMING RULES (MANDATORY):
❌ NEVER use generic names: "Data Block", "Methodology Block", "Analysis Block", "Model Implementation"
✅ ALWAYS use domain-specific names based on the document's actual content and terminology

BLOCK CONSOLIDATION RULES (MANDATORY):
- If document has METHODOLOGY section → Create ONE "Methodology & Implementation" block with ALL methodology nodes
- If document has RESULTS section → Create ONE "Results & Evaluation" block with ALL results nodes
- NEVER create separate blocks for: "Performance Analysis" + "Results" + "Evaluation" → These are ONE block
- NEVER create separate blocks for: "Data Collection" + "Data Preprocessing" + "Feature Engineering" → These are ONE block

ONE NODE PER ITEM RULES (MANDATORY):
For academic papers/dissertations, extract nodes for EVERY:
- Statistical test mentioned (PCA, RFE, t-test, ANOVA, etc.)
- Figure or table
- Methods subsection (if Methods has subsections → each subsection = 1 node)
- Distinct experimental procedure

SECTION MAPPING RULES (MANDATORY):
If you see these section titles in the document, follow this mapping:

METHODOLOGY/METHODS section:
  → Block: "[Domain-Specific] Methodology & Implementation"
  → Extract nodes for: Each methods subsection, each statistical method, each tool/library used

RESULTS section:
  → Block: "Performance Evaluation & Results Analysis" 
  → Extract nodes for: Each results subsection, each comparison, each metric

DISCUSSION section:
  → Merge into Results block OR create separate "Discussion & Implications" block only if >5 discussion nodes

DATA/FEATURE ENGINEERING section:
  → Block: "Data Preparation & Feature Engineering"
  → Extract nodes for: Data collection, preprocessing, feature selection, validation

===========================================
` : '';

  // Section-specific mapping instructions based on detected sections
  const sectionMappingInstructions = [];
  
  if (detectedSections.hasMethodology) {
    // Use detected domain for better block naming
    const domainHint = domain === 'finance' ? 'Financial' :
                       domain === 'biology' ? 'Biological' :
                       domain === 'ml-ai' ? 'Machine Learning' :
                       domain === 'engineering' ? 'Engineering' :
                       domain === 'chemistry' ? 'Chemical' : '';
    
    sectionMappingInstructions.push(`
===========================================
📋 DETECTED: This document has a "${detectedSections.methodsSectionTitle || 'Methodology'}" section
===========================================

MANDATORY MAPPING FOR METHODOLOGY SECTION:

- Create ONE block named "${domainHint ? domainHint + ' ' : ''}Methodology & Implementation" 
  (Use domain-specific terminology from the document title if available)

- Extract ALL content from the Methodology section into this block

- Each methods subsection → separate node

- Each statistical method (PCA, RFE, ANOVA, t-test, etc.) → separate node

- Each tool/library mentioned → separate node (if substantial description)

- Feature selection methods (PCA, RFE, correlation analysis) → belong in Methodology block, NOT in Data block

- Data preprocessing steps mentioned in Methodology → can go in Methodology block OR Data block (use Methodology if it's part of the method description)

Example for Finance paper:
  Block: "Financial Forecasting Methodology & Implementation"
    Node 1: "Feature Selection Analysis" (covers correlation, PCA, RFE)
    Node 2: "Data Normalization & Preprocessing"
    Node 3: "Kalman Filter Implementation"
    Node 4: "Model Training Protocol"

Example for Biology paper:
  Block: "Experimental Methodology & Protocol"
    Node 1: "Sample Preparation Protocol"
    Node 2: "RNA Extraction Procedure"
    Node 3: "PCR Amplification Method"
    Node 4: "Statistical Analysis Methods"

CRITICAL: If you see "Principal Component Analysis" or "PCA" in the Methodology section,
it should go in the Methodology block, NOT in a separate "Data Preparation" block.

`);
  }
  
  if (detectedSections.hasResults) {
    sectionMappingInstructions.push(`
===========================================
📋 DETECTED: This document has a "${detectedSections.resultsSectionTitle || 'Results'}" section
===========================================

MANDATORY MAPPING FOR RESULTS SECTION:

- Create ONE block named "Performance Evaluation & Results Analysis"

- Extract ALL results, evaluation, comparison content into this block

- Do NOT create separate "Analysis" or "Validation" or "Performance" blocks

- Each results subsection → separate node

- Each comparison → separate node

- Each metric/evaluation → separate node

- Each figure/table mentioned in Results → separate node

CRITICAL: All results, evaluations, comparisons, and performance metrics should be in ONE block.
Do NOT split into "Results", "Analysis", "Evaluation", "Performance" - these are all part of the same phase.

`);
  }
  
  if (detectedSections.hasDataSection) {
    sectionMappingInstructions.push(`
===========================================
📋 DETECTED: This document has a Data/Feature Engineering section
===========================================

MANDATORY MAPPING FOR DATA SECTION:

- Create ONE block named "Data Preparation & Feature Engineering"

- Extract ALL data collection, preprocessing, feature engineering content into this block

- Each data collection method → separate node

- Each preprocessing step → separate node

- Each feature engineering technique → separate node

- Each data validation step → separate node

CRITICAL: Feature selection methods (PCA, RFE) mentioned in Methodology section should go in Methodology block.
Only data-specific preprocessing and feature engineering from dedicated Data sections should go here.

`);
  }
  
  if (detectedSections.hasDiscussion) {
    sectionMappingInstructions.push(`
===========================================
📋 DETECTED: This document has a Discussion section
===========================================

MANDATORY MAPPING FOR DISCUSSION SECTION:

- If Discussion has >5 substantial discussion points → Create separate "Discussion & Implications" block

- If Discussion has ≤5 points → Merge into "Performance Evaluation & Results Analysis" block

- Each major discussion point → separate node

- Each implication mentioned → separate node

`);
  }
  
  const sectionMappingGuidance = sectionMappingInstructions.length > 0 
    ? sectionMappingInstructions.join('\n') 
    : '';

  // Block naming guidelines (moved after critical rules for comprehensive)
  const blockNamingGuidelines = `
**Block Naming Guidelines:**

${domain !== 'general' ? domainExamples : ''}

- Analyze the document to identify 3-7 major thematic phases

- Create descriptive block names that reflect actual content, not generic categories

- **CRITICAL: Block names MUST be specific and domain-relevant. Use terminology from the source document.**

**BAD examples (too generic - DO NOT USE THESE):**
- "Data Block"
- "Methodology Block"  
- "Analysis Block"
- "Results Block"
- "Protocol Block"
- "Data Creation Block"

**GOOD examples (specific and descriptive - USE THESE AS TEMPLATES):**
- "Financial Data Preparation & Feature Engineering"
- "Kalman Filter Model Implementation"
- "Performance Evaluation & Comparison"
- "Model Performance & ROI Analysis"
- "Cell Culture Preparation & Quality Control"
- "RNA Extraction & Purification Protocol"
- "Sequencing Data Generation & Quality Assessment"
- "Bioinformatics Analysis Pipeline & Statistical Validation"

**Domain-Specific Examples:**

* **Biology/Wet Lab:**
  - "Cell Culture Preparation Protocol"
  - "RNA Extraction & Purification"
  - "Sequencing Data Generation"
  - "Differential Expression Analysis & Statistical Validation"

* **Machine Learning/AI:**
  - "Dataset Curation & Preprocessing"
  - "Model Architecture Design & Configuration"
  - "Training & Hyperparameter Optimization"
  - "Benchmark Evaluation & Ablation Studies"

* **Finance/Economics:**
  - "Financial Data Preparation & Feature Engineering"
  - "Kalman Filter Implementation & State Space Modeling"
  - "Performance Backtesting & Risk Analysis"
  - "ROI Analysis & Portfolio Optimization"

**Block Naming Strategy:**

1. **Read the document title and abstract first** - Identify the main topic, methods, and domain terminology

2. **Extract key terms** from the document:
   - Method names (e.g., "Kalman Filter", "ANOVA", "PCR")
   - Data types (e.g., "Bond Yield", "RNA-seq", "Financial Time Series")
   - Analysis types (e.g., "Sentiment Analysis", "Differential Expression", "Performance Evaluation")
   - Outcome metrics (e.g., "ROI", "Accuracy", "Gene Expression Levels")

3. **Incorporate these terms into block names:**
   - For data sections: "[Specific Data Type] Collection & Preprocessing"
   - For method sections: "[Specific Method Name] Implementation"
   - For analysis sections: "[Specific Analysis Type] & Comparison"
   - For results sections: "[Specific Outcome Metric] Performance Analysis"

4. **Use domain terminology** - If the document mentions "Kalman Filter", use that in the block name. If it mentions "Bond Yield Prediction", use that terminology.

**Block Organization:**

- Group related nodes into coherent phases

- Each block should represent a distinct stage of the workflow

- Blocks should flow logically from preparation → execution → evaluation

- Block names should immediately convey what that phase accomplishes

**Block Consolidation Guidelines:**

CRITICAL: Avoid creating multiple blocks for the same conceptual phase.

Common consolidation patterns:
- "Data Collection", "Data Preprocessing", "Data Cleaning" 
  → ONE block: "Data Collection & Preprocessing"
  
- "Sentiment Analysis Setup", "Sentiment Analysis Configuration", "Sentiment Analysis Integration"
  → ONE block: "Sentiment Analysis Ensemble Configuration"
  
- "Model Training", "Model Optimization", "Hyperparameter Tuning"
  → ONE block: "Model Training & Optimization"
  
- "Performance Evaluation", "Results Analysis", "Performance Metrics"
  → ONE block: "Performance Evaluation & Analysis"

Rule: If two potential blocks describe sequential steps in the SAME phase, 
merge them with descriptive naming (e.g., "Feature Selection & Engineering" 
instead of separate "Feature Selection" and "Feature Engineering" blocks).

**Block Count Targets (adapt to document complexity):**

Document size guidance:
- Short paper (10-30 pages): Aim for 3-5 blocks
- Standard paper (30-80 pages): Aim for 4-7 blocks
- Long paper/thesis (80-150 pages): Aim for 5-9 blocks
- Dissertation (150+ pages): Aim for 6-12 blocks

Default target: 4-6 major blocks for most documents.

Only create MORE blocks when:
1. The document explicitly describes distinct, non-overlapping phases
2. Phases occur at different times (not parallel sub-tasks)
3. Each phase has substantial unique methodology (not just parameter variations)

Only create FEWER blocks when:
1. Document is very focused on a single methodology
2. Phases are tightly integrated and inseparable

**Workflow Diagram Integration:**

If the document contains a workflow diagram (commonly in figures like "Figure 2: 
Methodology Workflow" or "Experimental Pipeline"):
1. Identify the main phases shown in the diagram
2. Use the diagram's structure as the primary guide for block organization
3. Block names should reflect the phase names or descriptions in the diagram
4. Respect the sequential order shown in the diagram

Look for text references like:
- "As shown in Figure X, our workflow consists of..."
- "The experimental pipeline (Figure X) includes..."
- "Following the methodology in Figure X..."

**Block Size Guidelines:**

- Each block should contain at least 2 nodes
- If a phase has only 1 node, reconsider if it should be:
  a) Merged into a related block
  b) Expanded with more detail from the document
  c) Actually a nested tree procedure (not a standalone block)
  
- Blocks can naturally vary in size (2-10 nodes)
- Imbalance is acceptable if it reflects document structure
- Don't force artificial balance by splitting logical phases

**Block Sequencing:**

Blocks should follow the natural flow described in the document.

Typical sequence (adapt to actual document):
1. Data acquisition/preparation phase
2. Methodology development/implementation phase
3. Experimental execution/analysis phase
4. Results evaluation/interpretation phase

However, ALWAYS adapt to the document's actual structure. Some documents:
- Interleave methodology and results
- Present multiple parallel workflows
- Describe iterative refinement cycles

Follow the document, don't force a template.
`;

  // "BEFORE YOU START EXTRACTING" checklist (only for comprehensive)
  const beforeExtractingChecklist = isComprehensive ? `
===========================================
📋 BEFORE YOU START EXTRACTING
===========================================

Step 1: Read the document and identify major sections

Step 2: Count items to extract:
   - How many figures/tables?
   - How many statistical tests?
   - How many methods subsections?
   - How many results subsections?

Step 3: Plan your blocks (aim for 4-7 blocks total):
   - What is the main methodology? → 1 block
   - What is the main data work? → 1 block  
   - What are the main results? → 1 block
   - Are there other major phases? → 1-2 additional blocks

Step 4: Create domain-specific block names BEFORE extracting nodes

Step 5: Extract nodes according to "ONE NODE PER ITEM" rules

===========================================
` : '';

  // Restructure prompt assembly for comprehensive documents
  if (isComprehensive) {
    return `
PROJECT CONTEXT:
${projectContext ?
    `Project: ${projectContext.name || 'Unnamed Project'}${projectContext.description ? `\nDescription: ${projectContext.description}` : ''}`
    : 'No additional context provided'}

${keyTermsGuidance}

${criticalExtractionRules}

${sectionMappingGuidance}

${blockNamingGuidelines}

${exampleAdjustment}

${beforeExtractingChecklist}

SOURCE DOCUMENT:
File: ${structuredDoc.fileName}
Type: ${structuredDoc.type}
${structuredDoc.metadata ? `Metadata: ${JSON.stringify(structuredDoc.metadata, null, 2)}` : ''}

DOCUMENT CONTENT WITH PRESERVED STRUCTURE:

${formattedDocument}

TASK:

${baseInstructions}
${extractionIntensityGuidance}
${contentExclusionGuidance}
${structureGuidance}
${extractionChecklist}
${nestedTreeGuidance}

CRITICAL - REQUIRED JSON STRUCTURE:

You MUST return a JSON object with these exact top-level fields:

{
  "treeName": "string - The experiment or study title from the document",
  "treeDescription": "string - One sentence describing what this experiment does",
  "blocks": [
    {
      "blockName": "string - Descriptive name reflecting the phase's purpose (e.g., 'Financial Data Preparation & Feature Engineering', 'RNA Extraction & Purification', 'Model Architecture Design')",
      "blockType": "string - General category: 'methodology', 'data', 'analysis', 'results', or 'tools'",
      "blockDescription": "string (optional) - Brief explanation of what this phase accomplishes",
      "position": number - Order in workflow (1, 2, 3...),
      "nodes": [
        {
          "nodeId": "string - Unique ID like 'node-1', 'node-2'",
          "title": "string - Short title for this step",
          "content": {
            "text": "string - The exact relevant text from the source document"
          },
          "nodeType": "string - Category matching blockType",
          "status": "draft" | "complete" - Inferred from source language,
          "parameters": {} - Extracted parameters from content (optional),
          "dependencies": [
            {
              "referencedNodeTitle": "string - Exact title of referenced node",
              "dependencyType": "requires" | "uses_output" | "follows" | "validates",
              "extractedPhrase": "string - Exact phrase showing dependency",
              "confidence": number - 0.7-1.0 (optional)
            }
          ],
          "attachments": [] - References to figures/tables (optional),
          "metadata": {} - Additional metadata (optional),
          "isNestedTree": boolean - Mark if reusable sub-workflow (optional)
        }
      ]
    }
  ],
  "nestedTrees": [] - References to nested workflows (optional)
}

Return only the JSON object, no explanations or markdown code blocks.`;
  }

  // Standard prompt structure for simple/moderate/complex documents
  return `
PROJECT CONTEXT:
${projectContext ?
    `Project: ${projectContext.name || 'Unnamed Project'}${projectContext.description ? `\nDescription: ${projectContext.description}` : ''}`
    : 'No additional context provided'}

${keyTermsGuidance}

${sectionMappingGuidance}

SOURCE DOCUMENT:
File: ${structuredDoc.fileName}
Type: ${structuredDoc.type}
${structuredDoc.metadata ? `Metadata: ${JSON.stringify(structuredDoc.metadata, null, 2)}` : ''}

DOCUMENT CONTENT WITH PRESERVED STRUCTURE:

${formattedDocument}

TASK:

${baseInstructions}
${extractionIntensityGuidance}
${contentExclusionGuidance}
${structureGuidance}
${extractionChecklist}
${nestedTreeGuidance}
${exampleAdjustment}

CRITICAL - REQUIRED JSON STRUCTURE:

You MUST return a JSON object with these exact top-level fields:

{
  "treeName": "string - The experiment or study title from the document",
  "treeDescription": "string - One sentence describing what this experiment does",
  "blocks": [
    {
      "blockName": "string - Descriptive name reflecting the phase's purpose (e.g., 'Financial Data Preparation & Feature Engineering', 'RNA Extraction & Purification', 'Model Architecture Design')",
      "blockType": "string - General category: 'methodology', 'data', 'analysis', 'results', or 'tools'",
      "blockDescription": "string (optional) - Brief explanation of what this phase accomplishes",
      "position": number - Order in workflow (1, 2, 3...),
      "nodes": [
        {
          "nodeId": "string - Unique ID like 'node-1', 'node-2'",
          "title": "string - Short title for this step",
          "content": {
            "text": "string - The exact relevant text from the source document"
          },
          "nodeType": "string - Category matching blockType",
          "status": "complete" or "draft",
          "dependencies": [],
          "attachments": [],
          "parameters": {}
        }
      ]
    }
  ],
  "nestedTrees": []
}

EXTRACTION GUIDELINES:

1. **treeName**: Extract from document title, abstract, or first heading
2. **treeDescription**: Write ONE sentence summarizing the experiment
3. **blocks**: Group related steps into workflow phases with SPECIFIC, DOMAIN-RELEVANT names
   - DO NOT use generic names like "Data Block" or "Methodology Block"
   - DO use specific names like "Financial Data Preparation & Feature Engineering" or "Kalman Filter Model Implementation"
   - Extract key terms from the document (method names, data types, analysis techniques) and use them in block names
   - Read the document title and abstract first to understand the domain, then use that terminology
4. **nodes**: Each step/procedure/analysis should be a separate node
5. **Extract content**: Use exact text from the document, don't paraphrase
6. **dependencies**: Link nodes that must happen in sequence (use empty array if none)

## CRITICAL REMINDERS:

1. **Dependencies MUST be objects**, not strings
2. **Every node** should have dependencies (except root protocols)
3. **Extract the exact phrase** that shows the dependency
4. **Use appropriate dependency types** (requires/uses_output/follows/validates)
5. **Be comprehensive** - don't skip dependencies just because they're obvious

Common dependency patterns:
- "using X" → uses_output dependency on X
- "after X" → follows dependency on X
- "based on X" → uses_output dependency on X
- "requires X" → requires dependency on X
- Analysis nodes → always depend on data creation nodes
- Result nodes → always depend on analysis nodes

IMPORTANT:
- Your response must be valid JSON
- You MUST include treeName, treeDescription, and blocks at the top level
- Do NOT return an array - return an object with these fields
- If you cannot find clear workflow steps, still return the structure with empty blocks array
- **Dependencies must be objects with all required fields: referencedNodeTitle, dependencyType, extractedPhrase, and optionally confidence**

## EXTRACTION QUALITY SELF-CHECK

Before returning your JSON response, verify:

1. **Node count matches document size:**
   - Simple document (10-30 pages) → 5-15 nodes ✓
   - Moderate document (30-80 pages) → 15-30 nodes ✓
   - Complex document (80-150 pages) → 30-50 nodes ✓
   - Comprehensive document (150+ pages) → 40-100+ nodes ✓
   
   **Target for this document: ${complexity ? complexity.estimatedNodeCount : 'N/A'} nodes**
   **If you're extracting fewer nodes, you're likely missing important information.**

2. **Every major section has nodes:**
   - Introduction/Background → [can skip, usually no protocols]
   - Methods section → [should have 5-20+ protocol nodes]
   - Results section → [should have 10-40+ result nodes]
   - Discussion → [can skip, usually interpretation not data]

3. **Every figure/table has a corresponding node:**
   - Count figures mentioned in document
   - Verify you have a result node for each one
   - If Figure 1-10 exist, you should have ~10 result nodes

4. **Every analysis mentioned is a separate node:**
   - Don't combine "ANOVA + Tukey + normality test" into one node
   - Create 3 separate analysis nodes

5. **Dependencies are objects, not strings:**
   - Check: ALL dependency arrays contain objects
   - Each object has: referencedNodeTitle, dependencyType, extractedPhrase

**If you're below expected node counts, GO BACK and extract more detail.**
**Err on the side of over-extraction, not under-extraction.**

Return only the JSON, no other text or markdown formatting.
`;
}

