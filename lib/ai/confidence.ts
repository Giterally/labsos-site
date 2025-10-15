import { SynthesizedNode } from './synthesis';

export interface ConfidenceFactors {
  distinctSourceCount: number;
  avgSimilarity: number;
  hasExactParamMatches: boolean;
  missingClaims: string[];
  hasStructuredSteps: boolean;
  hasParameters: boolean;
  needsVerification: boolean;
}

// Calculate confidence score using weighted factors
export function calculateConfidence(
  node: SynthesizedNode,
  factors: ConfidenceFactors
): number {
  // Base confidence
  let confidence = 0.5;

  // Weight factors
  const weights = {
    distinctSourceCount: 0.2,
    avgSimilarity: 0.2,
    hasExactParamMatches: 0.15,
    hasStructuredSteps: 0.1,
    hasParameters: 0.1,
    missingClaims: -0.2,
    needsVerification: -0.15,
  };

  // Apply factors
  confidence += Math.min(factors.distinctSourceCount * 0.1, 0.2) * weights.distinctSourceCount;
  confidence += factors.avgSimilarity * weights.avgSimilarity;
  confidence += (factors.hasExactParamMatches ? 1 : 0) * weights.hasExactParamMatches;
  confidence += (factors.hasStructuredSteps ? 1 : 0) * weights.hasStructuredSteps;
  confidence += (factors.hasParameters ? 1 : 0) * weights.hasParameters;
  confidence += Math.max(-0.2, -factors.missingClaims.length * 0.05) * weights.missingClaims;
  confidence += (factors.needsVerification ? -1 : 0) * weights.needsVerification;

  // Ensure confidence is between 0 and 1
  return Math.max(0, Math.min(1, confidence));
}

// Extract confidence factors from a synthesized node
export function extractConfidenceFactors(node: SynthesizedNode): ConfidenceFactors {
  const distinctSourceCount = new Set(node.provenance.sources.map(s => s.chunk_id)).size;
  
  // Calculate average similarity (simplified - in practice you'd compute this from embeddings)
  const avgSimilarity = 0.8; // Placeholder - would be calculated from actual embeddings
  
  // Check for exact parameter matches in source text
  const hasExactParamMatches = checkExactParamMatches(node);
  
  // Check for structured steps
  const hasStructuredSteps = node.content.structured_steps && node.content.structured_steps.length > 0;
  
  // Check for parameters
  const hasParameters = node.metadata.parameters && Object.keys(node.metadata.parameters).length > 0;
  
  // Check if needs verification
  const needsVerification = node.metadata.needs_verification || false;
  
  // Missing claims would be determined by validation
  const missingClaims: string[] = []; // Would be populated by validation process

  return {
    distinctSourceCount,
    avgSimilarity,
    hasExactParamMatches,
    missingClaims,
    hasStructuredSteps,
    hasParameters,
    needsVerification,
  };
}

// Check if parameters mentioned in the node appear in source text
function checkExactParamMatches(node: SynthesizedNode): boolean {
  if (!node.metadata.parameters) return false;
  
  const parameters = Object.values(node.metadata.parameters);
  const sourceTexts = node.provenance.sources.map(s => s.snippet).join(' ');
  
  // Simple check - in practice you'd do more sophisticated matching
  return parameters.some(param => 
    sourceTexts.toLowerCase().includes(param.toString().toLowerCase())
  );
}

// Determine if a node needs manual review
export function needsManualReview(confidence: number, threshold: number = 0.6): boolean {
  return confidence < threshold;
}

// Get confidence level description
export function getConfidenceLevel(confidence: number): {
  level: 'low' | 'medium' | 'high';
  description: string;
  color: string;
} {
  if (confidence >= 0.8) {
    return {
      level: 'high',
      description: 'High confidence - likely accurate',
      color: 'green',
    };
  } else if (confidence >= 0.6) {
    return {
      level: 'medium',
      description: 'Medium confidence - review recommended',
      color: 'yellow',
    };
  } else {
    return {
      level: 'low',
      description: 'Low confidence - manual review required',
      color: 'red',
    };
  }
}

// Calculate confidence for a batch of nodes
export function calculateBatchConfidence(nodes: SynthesizedNode[]): {
  averageConfidence: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  needsReviewCount: number;
} {
  const confidences = nodes.map(node => {
    const factors = extractConfidenceFactors(node);
    return calculateConfidence(node, factors);
  });

  const averageConfidence = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
  
  const highConfidenceCount = confidences.filter(conf => conf >= 0.8).length;
  const mediumConfidenceCount = confidences.filter(conf => conf >= 0.6 && conf < 0.8).length;
  const lowConfidenceCount = confidences.filter(conf => conf < 0.6).length;
  const needsReviewCount = confidences.filter(conf => needsManualReview(conf)).length;

  return {
    averageConfidence,
    highConfidenceCount,
    mediumConfidenceCount,
    lowConfidenceCount,
    needsReviewCount,
  };
}