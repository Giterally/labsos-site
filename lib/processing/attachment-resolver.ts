import { StructuredDocument } from './parsers/pdf-parser';
import { ExtractedNode } from '../ai/schemas/workflow-extraction-schema';

export interface Attachment {
  sourceId: string;
  fileName: string;
  pageRange?: [number, number];
  timestamp?: [number, number]; // for videos
  relevance: string;
}

/**
 * Resolve and validate attachments for extracted nodes
 */
export async function resolveAttachments(
  extractedNodes: ExtractedNode[],
  structuredDoc: StructuredDocument
): Promise<void> {
  console.log(`[ATTACHMENT_RESOLVER] Resolving attachments for ${extractedNodes.length} nodes`);

  for (const node of extractedNodes) {
    // Validate existing attachments suggested by LLM
    for (const attachment of node.attachments) {
      // Verify page range exists
      if (attachment.pageRange) {
        const [start, end] = attachment.pageRange;
        const maxPages = structuredDoc.metadata.totalPages || 1;
        
        if (start > maxPages || end > maxPages || start < 1 || end < 1) {
          console.warn(`[ATTACHMENT_RESOLVER] Invalid page range for node ${node.nodeId}: ${start}-${end} (max: ${maxPages})`);
          // Remove invalid attachment
          node.attachments = node.attachments.filter(a => a !== attachment);
          continue;
        }
        
        if (end < start) {
          console.warn(`[ATTACHMENT_RESOLVER] Invalid page range order for node ${node.nodeId}: ${start}-${end}`);
          // Fix order
          attachment.pageRange = [end, start];
        }
      }

      // For videos: validate timestamps
      if (structuredDoc.type === 'video' && attachment.timestamp) {
        const [start, end] = attachment.timestamp;
        
        // Ensure timestamps are valid
        if (end <= start || start < 0) {
          console.warn(`[ATTACHMENT_RESOLVER] Invalid timestamp for node ${node.nodeId}: ${start}-${end}`);
          attachment.timestamp = undefined;
        }
        
        // Check against document duration
        const maxDuration = structuredDoc.metadata.duration || 0;
        if (end > maxDuration) {
          console.warn(`[ATTACHMENT_RESOLVER] Timestamp exceeds video duration for node ${node.nodeId}`);
          attachment.timestamp = [start, Math.min(end, maxDuration)];
        }
      }
    }

    // Check if content mentions figures/tables and try to locate them
    const figureMatches = node.content.text.match(/[Ff]igure\s+(\d+)/g);
    if (figureMatches) {
      const figureRefs = await findFiguresInDocument(structuredDoc, figureMatches);
      node.attachments.push(...figureRefs);
    }

    // Check for table references
    const tableMatches = node.content.text.match(/[Tt]able\s+(\d+)/g);
    if (tableMatches) {
      const tableRefs = await findTablesInDocument(structuredDoc, tableMatches);
      node.attachments.push(...tableRefs);
    }

    // Store provenance for traceability
    if (!node.metadata) {
      node.metadata = {};
    }
    node.metadata.provenance = {
      sourceId: structuredDoc.sourceId,
      fileName: structuredDoc.fileName,
      extractedAt: new Date().toISOString(),
    };
  }

  console.log(`[ATTACHMENT_RESOLVER] Attachment resolution complete`);
}

/**
 * Find figures mentioned in node content
 */
async function findFiguresInDocument(
  doc: StructuredDocument,
  figureRefs: string[]
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];

  for (const section of doc.sections) {
    for (const block of section.content) {
      if (block.type === 'figure') {
        // Match figure number
        for (const ref of figureRefs) {
          const figureNum = ref.match(/\d+/)?.[0];
          if (figureNum && block.content.includes(`Figure ${figureNum}`) || 
              block.content.includes(`Fig. ${figureNum}`)) {
            attachments.push({
              sourceId: doc.sourceId,
              fileName: doc.fileName,
              pageRange: [block.pageNumber, block.pageNumber],
              relevance: `Contains ${ref}`,
            });
          }
        }
      }
    }
  }

  return attachments;
}

/**
 * Find tables mentioned in node content
 */
async function findTablesInDocument(
  doc: StructuredDocument,
  tableRefs: string[]
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];

  for (const section of doc.sections) {
    for (const block of section.content) {
      if (block.type === 'table') {
        // Match table number
        for (const ref of tableRefs) {
          const tableNum = ref.match(/\d+/)?.[0];
          if (tableNum && block.content.includes(`Table ${tableNum}`)) {
            attachments.push({
              sourceId: doc.sourceId,
              fileName: doc.fileName,
              pageRange: [block.pageNumber, block.pageNumber],
              relevance: `Contains ${ref}`,
            });
          }
        }
      }
    }
  }

  return attachments;
}

