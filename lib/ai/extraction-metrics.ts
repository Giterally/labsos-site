import type { DocumentComplexity } from '../processing/document-analyzer';
import type { WorkflowExtractionResult } from './schemas/workflow-extraction-schema';

/**
 * Metrics for evaluating extraction quality
 */
export interface ExtractionMetrics {
  targetNodeCount: number;    // From complexity analysis
  actualNodeCount: number;    // Extracted nodes
  coverageRatio: number;      // actual / target
  extractionQuality: 'excellent' | 'good' | 'poor';
}

/**
 * Calculates extraction metrics based on complexity analysis and actual results
 */
export function calculateExtractionMetrics(
  complexity: DocumentComplexity,
  result: WorkflowExtractionResult
): ExtractionMetrics {
  const actualNodeCount = result.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
  const coverageRatio = actualNodeCount / complexity.estimatedNodeCount;

  let quality: ExtractionMetrics['extractionQuality'];
  if (coverageRatio >= 0.8) {
    quality = 'excellent';
  } else if (coverageRatio >= 0.5) {
    quality = 'good';
  } else {
    quality = 'poor';
  }

  return {
    targetNodeCount: complexity.estimatedNodeCount,
    actualNodeCount,
    coverageRatio,
    extractionQuality: quality
  };
}

/**
 * Logs extraction metrics for debugging and monitoring
 */
export function logExtractionMetrics(metrics: ExtractionMetrics, fileName: string): void {
  console.log(`[EXTRACTION_METRICS] Document: ${fileName}`);
  console.log(`  Target nodes: ${metrics.targetNodeCount}`);
  console.log(`  Actual nodes: ${metrics.actualNodeCount}`);
  console.log(`  Coverage: ${(metrics.coverageRatio * 100).toFixed(1)}%`);
  console.log(`  Quality: ${metrics.extractionQuality}`);

  if (metrics.coverageRatio < 0.5) {
    console.warn(`[EXTRACTION_METRICS] ⚠️  Under-extraction detected!`);
    console.warn(`  Expected: ${metrics.targetNodeCount}, Got: ${metrics.actualNodeCount}`);
    console.warn(`  Document may need re-processing with adjusted prompt`);
  }
}


