import type { ExtractedNode } from '@/lib/ai/schemas/workflow-extraction-schema';

/**
 * Detects nodes that should become nested (reusable) experiment trees
 * Returns an array of nodes marked as nested tree candidates
 */
export function detectNestedTrees(nodes: ExtractedNode[]): ExtractedNode[] {
  console.log(`[NESTED_TREE_DETECTOR] Detecting nested trees from ${nodes.length} nodes`);

  const candidates: ExtractedNode[] = [];

  for (const node of nodes) {
    let score = 0;
    const reasons: string[] = [];

    // Signal 1: Node title contains "preparation", "construction", "assembly", "setup"
    const preparationKeywords = ['preparation', 'construction', 'assembly', 'setup', 'fabrication', 'synthesis'];
    if (preparationKeywords.some(kw => node.title.toLowerCase().includes(kw))) {
      score += 3;
      reasons.push('Title indicates preparation/construction procedure');
    }

    // Signal 2: Node title contains "protocol" or "procedure"
    if (node.title.toLowerCase().includes('protocol') || node.title.toLowerCase().includes('procedure')) {
      score += 2;
      reasons.push('Title explicitly mentions protocol/procedure');
    }

    // Signal 3: Node is in Protocol block but has very detailed steps
    if (node.nodeType === 'protocol' && node.content.text.length > 500) {
      const stepIndicators = node.content.text.match(/\b(first|then|next|after|finally|subsequently|step\s+\d+)\b/gi);
      if (stepIndicators && stepIndicators.length >= 4) {
        score += 2;
        reasons.push(`Contains ${stepIndicators.length} sequential indicators`);
      }
    }

    // Signal 4: Content contains numbered steps (1., 2., 3., etc.)
    const numberedSteps = node.content.text.match(/\d+\.\s+[A-Z]/g);
    if (numberedSteps && numberedSteps.length >= 3) {
      score += 2;
      reasons.push(`Contains ${numberedSteps.length} numbered steps`);
    }

    // Signal 5: Content contains bullet points or list markers
    const listMarkers = node.content.text.match(/(?:^|\n)[•\-\*]\s+/gm);
    if (listMarkers && listMarkers.length >= 3) {
      score += 1;
      reasons.push(`Contains ${listMarkers.length} list items`);
    }

    // Signal 6: Content mentions "reusable" or "can be used"
    const reusablePattern = /\b(reusable|can be used|may be used|applicable to|general purpose)\b/i;
    if (reusablePattern.test(node.content.text)) {
      score += 3;
      reasons.push('Content explicitly mentions reusability');
    }

    // Signal 7: Node is standalone and doesn't reference other nodes
    if (!node.dependencies || node.dependencies.length === 0) {
      score += 1;
      reasons.push('No dependencies (standalone procedure)');
    }

    // Signal 8: Content length is substantial (detailed procedure)
    if (node.content.text.length > 300) {
      score += 1;
      reasons.push('Substantial content length');
    }

    // Signal 9: Contains explicit procedural language like "constructed by", "prepared as follows"
    const howToPatterns = [
      /\bconstructed by\b/i,
      /\bprepared as follows\b/i,
      /\bfabricated according to\b/i,
      /\bset up as\b/i,
      /\bassembled by\b/i,
    ];
    if (howToPatterns.some(pattern => pattern.test(node.content.text))) {
      score += 2;
      reasons.push('Contains explicit procedural language');
    }

    // Signal 10: Node is explicitly marked as nested by LLM
    if (node.isNestedTree === true) {
      score += 5;
      reasons.push('Explicitly marked as nested by LLM');
    }

    // Threshold: If score >= 4, mark as nested tree candidate
    if (score >= 4) {
      node.isNestedTree = true;
      candidates.push(node);
      console.log(`[NESTED_TREE_DETECTOR] ✓ Marked "${node.title}" as nested tree candidate (score: ${score})`);
      console.log(`[NESTED_TREE_DETECTOR]   Reasons: ${reasons.join(', ')}`);
    } else {
      node.isNestedTree = false;
    }
  }

  console.log(`[NESTED_TREE_DETECTOR] Found ${candidates.length} nested tree candidates out of ${nodes.length} nodes`);
  return candidates;
}
