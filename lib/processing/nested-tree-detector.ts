import { ExtractedNode } from '../ai/schemas/workflow-extraction-schema';

export interface NestedTreeCandidate {
  node: ExtractedNode;
  score: number;
  reasons: string[];
}

/**
 * Detect nodes that should be extracted as separate, reusable experiment trees
 */
export function detectNestedTrees(nodes: ExtractedNode[]): NestedTreeCandidate[] {
  console.log(`[NESTED_TREE_DETECTOR] Analyzing ${nodes.length} nodes for nested tree candidates`);

  const candidates: NestedTreeCandidate[] = [];

  for (const node of nodes) {
    let score = 0;
    const reasons: string[] = [];

    // Signal 1: Has many sub-steps (>5)
    const numberedSteps = node.content.text.match(/^\d+\./gm);
    if (numberedSteps && numberedSteps.length > 5) {
      score += 3;
      reasons.push(`Has ${numberedSteps.length} numbered steps`);
    }

    // Signal 2: Explicitly titled as protocol
    const protocolKeywords = ['protocol', 'procedure', 'method', 'sop', 'standard operating'];
    const titleLower = node.title.toLowerCase();
    if (protocolKeywords.some(kw => titleLower.includes(kw))) {
      score += 2;
      reasons.push('Title indicates protocol');
    }

    // Signal 3: Has its own materials section
    const materialsPattern = /materials?|reagents?|equipment|supplies/i;
    if (materialsPattern.test(node.content.text)) {
      score += 2;
      reasons.push('Contains materials section');
    }

    // Signal 4: Referenced multiple times in other nodes
    const referenceCount = nodes.filter(n =>
      n.nodeId !== node.nodeId &&
      n.content.text.toLowerCase().includes(node.title.toLowerCase())
    ).length;

    if (referenceCount >= 2) {
      score += 4;
      reasons.push(`Referenced ${referenceCount} times (reusable)`);
    }

    // Signal 5: Self-contained (few dependencies on other nodes)
    if (node.dependencies.length <= 1) {
      score += 1;
      reasons.push('Self-contained (few dependencies)');
    }

    // Signal 6: Long content (>2000 characters)
    if (node.content.text.length > 2000) {
      score += 1;
      reasons.push('Long procedure text');
    }

    // Signal 7: Has explicit step-by-step structure
    const stepPattern = /(step\s+\d+|procedure\s+\d+|^\d+\.)/gi;
    const stepMatches = node.content.text.match(stepPattern);
    if (stepMatches && stepMatches.length >= 5) {
      score += 2;
      reasons.push('Explicit step-by-step structure');
    }

    // Signal 8: Contains "reusable" or "standard" language
    const reusablePattern = /reusable|standard|template|repeatable|can be used/i;
    if (reusablePattern.test(node.content.text)) {
      score += 2;
      reasons.push('Contains reusable/standard language');
    }

    // Threshold: score >= 5 indicates nested tree candidate
    if (score >= 5) {
      node.isNestedTree = true;
      candidates.push({ node, score, reasons });
    }
  }

  console.log(`[NESTED_TREE_DETECTOR] Found ${candidates.length} nested tree candidates`);

  return candidates;
}

