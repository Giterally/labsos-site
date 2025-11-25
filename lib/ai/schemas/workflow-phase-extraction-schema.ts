import { z } from 'zod';
import type { StructuredDocument } from '../../processing/parsers/pdf-parser';

/**
 * Schema for Phase 2: Extract nodes for a single workflow phase
 * This is a subset of the full WorkflowExtractionResult (just one block)
 */
export const PhaseExtractionResultSchema = z.object({
  blockName: z.string().describe('Descriptive name for this phase'),
  blockType: z.string().describe('Category: methodology, data, analysis, results, tools'),
  blockDescription: z.string().optional().describe('1-2 sentences explaining this phase'),
  position: z.number().describe('Order position of this block'),
  nodes: z.array(z.object({
    nodeId: z.string().describe('Temporary unique ID'),
    title: z.string().describe('Node title'),
    content: z.object({
      text: z.string().describe('EXACT text from source'),
      preservedFormatting: z.object({
        isNumberedList: z.boolean().optional(),
        listItems: z.array(z.string()).optional(),
        hasTable: z.boolean().optional(),
      }).optional(),
    }),
    nodeType: z.string().describe('Category matching blockType'),
    status: z.enum(['draft', 'complete']),
    parameters: z.record(z.any()).optional(),
    dependencies: z.preprocess(
      (val) => {
        // Handle case where LLM returns dependencies as strings instead of objects
        if (!val) return [];
        if (!Array.isArray(val)) return [];
        return val.map((dep: any) => {
          // If it's already an object, return as-is
          if (typeof dep === 'object' && dep !== null && !Array.isArray(dep)) return dep;
          // If it's a string, convert to object format
          if (typeof dep === 'string') {
            return {
              referencedNodeTitle: dep,
              dependencyType: 'follows' as const,
              extractedPhrase: dep,
            };
          }
          // Skip invalid entries
          return null;
        }).filter((dep: any) => dep !== null);
      },
      z.array(z.object({
        referencedNodeTitle: z.string(),
        dependencyType: z.enum(['requires', 'uses_output', 'follows', 'validates']),
        extractedPhrase: z.string(),
        confidence: z.number().optional(),
        matchedVia: z.string().optional(),
      })).default([])
    ),
    attachments: z.array(z.object({
      sourceId: z.string(),
      fileName: z.string(),
      pageRange: z.tuple([z.number(), z.number()]).optional(),
      timestamp: z.tuple([z.number(), z.number()]).optional(),
      relevance: z.string(),
    })).default([]),
    metadata: z.object({
      estimatedTimeMinutes: z.number().optional(),
      tags: z.array(z.string()).default([]),
      extractedFrom: z.object({
        source: z.string(),
        pages: z.union([
          z.tuple([z.number(), z.number()]), // Page range [start, end]
          z.array(z.number()).min(1).max(2), // Flexible: [page] or [start, end]
        ]).transform(pages => {
          // Normalize to tuple
          if (pages.length === 1) {
            return [pages[0], pages[0]] as [number, number];
          }
          return pages as [number, number];
        }),
      }).optional(),
    }).optional(),
    isNestedTree: z.boolean().optional(),
  })).describe('Nodes extracted for this phase only'),
});

export type PhaseExtractionResult = z.infer<typeof PhaseExtractionResultSchema>;

/**
 * Input for phase extraction
 */
export interface PhaseExtractionInput {
  phaseName: string;
  phaseType: string;
  sourceDocuments: string[];
  pageRanges: Record<string, [number, number]>;
  estimatedNodeCount: number;
  keyTopics: string[];
  contentInventory: {
    statisticalTests: string[];
    models: string[];
    datasets: string[];
    figures: Array<{ title: string; source: string; pageNumber: number }>;
    tables: Array<{ title: string; source: string; pageNumber: number }>;
    software: string[];
  };
  documents: StructuredDocument[];
  explicitInstructions?: string; // Optional additional instructions for retry scenarios
}

