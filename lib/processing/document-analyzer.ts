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

  const baseNodes = experimentIndicators * 2.5; // Average 2.5 nodes per experiment
  const figureNodes = figureCount * 0.5; // Some figures shared across nodes
  const subsectionNodes = subsections * 0.3; // Some subsections are minor

  const estimatedNodeCount = Math.round(
    Math.max(5, Math.min(100, baseNodes + figureNodes + subsectionNodes))
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
 * Splits document into hierarchical sections for staged extraction
 */
export function splitDocumentForHierarchicalExtraction(
  doc: StructuredDocument
): StructuredDocument[] {
  // Group sections by top-level (level 1) sections
  const topLevelSections = doc.sections.filter(s => s.level === 1);

  const chunks: StructuredDocument[] = [];

  for (const topSection of topLevelSections) {
    // Find all subsections belonging to this top-level section
    const startIdx = doc.sections.indexOf(topSection);
    const nextTopIdx = doc.sections.findIndex(
      (s, idx) => idx > startIdx && s.level === 1
    );
    const endIdx = nextTopIdx === -1 ? doc.sections.length : nextTopIdx;

    const sectionsForChunk = doc.sections.slice(startIdx, endIdx);

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

  console.log(`[HIERARCHICAL_SPLIT] Split document into ${chunks.length} top-level sections`);

  return chunks;
}


