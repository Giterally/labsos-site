import type { ExtractedNode } from '@/lib/ai/schemas/workflow-extraction-schema';
import type { StructuredDocument } from '@/lib/processing/parsers/pdf-parser';

// Environment variable to control fallback behavior
const CREATE_PLACEHOLDER_ATTACHMENTS = process.env.ATTACHMENT_PLACEHOLDER_MODE !== 'false'; // Default: true

/**
 * Enhanced attachment detection with comprehensive logging
 */
export function detectAttachmentReferences(content: string): Array<{
  type: 'figure' | 'table' | 'equation';
  identifier: string;
  matchedText: string;
}> {
  const references: Array<{
    type: 'figure' | 'table' | 'equation';
    identifier: string;
    matchedText: string;
  }> = [];

  // Pattern 1: Figures
  const figurePatterns = [
    /\bFigure\s+(\d+[a-zA-Z]?)/gi,
    /\bFig\.?\s+(\d+[a-zA-Z]?)/gi,
    /\(Fig\.?\s+(\d+[a-zA-Z]?)\)/gi,
    /\bfigure\s+(\d+[a-zA-Z]?)/gi
  ];

  for (const pattern of figurePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      references.push({
        type: 'figure',
        identifier: match[1],
        matchedText: match[0]
      });
    }
  }

  // Pattern 2: Tables
  const tablePatterns = [
    /\bTable\s+(\d+[a-zA-Z]?)/gi,
    /\(Table\s+(\d+[a-zA-Z]?)\)/gi,
    /\btable\s+(\d+[a-zA-Z]?)/gi
  ];

  for (const pattern of tablePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      references.push({
        type: 'table',
        identifier: match[1],
        matchedText: match[0]
      });
    }
  }

  // Pattern 3: Equations
  const equationPatterns = [
    /\bEquation\s+(\d+)/gi,
    /\bEq\.?\s+(\d+)/gi,
    /\[Eq\.\s+(\d+)\]/gi
  ];

  for (const pattern of equationPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      references.push({
        type: 'equation',
        identifier: match[1],
        matchedText: match[0]
      });
    }
  }

  // Deduplicate by type+identifier
  const seen = new Set<string>();
  const unique = references.filter(ref => {
    const key = `${ref.type}-${ref.identifier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique;
}

/**
 * Finds attachment in document structure
 */
export function findAttachmentInDocument(
  doc: StructuredDocument,
  type: 'figure' | 'table' | 'equation',
  identifier: string
): {
  fileName: string;
  caption: string;
  pageNumber: number;
} | null {
  // Search all sections for matching figure/table/equation
  for (const section of doc.sections || []) {
    for (const content of section.content || []) {
      if (content.type === type) {
        const caption = (content as any).caption || (content as any).title || content.content || '';
        const normalizedCaption = caption.toLowerCase();

        // Try multiple matching strategies
        const matchPatterns = [
          new RegExp(`${type}\\s+${identifier}\\b`, 'i'),
          new RegExp(`${type.substring(0, 3)}\\.?\\s+${identifier}\\b`, 'i'),
          new RegExp(`\\b${identifier}\\b`) // Just the number
        ];

        const matches = matchPatterns.some(pattern =>
          normalizedCaption.match(pattern)
        );

        if (matches) {
          const pageNumber = (content as any).pageNumber || (section.pageRange ? section.pageRange[0] : 0);
          return {
            fileName: `${type.charAt(0).toUpperCase() + type.slice(1)} ${identifier}`,
            caption: caption.substring(0, 200), // Limit caption length
            pageNumber: pageNumber
          };
        }
      }
    }
  }

  // Strategy 2: Search text content for caption patterns (fallback)
  for (const section of doc.sections || []) {
    for (const content of section.content || []) {
      const blockText = (content.content || '').toLowerCase();

      // Build flexible patterns
      const patterns = [
        new RegExp(`${type}\\s+${identifier}[a-z]?[.:]`, 'i'),
        new RegExp(`${type.substring(0, 3)}\\.?\\s+${identifier}[a-z]?[.:]`, 'i'),
        new RegExp(`\\(${type.substring(0, 3)}\\.?\\s+${identifier}[a-z]?\\)`, 'i')
      ];

      if (patterns.some(pattern => pattern.test(blockText))) {
        const pageNumber = (content as any).pageNumber || (section.pageRange ? section.pageRange[0] : 0);
        return {
          fileName: `${type.charAt(0).toUpperCase() + type.slice(1)} ${identifier}`,
          caption: `Referenced as "${type.charAt(0).toUpperCase() + type.slice(1)} ${identifier}" in document`,
          pageNumber: pageNumber
        };
      }
    }
  }

  return null;
}

/**
 * ENHANCED: Resolves attachments with comprehensive diagnostics
 */
export async function resolveAttachments(
  nodes: ExtractedNode[],
  doc: StructuredDocument
): Promise<void> {
  console.log(`\n========================================`);
  console.log(`[ATTACHMENT_RESOLVER] Starting attachment resolution`);
  console.log(`[ATTACHMENT_RESOLVER] Document: ${doc.fileName}`);
  console.log(`[ATTACHMENT_RESOLVER] Nodes to process: ${nodes.length}`);

  // DIAGNOSTIC: Count figures/tables in document
  let docFigureCount = 0;
  let docTableCount = 0;
  let docEquationCount = 0;

  for (const section of doc.sections || []) {
    for (const content of section.content || []) {
      if (content.type === 'figure') docFigureCount++;
      if (content.type === 'table') docTableCount++;
      if (content.type === 'equation') docEquationCount++;
    }
  }

  console.log(`[ATTACHMENT_RESOLVER] Document structure contains:`);
  console.log(`  - Figures: ${docFigureCount}`);
  console.log(`  - Tables: ${docTableCount}`);
  console.log(`  - Equations: ${docEquationCount}`);

  if (docFigureCount === 0 && docTableCount === 0) {
    console.log(`[ATTACHMENT_RESOLVER] ⚠️  WARNING: No figures/tables found in document structure!`);
    console.log(`[ATTACHMENT_RESOLVER] PDF parsing may have failed to extract visual elements.`);
    console.log(`[ATTACHMENT_RESOLVER] Will create placeholders based on content mentions.`);
  }

  // Process each node
  let totalAttachmentsResolved = 0;
  let totalPlaceholdersCreated = 0;
  let nodesWithAttachments = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const contentText = node.content?.text || '';

    // Detect all attachment references
    const references = detectAttachmentReferences(contentText);

    if (references.length === 0) continue;

    console.log(`\n[ATTACHMENT_RESOLVER] Node ${i + 1}/${nodes.length}: "${node.title}"`);
    console.log(`[ATTACHMENT_RESOLVER]   Found ${references.length} reference(s): ${references.map(r => `${r.type} ${r.identifier}`).join(', ')}`);

    node.attachments = node.attachments || [];

    // Try to find each reference in document
    for (const ref of references) {
      const attachment = findAttachmentInDocument(doc, ref.type, ref.identifier);

      if (attachment) {
        // Real attachment found
        node.attachments.push({
          sourceId: doc.sourceId,
          fileName: attachment.fileName,
          pageRange: attachment.pageNumber > 0 ? [attachment.pageNumber, attachment.pageNumber] : undefined,
          relevance: `Referenced as "${ref.matchedText}" in node content`,
        });
        totalAttachmentsResolved++;
        console.log(`[ATTACHMENT_RESOLVER]   ✅ Linked ${ref.type} ${ref.identifier} (page ${attachment.pageNumber})`);
      } else {
        // Create placeholder if enabled
        if (CREATE_PLACEHOLDER_ATTACHMENTS) {
          node.attachments.push({
            sourceId: doc.sourceId,
            fileName: `${ref.type.charAt(0).toUpperCase() + ref.type.slice(1)} ${ref.identifier}`,
            pageRange: undefined,
            relevance: `Referenced as "${ref.matchedText}" in node content (placeholder - not found in document structure)`,
          });
          totalPlaceholdersCreated++;
          console.log(`[ATTACHMENT_RESOLVER]   ⚠️  Created placeholder for ${ref.type} ${ref.identifier}`);
        } else {
          console.log(`[ATTACHMENT_RESOLVER]   ❌ Could not find ${ref.type} ${ref.identifier} in document structure`);
        }
      }
    }

    if (node.attachments.length > 0) {
      nodesWithAttachments++;
    }
  }

  // Summary
  console.log(`\n[ATTACHMENT_RESOLVER] ========== SUMMARY ==========`);
  console.log(`[ATTACHMENT_RESOLVER] Nodes processed: ${nodes.length}`);
  console.log(`[ATTACHMENT_RESOLVER] Nodes with attachments: ${nodesWithAttachments}`);
  console.log(`[ATTACHMENT_RESOLVER] Real attachments resolved: ${totalAttachmentsResolved}`);
  console.log(`[ATTACHMENT_RESOLVER] Placeholders created: ${totalPlaceholdersCreated}`);
  console.log(`[ATTACHMENT_RESOLVER] Total attachments: ${totalAttachmentsResolved + totalPlaceholdersCreated}`);

  if (totalPlaceholdersCreated > totalAttachmentsResolved) {
    console.log(`[ATTACHMENT_RESOLVER] ⚠️  WARNING: More placeholders than real attachments!`);
    console.log(`[ATTACHMENT_RESOLVER] This suggests PDF parsing didn't extract figure/table metadata.`);
  }

  console.log(`[ATTACHMENT_RESOLVER] ========================================\n`);
}
