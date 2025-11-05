import type { ExtractedNode } from '@/lib/ai/schemas/workflow-extraction-schema';

/**
 * Rule-based dependency extraction using pattern matching
 * Extracts dependencies that the LLM might have missed
 */
export function extractDependenciesRuleBased(nodes: ExtractedNode[]): void {
  console.log(`[DEPENDENCY_EXTRACTOR] Extracting dependencies for ${nodes.length} nodes using rule-based patterns`);

  // Create an index of nodes by title for quick lookup
  const nodeIndex: Array<{ id: string; title: string; keywords: string[] }> = nodes.map(node => ({
    id: node.nodeId,
    title: node.title,
    keywords: extractKeywords(node.title),
  }));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const contentText = node.content.text || '';
    
    // Skip if already has dependencies (LLM already found them)
    if (node.dependencies && node.dependencies.length > 0) {
      continue;
    }

    // Pattern 1: "Using X from Y" or "Using remaining X from Y"
    const usingPattern = /using\s+(?:remaining\s+)?([^,;.]+?)\s+from\s+([^,;.]+)/gi;
    let match;
    while ((match = usingPattern.exec(contentText)) !== null) {
      const referencedText = match[2].trim();
      const referencedNode = findNodeByFuzzyMatch(nodes, nodeIndex, referencedText, contentText);
      if (referencedNode && referencedNode.nodeId !== node.nodeId) {
        addDependency(node, referencedNode, 'uses_output', match[0]);
      }
    }

    // Pattern 2: "X was analyzed" or "X were analyzed" (linking analysis to data creation/protocol)
    const analyzedPattern = /([^,;.]+?)\s+(?:was|were)\s+analyzed/gi;
    while ((match = analyzedPattern.exec(contentText)) !== null) {
      const referencedText = match[1].trim();
      const referencedNode = findNodeByFuzzyMatch(nodes, nodeIndex, referencedText, contentText);
      if (referencedNode && referencedNode.nodeId !== node.nodeId && node.nodeType === 'analysis') {
        addDependency(node, referencedNode, 'uses_output', match[0]);
      }
    }

    // Pattern 3: "Based on X" or "Based on the results of X"
    const basedOnPattern = /based\s+on(?:\s+the\s+(?:results?|outputs?)\s+of)?\s+([^,;.]+)/gi;
    while ((match = basedOnPattern.exec(contentText)) !== null) {
      const referencedText = match[1].trim();
      const referencedNode = findNodeByFuzzyMatch(nodes, nodeIndex, referencedText, contentText);
      if (referencedNode && referencedNode.nodeId !== node.nodeId) {
        addDependency(node, referencedNode, 'uses_output', match[0]);
      }
    }

    // Pattern 4: "After X" or "Following X" (sequential dependencies)
    const afterPattern = /(?:after|following)\s+([^,;.]+)/gi;
    while ((match = afterPattern.exec(contentText)) !== null) {
      const referencedText = match[1].trim();
      const referencedNode = findNodeByFuzzyMatch(nodes, nodeIndex, referencedText, contentText);
      if (referencedNode && referencedNode.nodeId !== node.nodeId) {
        addDependency(node, referencedNode, 'follows', match[0]);
      }
    }

    // Pattern 5: "Requires X" or "Requiring X"
    const requiresPattern = /requir(?:es?|ing)\s+([^,;.]+)/gi;
    while ((match = requiresPattern.exec(contentText)) !== null) {
      const referencedText = match[1].trim();
      const referencedNode = findNodeByFuzzyMatch(nodes, nodeIndex, referencedText, contentText);
      if (referencedNode && referencedNode.nodeId !== node.nodeId) {
        addDependency(node, referencedNode, 'requires', match[0]);
      }
    }

    // Pattern 6: References to experiments/trials/tests by name (enhanced)
    const experimentRefs = contentText.match(/\b(experiment|trial|test|assay)\s+[12][a-z]?\b/gi);
    if (experimentRefs) {
      for (const ref of experimentRefs) {
        // Search for nodes with "experiment", "test", "trial", "assay" in title
        const matchingNode = nodes.find(n => 
          n.nodeId !== node.nodeId &&
          (n.title.toLowerCase().includes('experiment') ||
           n.title.toLowerCase().includes('test') ||
           n.title.toLowerCase().includes('trial') ||
           n.title.toLowerCase().includes('assay'))
        );
        
        if (matchingNode) {
          addDependency(node, matchingNode, 'uses_output', ref.trim(), 0.7);
        }
      }
    }

    // Pattern 7: Block-level implicit dependencies
    // Analysis nodes typically depend on data creation nodes
    if (node.nodeType === 'analysis') {
      const dataCreationNodes = nodes.filter(n => 
        n.nodeId !== node.nodeId && 
        n.nodeType === 'data_creation'
      );
      // If there's only one data creation node and this analysis doesn't have dependencies,
      // assume it depends on the data creation
      if (dataCreationNodes.length === 1 && (!node.dependencies || node.dependencies.length === 0)) {
        addDependency(node, dataCreationNodes[0], 'uses_output', 'Implicit: analysis depends on data creation', 0.6);
      }
    }

    // Pattern 8: Results nodes depend on Analysis nodes (enhanced with keyword matching)
    if (node.nodeType === 'results') {
      const analysisNodes = nodes.filter(n => 
        n.nodeId !== node.nodeId && 
        n.nodeType === 'analysis'
      );
      // If content mentions analysis keywords, link to analysis nodes
      const analysisKeywords = ['analysis', 'analyzed', 'statistical', 'computed', 'calculated'];
      const mentionsAnalysis = analysisKeywords.some(keyword => 
        contentText.toLowerCase().includes(keyword)
      );
      
      if (mentionsAnalysis && analysisNodes.length > 0) {
        // Link to the first analysis node found
        addDependency(node, analysisNodes[0], 'uses_output', 'Implicit: results depend on analysis', 0.6);
      }
    }

    // Pattern 9: Results nodes depend on Analysis nodes with similar names (keyword-based matching)
    if (node.nodeType === 'results' && (!node.dependencies || node.dependencies.length === 0)) {
      const resultKeywords = extractKeywords(node.title);
      
      for (const analysisNode of nodes) {
        if (analysisNode.nodeType === 'analysis') {
          const analysisKeywords = extractKeywords(analysisNode.title);
          const overlap = resultKeywords.filter(k => analysisKeywords.includes(k));
          
          if (overlap.length >= 2) {
            addDependency(node, analysisNode, 'uses_output', 
              `(implicit: results from analysis with shared keywords: ${overlap.join(', ')})`, 
              0.75);
            break;
          }
        }
      }
    }
  }

  console.log(`[DEPENDENCY_EXTRACTOR] Completed dependency extraction`);
}

