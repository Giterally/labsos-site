import type { ExtractedNode } from '@/lib/ai/schemas/workflow-extraction-schema';
import type { StructuredDocument, ContentBlock } from '@/lib/processing/parsers/pdf-parser';

/**
 * Resolves attachments for nodes by detecting figure/table references
 * and linking them to actual figures/tables in the document
 */
export async function resolveAttachments(
  nodes: ExtractedNode[],
  doc: StructuredDocument
): Promise<void> {
  console.log(`[ATTACHMENT_RESOLVER] Resolving attachments for ${nodes.length} nodes in document: ${doc.sourceId}`);

  for (const node of nodes) {
    const contentText = node.content.text || '';
    
    // Extract figure references (e.g., "Figure 1", "Fig. 2", "Figure 2a")
    const figureRefs = extractFigureReferences(contentText);
    
    // Extract table references (e.g., "Table 1", "Table 2a")
    const tableRefs = extractTableReferences(contentText);
    
    // Find figures in document
    if (figureRefs.length > 0) {
      const figures = findFiguresInDocument(doc, figureRefs);
      for (const figure of figures) {
        // Check if attachment already exists
        const existing = node.attachments.find(a => 
          a.sourceId === doc.sourceId && 
          a.fileName === figure.fileName
        );
        
        if (!existing) {
          node.attachments.push(figure);
          console.log(`[ATTACHMENT_RESOLVER] Added figure attachment: ${figure.fileName} to node: ${node.title}`);
        }
      }
    }
    
    // Find tables in document
    if (tableRefs.length > 0) {
      const tables = findTablesInDocument(doc, tableRefs);
      for (const table of tables) {
        // Check if attachment already exists
        const existing = node.attachments.find(a => 
          a.sourceId === doc.sourceId && 
          a.fileName === table.fileName
        );
        
        if (!existing) {
          node.attachments.push(table);
          console.log(`[ATTACHMENT_RESOLVER] Added table attachment: ${table.fileName} to node: ${node.title}`);
        }
      }
    }
  }
}

/**
 * Extract figure references from text
 */
function extractFigureReferences(text: string): string[] {
  const patterns = [
    /(?:Figure|Fig\.?)\s+(\d+[a-z]?)/gi,
    /\(Figure\s+(\d+[a-z]?)\)/gi,
    /\(Fig\.?\s+(\d+[a-z]?)\)/gi,
  ];
  
  const refs = new Set<string>();
  
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      refs.add(match[1] || match[0]);
    }
  }
  
  return Array.from(refs);
}

/**
 * Extract table references from text
 */
function extractTableReferences(text: string): string[] {
  const patterns = [
    /Table\s+(\d+[a-z]?)/gi,
    /\(Table\s+(\d+[a-z]?)\)/gi,
  ];
  
  const refs = new Set<string>();
  
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      refs.add(match[1] || match[0]);
    }
  }
  
  return Array.from(refs);
}

/**
 * Find figures in document matching the references
 */
