import { z } from 'zod';

/**
 * Schema for Phase 1: Discovery pass
 * Identifies major workflow phases without extracting full content
 */
export const WorkflowDiscoveryResultSchema = z.object({
  phases: z.array(z.object({
    phaseName: z.string().describe('Descriptive name for this phase (e.g., "Data Preparation & Feature Engineering")'),
    phaseType: z.enum(['methodology', 'data', 'analysis', 'results', 'discussion', 'background']).describe('General category'),
    sourceDocuments: z.array(z.string()).describe('Which documents contain this phase'),
    pageRanges: z.record(z.string(), z.tuple([z.number(), z.number()])).describe('Page ranges per document'),
    estimatedNodeCount: z.number().describe('How many nodes expected in this phase (2-10)'),
    keyTopics: z.array(z.string()).describe('Main topics covered in this phase'),
  })).describe('3-6 major workflow phases identified'),
  
  contentInventory: z.object({
    statisticalTests: z.array(z.string()).describe('All statistical tests/methods mentioned (e.g., "PCA", "t-test")'),
    models: z.array(z.string()).describe('All models/algorithms mentioned (e.g., "Kalman Filter", "LSTM")'),
    datasets: z.array(z.string()).describe('All datasets mentioned (e.g., "Treasury yields", "Sentiment scores")'),
    figures: z.array(z.object({
      title: z.string(),
      source: z.string(),
      pageNumber: z.number(),
    })).describe('All figures/charts mentioned'),
    tables: z.array(z.object({
      title: z.string(),
      source: z.string(),
      pageNumber: z.number(),
    })).describe('All tables mentioned'),
    software: z.array(z.string()).describe('Software/libraries mentioned (e.g., "NumPy", "scikit-learn")'),
  }).describe('Comprehensive inventory of extractable content'),
  
  crossReferences: z.array(z.object({
    fromDocument: z.string(),
    toDocument: z.string(),
    context: z.string().describe('How they relate (e.g., "Excel data referenced in PDF Section 4.2")'),
  })).default([]).describe('Cross-references between documents'),
  
  estimatedTotalNodes: z.number().describe('Total nodes expected across all phases'),
});

export type WorkflowDiscoveryResult = z.infer<typeof WorkflowDiscoveryResultSchema>;

