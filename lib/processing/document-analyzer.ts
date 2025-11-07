import type { StructuredDocument } from './parsers/pdf-parser';

/**
 * Document complexity analysis result
 */
export interface DocumentComplexity {
  estimatedNodeCount: number;
  extractionStrategy: 'simple' | 'moderate' | 'complex' | 'comprehensive';
  shouldUseHierarchical: boolean;
  sectionDepth: number;
  experimentCount: number;
  recommendedProvider: 'gpt-4o' | 'gemini';
}

/**
 * Analyzes document structure to determine extraction strategy
 */
export function analyzeDocumentComplexity(
  doc: StructuredDocument
): DocumentComplexity {
  const sections = doc.sections || [];
  const totalSections = sections.length;

  // Count subsections (depth indicators)
  const subsections = sections.filter(s => s.level > 1).length;
  const sectionDepth = Math.max(...sections.map(s => s.level), 1);

  // Count key indicators of experiments
  const experimentKeywords = [
    'method', 'procedure', 'protocol', 'experiment',
    'analysis', 'results', 'data collection', 'measurement',
    'statistical', 'algorithm', 'implementation'
  ];

  let experimentIndicators = 0;
  for (const section of sections) {
    const titleLower = section.title.toLowerCase();
    const contentText = section.content
      .map(c => c.type === 'text' ? c.content : '')
      .join(' ')
      .toLowerCase();

    for (const keyword of experimentKeywords) {
      if (titleLower.includes(keyword) || contentText.includes(keyword)) {
        experimentIndicators++;
        break; // Count each section once
      }
    }
  }

  // Count figures, tables (usually correspond to nodes)
  const figureCount = sections.reduce((sum, s) => {
    return sum + s.content.filter(c =>
      c.type === 'figure' || c.type === 'table'
    ).length;
  }, 0);

  // Heuristic: estimate node count
  // - Each experiment section → 2-4 nodes (protocol, data, analysis, results)
  // - Each figure/table → potential result node
  // - Each methods subsection → potential protocol node
  // - For large documents, be more aggressive with node extraction

  const baseNodes = experimentIndicators * 3.5; // Increased from 2.5 - more aggressive extraction
  const figureNodes = figureCount * 1.0; // Increased from 0.7 - every figure should have a node
  const subsectionNodes = subsections * 0.6; // Increased from 0.4 - subsections often contain distinct procedures
  
  // Count method keywords in content (additional heuristic)
  const methodKeywords = [
    'protocol', 'procedure', 'method', 'technique', 'test', 'analysis',
    'measurement', 'collection', 'preparation', 'extraction', 'amplification',
    'statistical', 'anova', 't-test', 'regression', 'model', 'algorithm'
  ];
  
  let methodKeywordCount = 0;
  for (const section of sections) {
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
  
  // Each method keyword suggests a potential node (but cap to avoid over-estimation)
  const methodNodes = Math.min(methodKeywordCount * 0.3, totalSections * 2); // Cap at 2x sections
  
  // For large documents (many sections), increase multiplier
  const documentSizeMultiplier = totalSections > 20 ? 1.3 : 1.0; // Boost for large documents
  
  const rawEstimate = (baseNodes + figureNodes + subsectionNodes + methodNodes) * documentSizeMultiplier;
  
  // More aggressive cap for comprehensive documents
  const maxNodes = totalSections > 30 ? 120 : 100; // Allow up to 120 nodes for very large documents
  
  const estimatedNodeCount = Math.round(
    Math.max(5, Math.min(maxNodes, rawEstimate))
  );

  // Determine strategy
  let strategy: DocumentComplexity['extractionStrategy'];
  let shouldUseHierarchical: boolean;

  if (estimatedNodeCount <= 15 && sectionDepth <= 2) {
    strategy = 'simple';
    shouldUseHierarchical = false;
  } else if (estimatedNodeCount <= 30 && sectionDepth <= 3) {
    strategy = 'moderate';
    shouldUseHierarchical = false;
  } else if (estimatedNodeCount <= 50) {
    strategy = 'complex';
    shouldUseHierarchical = estimatedNodeCount > 30 && sectionDepth > 2;
  } else {
    strategy = 'comprehensive';
    shouldUseHierarchical = true;
  }

  // Token estimation
  const docSize = JSON.stringify(doc).length;
  const estimatedTokens = Math.ceil(docSize / 4);

  const recommendedProvider: 'gpt-4o' | 'gemini' =
    estimatedTokens < 150000 ? 'gpt-4o' : 'gemini';

  console.log(`[DOCUMENT_ANALYSIS]`);
  console.log(`  Sections: ${totalSections}, Depth: ${sectionDepth}`);
  console.log(`  Experiment indicators: ${experimentIndicators}`);
  console.log(`  Figures/tables: ${figureCount}`);
  console.log(`  Estimated nodes: ${estimatedNodeCount}`);
  console.log(`  Strategy: ${strategy}`);
  console.log(`  Hierarchical: ${shouldUseHierarchical}`);
  console.log(`  Recommended provider: ${recommendedProvider}`);

  return {
    estimatedNodeCount,
    extractionStrategy: strategy,
    shouldUseHierarchical,
    sectionDepth,
    experimentCount: experimentIndicators,
    recommendedProvider
  };
}

/**
 * Validates if a section is valid for workflow extraction
 * Filters out fragments, citations, equations, and other non-extractable content
 */
function isValidSectionForExtraction(section: { title: string; content: Array<{ type: string; content: string }> }): boolean {
  const title = section.title.trim();
  const titleLower = title.toLowerCase();
  
  // Check if title is too short (likely a fragment)
  if (title.length < 3) {
    return false;
  }
  
  // Check for citation patterns in title
  const citationPatterns = [
    /^\[\d+\]\.?$/,           // [7].
    /^\d+\.\s*$/,             // 1.
    /^\(\d+\)\.?$/,           // (7)
    /^\[.*\]$/,               // [anything in brackets]
  ];
  
  if (citationPatterns.some(pattern => pattern.test(title))) {
    return false;
  }
  
  // Check for equation fragments in title
  const equationPatterns = [
    /^\(.*[−\+\=\×\÷].*$/,    // ( 1−푒
    /^\[?퐸푞\.?\d+\]?/i,      // [퐸푞.16], 퐸푞.17
    /^Eq\.?\s*\d+/i,          // Eq.16, Eq 17
    /^Equation\s+\d+/i,       // Equation 16
  ];
  
  if (equationPatterns.some(pattern => pattern.test(title))) {
    return false;
  }
  
  // Check for table data patterns (numbers, percentages, symbols)
  const tableDataPatterns = [
    /^\d+[\s\w%&,\.]+$/,      // "10 Y Yield 1.000000 N/A, S&P 0.671223"
    /^\d+\.\d+[\s%]+/,        // "0.273884, 0.004868 0.050449 63.22%"
    /^[\d\s%&,\.]+$/,         // All numbers/symbols
  ];
  
  if (tableDataPatterns.some(pattern => pattern.test(title))) {
    return false;
  }
  
  // Check for ISBN/page number patterns
  const isbnPatterns = [
    /^\d{3,}-\d+-\d+/,        // 019-0686-2
    /^\d+\.\s*$/,             // 364.
    /^\d{6,}/,                // 104590
    /^\d{4}\/\d+/,            // 201306/1355
  ];
  
  if (isbnPatterns.some(pattern => pattern.test(title))) {
    return false;
  }
  
  // Check if title is just a sentence fragment (ends mid-sentence)
  if (title.match(/^[a-z]/) && !title.match(/[\.!?]$/)) {
    // Starts with lowercase and doesn't end with punctuation - likely fragment
    if (title.length < 20) {
      return false;
    }
  }
  
  // Check content - must have meaningful text
  const allContent = section.content
    .filter(c => c.type === 'text')
    .map(c => c.content)
    .join(' ')
    .trim();
  
  if (allContent.length < 50) {
    return false; // Too short to extract workflow
  }
  
  // Check if content is mostly citations/references
  const citationCount = (allContent.match(/\[\d+\]/g) || []).length;
  const lines = allContent.split('\n').filter(l => l.trim().length > 0);
  if (lines.length > 0 && citationCount / lines.length > 0.5) {
    return false; // More than 50% citations
  }
  
  return true;
}

/**
 * Splits document into hierarchical sections for staged extraction
 * Filters out invalid sections (fragments, citations, equations) before splitting
 */
export function splitDocumentForHierarchicalExtraction(
  doc: StructuredDocument
): StructuredDocument[] {
  // Filter out invalid sections first
  const validSections = doc.sections.filter(section => {
    const isValid = isValidSectionForExtraction(section);
    if (!isValid) {
      console.log(`[HIERARCHICAL_SPLIT] Filtering invalid section: "${section.title.substring(0, 50)}"`);
    }
    return isValid;
  });
  
  console.log(`[HIERARCHICAL_SPLIT] Valid sections: ${validSections.length}/${doc.sections.length}`);
  
  // Group sections by top-level (level 1) sections
  const topLevelSections = validSections.filter(s => s.level === 1);
  
  if (topLevelSections.length === 0) {
    console.warn(`[HIERARCHICAL_SPLIT] No valid top-level sections found, using all valid sections`);
    // Fallback: use all valid sections as one chunk
    return [{
      ...doc,
      sections: validSections,
      metadata: {
        ...doc.metadata,
        chunkInfo: {
          parentSection: 'Document',
          sectionRange: [0, validSections.length]
        }
      }
    }];
  }

  const chunks: StructuredDocument[] = [];

  for (const topSection of topLevelSections) {
    // Find all subsections belonging to this top-level section
    const startIdx = validSections.indexOf(topSection);
    const nextTopIdx = validSections.findIndex(
      (s, idx) => idx > startIdx && s.level === 1
    );
    const endIdx = nextTopIdx === -1 ? validSections.length : nextTopIdx;

    const sectionsForChunk = validSections.slice(startIdx, endIdx);
    
    // Only create chunk if it has meaningful content
    const totalContentLength = sectionsForChunk.reduce((sum, s) => 
      sum + s.content.reduce((sum2, c) => sum2 + c.content.length, 0), 0
    );
    
    if (totalContentLength < 100) {
      console.log(`[HIERARCHICAL_SPLIT] Skipping chunk "${topSection.title}" - too short (${totalContentLength} chars)`);
      continue;
    }

    // Create sub-document
    chunks.push({
      ...doc,
      sections: sectionsForChunk,
      metadata: {
        ...doc.metadata,
        chunkInfo: {
          parentSection: topSection.title,
          sectionRange: [startIdx, endIdx]
        }
      }
    });
  }

  console.log(`[HIERARCHICAL_SPLIT] Split document into ${chunks.length} valid top-level sections`);

  return chunks;
}