function findFiguresInDocument(
  doc: StructuredDocument,
  figureRefs: string[]
): Array<{
  sourceId: string;
  fileName: string;
  pageRange?: [number, number];
  relevance: string;
}> {
  const attachments: Array<{
    sourceId: string;
    fileName: string;
    pageRange?: [number, number];
    relevance: string;
  }> = [];
  
  for (const ref of figureRefs) {
    const figNumMatch = ref.match(/(\d+[a-z]?)/i);
    if (!figNumMatch) continue;
    const figNum = figNumMatch[1];
    
    console.log(`[ATTACHMENT_RESOLVER] Searching for Figure ${figNum}...`);
    
    let found = false;
    
    // Strategy 1: Check if block.type is explicitly 'figure'
    for (const section of doc.sections) {
      for (const block of section.content) {
        const blockText = (block.content || '').toLowerCase();
        
        if (block.type === 'figure' && 
            (blockText.includes(`figure ${figNum.toLowerCase()}`) ||
             blockText.includes(`fig. ${figNum.toLowerCase()}`) ||
             blockText.includes(`fig ${figNum.toLowerCase()}`))) {
          
          attachments.push({
            sourceId: doc.sourceId,
            fileName: `Figure ${figNum}`,
            pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : undefined,
            relevance: `Referenced as "Figure ${figNum}" in node content`,
          });
          
          found = true;
          break;
        }
      }
      if (found) break;
    }
    
    // Strategy 2: FALLBACK - Search text content for figure caption patterns
    if (!found) {
      for (const section of doc.sections) {
        for (const block of section.content) {
          const blockText = (block.content || '').toLowerCase();
          
          const figurePatterns = [
            new RegExp(`figure\\s+${figNum}[a-z]?[.:]`, 'i'),
            new RegExp(`fig\\.?\\s+${figNum}[a-z]?[.:]`, 'i'),
            new RegExp(`\\(fig\\.?\\s+${figNum}[a-z]?\\)`, 'i')
          ];
          
          if (figurePatterns.some(pattern => pattern.test(blockText))) {
            attachments.push({
              sourceId: doc.sourceId,
              fileName: `Figure ${figNum}`,
              pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : undefined,
              relevance: `Referenced as "Figure ${figNum}" in node content`,
            });
            
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    
    if (!found) {
      console.warn(`[ATTACHMENT_RESOLVER] ⚠️  Could not find Figure ${figNum} for ref: ${ref}`);
    }
  }
  
  return attachments;
}

/**
 * Find tables in document matching the references
 */
function findTablesInDocument(
  doc: StructuredDocument,
  tableRefs: string[]
): Array<{
  sourceId: string;
  fileName: string;
  pageRange?: [number, number];
  relevance: string;
}> {
  const attachments: Array<{
    sourceId: string;
    fileName: string;
    pageRange?: [number, number];
    relevance: string;
  }> = [];
  
  for (const ref of tableRefs) {
    const tableNumMatch = ref.match(/(\d+[a-z]?)/i);
    if (!tableNumMatch) continue;
    const tableNum = tableNumMatch[1];
    
    console.log(`[ATTACHMENT_RESOLVER] Searching for Table ${tableNum}...`);
    
    let found = false;
    
    // Strategy 1: Check if block.type is explicitly 'table'
    for (const section of doc.sections) {
      for (const block of section.content) {
        const blockText = (block.content || '').toLowerCase();
        
        if (block.type === 'table' && 
            blockText.includes(`table ${tableNum.toLowerCase()}`)) {
          
          attachments.push({
            sourceId: doc.sourceId,
            fileName: `Table ${tableNum}`,
            pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : undefined,
            relevance: `Referenced as "Table ${tableNum}" in node content`,
          });
          
          found = true;
          break;
        }
      }
      if (found) break;
    }
    
    // Strategy 2: FALLBACK - Search text content for table caption patterns
    if (!found) {
      for (const section of doc.sections) {
        for (const block of section.content) {
          const blockText = (block.content || '').toLowerCase();
          
          const tablePatterns = [
            new RegExp(`table\\s+${tableNum}[a-z]?[.:]`, 'i'),
            new RegExp(`\\(table\\s+${tableNum}[a-z]?\\)`, 'i')
          ];
          
          if (tablePatterns.some(pattern => pattern.test(blockText))) {
            attachments.push({
              sourceId: doc.sourceId,
              fileName: `Table ${tableNum}`,
              pageRange: block.pageNumber ? [block.pageNumber, block.pageNumber] : undefined,
              relevance: `Referenced as "Table ${tableNum}" in node content`,
            });
            
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    
    if (!found) {
      console.warn(`[ATTACHMENT_RESOLVER] ⚠️  Could not find Table ${tableNum} for ref: ${ref}`);
    }
  }
  
  return attachments;
}
