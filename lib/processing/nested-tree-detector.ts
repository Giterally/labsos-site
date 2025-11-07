import type { ExtractedNode } from '@/lib/ai/schemas/workflow-extraction-schema';

// Configurable threshold - make stricter to reduce false positives
const NESTED_TREE_THRESHOLD = 8; // Raised from 4 to 8 for stricter detection

/**
 * Detects nodes that should become nested (reusable) experiment trees
 * 
 * A nested tree is a reusable, self-contained sub-workflow that:
 * - Could be used in other experiments (reusability)
 * - Has its own complete workflow (protocol → [data] → [analysis] → [results])
 * - Makes sense to view/edit independently (logical isolation)
 * 
 * Returns an array of nodes marked as nested tree candidates
 */
export function detectNestedTrees(nodes: ExtractedNode[]): ExtractedNode[] {
  console.log(`[NESTED_TREE_DETECTOR] ========================================`);
  console.log(`[NESTED_TREE_DETECTOR] Analyzing ${nodes.length} nodes for nested trees`);
  console.log(`[NESTED_TREE_DETECTOR] Threshold: ${NESTED_TREE_THRESHOLD}`);

  const candidates: ExtractedNode[] = [];

  for (const node of nodes) {
    let score = 0;
    const reasons: string[] = [];

    // Signal 1: Node is explicitly marked as nested by LLM (weak signal, not auto-accept)
    if (node.isNestedTree === true) {
      score += 2; // Reduced from 5 to 2 - LLM hint is weak signal
      reasons.push('LLM marked as nested tree (weak signal)');
    }

    // Signal 2: Node title contains reusable protocol keywords
    const title = node.title.toLowerCase();
    const reusableKeywords = [
      'protocol', 'procedure', 'method', 'standard',
      'preparation', 'construction', 'assembly', 'setup',
      'fabrication', 'synthesis', 'extraction', 'isolation'
    ];
    
    if (reusableKeywords.some(kw => title.includes(kw))) {
      score += 2;
      reasons.push(`Reusable keyword in title: "${title}"`);
    }

    // Signal 3: Content explicitly mentions reusability
    const reusablePattern = /\b(reusable|can be used|may be used|applicable to|general purpose|standard procedure|standard protocol)\b/i;
    if (reusablePattern.test(node.content.text)) {
      score += 3;
      reasons.push('Content explicitly mentions reusability');
    }

    // Signal 4: Content has numbered steps (structured procedure) - requires 5+ steps
    const numberedSteps = node.content.text.match(/^\d+\.\s+/gm);
    if (numberedSteps && numberedSteps.length >= 5) {
      score += 3;
      reasons.push(`${numberedSteps.length} numbered steps (structured procedure)`);
    } else if (numberedSteps && numberedSteps.length >= 3) {
      score += 1; // Fewer points for 3-4 steps
      reasons.push(`${numberedSteps.length} numbered steps`);
    }

    // Signal 5: Find related nodes (data collection, analysis, results for this protocol)
    // This indicates a complete sub-workflow
    const relatedNodes = nodes.filter(n => {
      if (n.nodeId === node.nodeId) return false;
      
      // Check if node depends on this protocol
      const dependsOnProtocol = n.dependencies?.some(dep => 
        dep.referencedNodeTitle === node.title
      );
      
      // Check if node mentions this protocol in content
      const mentionsProtocol = n.content?.text?.toLowerCase().includes(node.title.toLowerCase());
      
      return dependsOnProtocol || mentionsProtocol;
    });
    
    if (relatedNodes.length >= 3) {
      score += 4;
      reasons.push(`${relatedNodes.length} related nodes (complete sub-workflow)`);
    } else if (relatedNodes.length >= 1) {
      score += 1; // Some related nodes, but not a complete workflow
      reasons.push(`${relatedNodes.length} related node(s)`);
    }

    // Signal 6: Content has substantial detail (detailed procedure)
    if (node.content.text.length > 500) {
      score += 1;
      reasons.push('Substantial content length (>500 chars)');
    }

    // Signal 7: Contains explicit procedural language
    const howToPatterns = [
      /\bconstructed by\b/i,
      /\bprepared as follows\b/i,
      /\bfabricated according to\b/i,
      /\bset up as\b/i,
      /\bassembled by\b/i,
      /\bperformed as described\b/i,
    ];
    if (howToPatterns.some(pattern => pattern.test(node.content.text))) {
      score += 2;
      reasons.push('Contains explicit procedural language');
    }

    // Signal 8: Node spans multiple block types (indicates workflow, not single step)
    // This is checked by looking at related nodes' types
    if (relatedNodes.length > 0) {
      const relatedTypes = new Set(relatedNodes.map(n => n.nodeType));
      if (relatedTypes.size >= 2) {
        score += 2;
        reasons.push(`Spans ${relatedTypes.size} block types (protocol → data/analysis/results)`);
      }
    }

    // CRITICAL: Must score ≥8 to qualify as nested tree (much stricter)
    if (score >= NESTED_TREE_THRESHOLD) {
      node.isNestedTree = true;
      candidates.push(node);
      console.log(`[NESTED_TREE_DETECTOR] ✅ "${node.title}" qualifies (score: ${score}/${NESTED_TREE_THRESHOLD})`);
      console.log(`[NESTED_TREE_DETECTOR]    Reasons: ${reasons.join(', ')}`);
    } else {
      node.isNestedTree = false;
      if (score > 0) {
        console.log(`[NESTED_TREE_DETECTOR] ❌ "${node.title}" rejected (score: ${score}/${NESTED_TREE_THRESHOLD})`);
        console.log(`[NESTED_TREE_DETECTOR]    Partial reasons: ${reasons.join(', ')}`);
      }
    }
  }

  console.log(`[NESTED_TREE_DETECTOR] ========================================`);
  console.log(`[NESTED_TREE_DETECTOR] Identified ${candidates.length} nested tree candidates out of ${nodes.length} nodes`);
  
  return candidates;
}
