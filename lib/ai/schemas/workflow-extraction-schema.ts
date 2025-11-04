import { z } from 'zod';

/**
 * Zod schema for workflow extraction result
 */
export const WorkflowExtractionResultSchema = z.object({
  treeName: z.string().describe('The overall experiment name/title'),
  treeDescription: z.string().describe('Brief description of the experiment (1 sentence)'),
  blocks: z.array(z.object({
    blockName: z.string().describe('Name of the workflow block (e.g., "Protocol", "Data Creation")'),
    blockType: z.enum(['protocol', 'data_creation', 'analysis', 'results', 'software']),
    position: z.number().describe('Ordering position of this block'),
    nodes: z.array(z.object({
      nodeId: z.string().describe('Temporary unique ID for this node'),
      title: z.string().describe('Node title'),
      content: z.object({
        text: z.string().describe('EXACT text from source, no summarization'),
        preservedFormatting: z.object({
          isNumberedList: z.boolean().optional(),
          listItems: z.array(z.string()).optional(),
          hasTable: z.boolean().optional(),
        }).optional(),
      }),
      nodeType: z.enum(['protocol', 'data_creation', 'analysis', 'results', 'software']),
      status: z.enum(['draft', 'complete']).describe('Inferred from source language'),
      parameters: z.record(z.any()).optional().describe('Extracted parameters from content'),
      dependencies: z.array(z.object({
        referencedNodeTitle: z.string(),
        dependencyType: z.enum(['requires', 'uses_output', 'follows', 'validates']),
        extractedPhrase: z.string().describe('Exact phrase showing dependency'),
        confidence: z.number().optional().describe('Confidence score 0-1'),
        matchedVia: z.string().optional().describe('How the dependency was matched'),
      })).default([]),
      attachments: z.array(z.object({
        sourceId: z.string(),
        fileName: z.string(),
        pageRange: z.tuple([z.number(), z.number()]).optional(),
        timestamp: z.tuple([z.number(), z.number()]).optional().describe('For videos'),
        relevance: z.string().describe('Why this attachment is relevant'),
      })).default([]),
      metadata: z.object({
        estimatedTimeMinutes: z.number().optional(),
        tags: z.array(z.string()).default([]),
      }).optional(),
      isNestedTree: z.boolean().optional().describe('Mark if should be separate reusable tree'),
    })),
  })),
  nestedTrees: z.array(z.object({
    nodeId: z.string(),
    treeName: z.string(),
    reason: z.string().describe('Why it\'s nested'),
  })).default([]),
});

export type WorkflowExtractionResult = z.infer<typeof WorkflowExtractionResultSchema>;
export type ExtractedBlock = WorkflowExtractionResult['blocks'][0];
export type ExtractedNode = ExtractedBlock['nodes'][0];
export type NestedTreeReference = WorkflowExtractionResult['nestedTrees'][0];

