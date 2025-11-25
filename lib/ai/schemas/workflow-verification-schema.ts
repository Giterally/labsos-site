import { z } from 'zod';
import type { WorkflowDiscoveryResult } from './workflow-discovery-schema';
import type { PhaseExtractionResult } from './workflow-phase-extraction-schema';
import type { StructuredDocument } from '../../processing/parsers/pdf-parser';

/**
 * Schema for Phase 3: Verify completeness and identify gaps
 */
export const WorkflowVerificationResultSchema = z.object({
  isComplete: z.boolean().describe('True if all expected content was extracted'),
  
  missingContent: z.array(z.object({
    itemType: z.enum(['statistical_test', 'model', 'figure', 'table', 'section', 'other']),
    itemName: z.string().describe('What is missing (e.g., "Principal Component Analysis")'),
    expectedLocation: z.string().describe('Where it should have been (e.g., "Methodology block, page 7")'),
    reason: z.string().describe('Why it might be missing'),
  })).describe('Content from inventory that was not extracted'),
  
  misplacedNodes: z.array(z.object({
    nodeTitle: z.string(),
    currentBlock: z.string(),
    shouldBe: z.string().describe('Which block it should be in'),
    reason: z.string(),
  })).describe('Nodes that are in wrong blocks'),
  
  duplicateNodes: z.array(z.object({
    nodeTitle1: z.string(),
    nodeTitle2: z.string(),
    similarity: z.number().describe('How similar (0-1)'),
    recommendation: z.string().describe('Keep which one or merge?'),
  })).transform((arr) => {
    // Filter out any incomplete objects (defensive handling for LLM errors)
    const valid = arr.filter(item => 
      item?.nodeTitle1 && 
      typeof item.nodeTitle1 === 'string' &&
      item?.nodeTitle2 && 
      typeof item.nodeTitle2 === 'string' && 
      typeof item?.similarity === 'number' && 
      item?.recommendation &&
      typeof item.recommendation === 'string'
    );
    
    // Log if we filtered any invalid entries (for debugging)
    if (valid.length < arr.length) {
      console.warn(`[VERIFICATION_SCHEMA] Filtered ${arr.length - valid.length} invalid duplicateNodes entries (missing required fields)`);
    }
    
    return valid;
  }).describe('Potentially duplicate nodes (incomplete entries are automatically filtered)'),
  
  suggestions: z.array(z.string()).describe('Other suggestions for improvement'),
  
  qualityScore: z.number().min(0).max(10).describe('Overall quality score (0-10)'),
});

export type WorkflowVerificationResult = z.infer<typeof WorkflowVerificationResultSchema>;

/**
 * Input for verification pass
 */
export interface VerificationInput {
  discoveryResult: WorkflowDiscoveryResult;
  extractedBlocks: PhaseExtractionResult[];
  documents: StructuredDocument[];
}