/**
 * Extract keywords from text for fuzzy matching
 */
function extractKeywords(text: string): string[] {
  // Remove common words and extract meaningful keywords
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
  ]);

  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.has(word))
    .slice(0, 5); // Limit to top 5 keywords
}

/**
 * Find a node by fuzzy matching on title or keywords
 */
function findNodeByFuzzyMatch(
  nodes: ExtractedNode[],
  nodeIndex: Array<{ id: string; title: string; keywords: string[] }>,
  searchText: string,
  context?: string
): ExtractedNode | null {
  const searchKeywords = extractKeywords(searchText);
  const searchLower = searchText.toLowerCase();

  // First, try exact or partial title match
  for (const indexed of nodeIndex) {
    const titleLower = indexed.title.toLowerCase();
    if (titleLower === searchLower || titleLower.includes(searchLower) || searchLower.includes(titleLower)) {
      const node = nodes.find(n => n.nodeId === indexed.id);
      if (node) return node;
    }
  }

  // Then, try keyword overlap
  let bestMatch: ExtractedNode | null = null;
  let bestScore = 0;

  for (const indexed of nodeIndex) {
    const keywordOverlap = searchKeywords.filter(kw => 
      indexed.keywords.some(ikw => ikw.includes(kw) || kw.includes(ikw))
    ).length;

    if (keywordOverlap > bestScore && keywordOverlap >= 2) {
      bestScore = keywordOverlap;
      const node = nodes.find(n => n.nodeId === indexed.id);
      if (node) bestMatch = node;
    }
  }

  return bestMatch;
}

/**
 * Add a dependency to a node if it doesn't already exist
 */
function addDependency(
  node: ExtractedNode,
  referencedNode: ExtractedNode,
  dependencyType: 'requires' | 'uses_output' | 'follows' | 'validates',
  extractedPhrase: string,
  confidence: number = 0.8
): void {
  // Initialize dependencies array if it doesn't exist
  if (!node.dependencies) {
    node.dependencies = [];
  }

  // Check if dependency already exists
  const exists = node.dependencies.some(dep => 
    dep.referencedNodeTitle === referencedNode.title &&
    dep.dependencyType === dependencyType
  );

  if (!exists) {
    node.dependencies.push({
      referencedNodeTitle: referencedNode.title,
      dependencyType,
      extractedPhrase,
      confidence,
      matchedVia: 'rule-based',
    });
    
    console.log(`[DEPENDENCY_EXTRACTOR] Added dependency: ${node.title} → ${referencedNode.title} (${dependencyType})`);
  }
}
