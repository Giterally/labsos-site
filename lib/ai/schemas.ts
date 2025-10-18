/**
 * Zod schemas for validating AI-generated outputs
 * Ensures all AI responses conform to expected structure before database insertion
 */

import { z } from 'zod';

// Valid node types that match the database enum
const validNodeTypes = ['protocol', 'data_creation', 'analysis', 'results', 'software', 'uncategorized'] as const;

// Valid dependency types
const validDependencyTypes = ['requires', 'uses_output', 'follows', 'validates'] as const;

// Valid link types
const validLinkTypes = ['github', 'dataset', 'doi', 'url', 'paper'] as const;

// Valid node status types
const validStatusTypes = ['in_progress', 'complete', 'deprecated', 'planned'] as const;

/**
 * Schema for node content
 */
export const NodeContentSchema = z.object({
  text: z.string().min(10, 'Content text must be at least 10 characters'),
  structured_steps: z.array(z.object({
    step_no: z.number().int().positive(),
    action: z.string().min(5),
    params: z.record(z.any()).optional(),
  })).optional(),
});

/**
 * Schema for node metadata
 */
export const NodeMetadataSchema = z.object({
  node_type: z.enum(validNodeTypes),
  tags: z.array(z.string()).max(10, 'Maximum 10 tags allowed'),
  status: z.enum(validStatusTypes),
  parameters: z.record(z.any()),
  estimated_time_minutes: z.number().int().nonnegative().nullable(),
});

/**
 * Schema for node links
 */
export const NodeLinkSchema = z.object({
  type: z.enum(validLinkTypes),
  url: z.string().url('Must be a valid URL'),
  desc: z.string(),
});

/**
 * Schema for node attachments
 */
export const NodeAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  range: z.string().nullish(),  // Accept string, null, or undefined
});

/**
 * Schema for node dependencies
 */
export const NodeDependencySchema = z.object({
  referenced_title: z.string(),
  dependency_type: z.enum(validDependencyTypes),
  confidence: z.number().min(0).max(1),
});

/**
 * Schema for provenance information
 */
export const ProvenanceSchema = z.object({
  sources: z.array(z.object({
    chunk_id: z.string().uuid('Must be a valid UUID'),
    source_type: z.string(),
    snippet: z.string(),
  })),
  generated_by: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Complete schema for a proposed node
 */
export const ProposedNodeSchema = z.object({
  title: z.string()
    .min(10, 'Title must be at least 10 characters')
    .max(200, 'Title must be at most 200 characters'),
  short_summary: z.string().max(500, 'Summary must be at most 500 characters'),
  content: NodeContentSchema,
  metadata: NodeMetadataSchema,
  links: z.array(NodeLinkSchema).max(20, 'Maximum 20 links allowed'),
  attachments: z.array(NodeAttachmentSchema).max(50, 'Maximum 50 attachments allowed'),
  dependencies: z.array(NodeDependencySchema),
  provenance: ProvenanceSchema,
  needs_verification: z.boolean(),
});

/**
 * Attempts to fix common validation errors in AI output
 */
export function fixCommonIssues(nodeData: any): any {
  return {
    ...nodeData,
    title: (nodeData.title || 'Untitled').slice(0, 200),
    short_summary: (nodeData.short_summary || '').slice(0, 500),
    content: {
      text: nodeData.content?.text || '',
      structured_steps: nodeData.content?.structured_steps || [],
    },
    metadata: {
      ...nodeData.metadata,
      node_type: validNodeTypes.includes(nodeData.metadata?.node_type)
        ? nodeData.metadata.node_type
        : 'protocol',
      tags: (nodeData.metadata?.tags || []).slice(0, 10),
      status: validStatusTypes.includes(nodeData.metadata?.status)
        ? nodeData.metadata.status
        : 'in_progress',
      parameters: nodeData.metadata?.parameters || {},
      estimated_time_minutes: Math.max(0, nodeData.metadata?.estimated_time_minutes || 0),
    },
    links: (nodeData.links || []).slice(0, 20).map((link: any) => ({
      type: validLinkTypes.includes(link.type) ? link.type : 'url',
      url: link.url || '',
      desc: link.desc || '',
    })),
    attachments: (nodeData.attachments || []).slice(0, 50).map((att: any) => ({
      id: att.id || '',
      name: att.name || '',
      range: att.range === null ? undefined : att.range,  // Convert null to undefined
    })),
    dependencies: (nodeData.dependencies || []).map((dep: any) => ({
      referenced_title: dep.referenced_title || '',
      dependency_type: validDependencyTypes.includes(dep.dependency_type)
        ? dep.dependency_type
        : 'requires',
      confidence: Math.min(1, Math.max(0, dep.confidence || 0)),
    })),
    provenance: {
      sources: (nodeData.provenance?.sources || []).map((src: any) => ({
        chunk_id: src.chunk_id || '',
        source_type: src.source_type || '',
        snippet: src.snippet || '',
      })),
      generated_by: nodeData.provenance?.generated_by || 'unknown',
      confidence: Math.min(1, Math.max(0, nodeData.provenance?.confidence || 0)),
    },
    needs_verification: Boolean(nodeData.needs_verification),
  };
}

/**
 * Validates and potentially fixes AI-generated node data
 */
export function validateAndFixNode(nodeData: any): z.infer<typeof ProposedNodeSchema> {
  try {
    // First attempt: validate as-is
    return ProposedNodeSchema.parse(nodeData);
  } catch (firstError) {
    if (firstError instanceof z.ZodError) {
      console.warn('[SCHEMA_VALIDATION] Initial validation failed:', {
        errors: firstError.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
          received: e.code === 'invalid_type' ? (e as any).received : undefined,
        })),
      });
    }

    try {
      // Second attempt: apply common fixes
      const fixed = fixCommonIssues(nodeData);
      console.log('[SCHEMA_VALIDATION] Applied fixes, retrying validation');
      return ProposedNodeSchema.parse(fixed);
    } catch (secondError) {
      if (secondError instanceof z.ZodError) {
        const errorDetails = secondError.errors.map(e => {
          const path = e.path.join('.') || 'root';
          return `  - ${path}: ${e.message}${e.code === 'invalid_type' ? ` (received: ${(e as any).received})` : ''}`;
        }).join('\n');
        
        console.error('[SCHEMA_VALIDATION] Validation failed after fixes:\n', errorDetails);
        console.error('[SCHEMA_VALIDATION] Problematic data:', JSON.stringify(nodeData, null, 2));
        
        throw new Error(`Schema validation failed:\n${errorDetails}\n\nThis usually means the AI generated an invalid node structure. Please try again.`);
      }
      
      throw new Error(`Schema validation failed: ${secondError instanceof Error ? secondError.message : 'Unknown error'}`);
    }
  }
}

