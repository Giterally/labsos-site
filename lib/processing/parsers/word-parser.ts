import { supabaseServer } from '../../supabase-server';
import { StructuredDocument, Section, ContentBlock } from './pdf-parser';
import * as mammoth from 'mammoth';

/**
 * Parse Word (.docx) file preserving hierarchical structure
 */
export async function parseWord(
  storagePath: string,
  sourceId: string,
  fileName: string
): Promise<StructuredDocument> {
  try {
    // Download Word file from storage
    const { data: wordData, error: downloadError } = await supabaseServer.storage
      .from('user-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download Word file: ${downloadError.message}`);
    }

    // Convert to buffer
    const wordBuffer = await wordData.arrayBuffer();
    const buffer = Buffer.from(wordBuffer);

    console.log(`[WORD_PARSER] Parsing Word document: ${fileName} (${buffer.length} bytes)`);

    // Convert Word document to HTML using mammoth
    // This preserves structure better than plain text
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;
    const messages = result.messages;

    if (messages.length > 0) {
      console.log(`[WORD_PARSER] Mammoth conversion messages:`, messages);
    }

    // Convert HTML to structured sections
    const sections = parseWordStructure(html);

    // Extract metadata if available
    const metadata = await mammoth.extractRawText({ buffer });
    const wordCount = metadata.value.split(/\s+/).filter(w => w.length > 0).length;

    return {
      type: 'text', // Use 'text' type for Word documents
      sourceId,
      fileName,
      sections,
      metadata: {
        totalPages: sections.length || 1,
        wordCount,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('Word parsing error:', error);
    throw new Error(`Failed to parse Word file: ${error.message}`);
  }
}

/**
 * Parse HTML from Word document into structured sections
 */
function parseWordStructure(html: string): Section[] {
  const sections: Section[] = [];
  
  // Parse HTML to extract headings and content
  // Mammoth converts Word headings to <h1>, <h2>, etc.
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi;
  const listRegex = /<ul[^>]*>(.*?)<\/ul>|<ol[^>]*>(.*?)<\/ol>/gi;
  const tableRegex = /<table[^>]*>(.*?)<\/table>/gi;

  // Extract all headings with their positions
  const headingMatches: Array<{ level: number; title: string; position: number }> = [];
  let match;
  
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const title = stripHtmlTags(match[2]).trim();
    if (title) {
      headingMatches.push({
        level,
        title,
        position: match.index,
      });
    }
  }

  // If no headings found, treat entire document as one section
  if (headingMatches.length === 0) {
    const contentBlocks = parseContentBlocks(html);
    
    return [{
      level: 1,
      title: 'Content',
      content: contentBlocks,
      pageRange: [1, 1],
    }];
  }

  // Create sections based on headings
  for (let i = 0; i < headingMatches.length; i++) {
    const heading = headingMatches[i];
    const nextHeading = headingMatches[i + 1];
    
    // Extract content between this heading and the next
    const startPos = heading.position;
    const endPos = nextHeading ? nextHeading.position : html.length;
    const sectionHtml = html.substring(startPos, endPos);

    // Extract content blocks from this section
    const contentBlocks = parseContentBlocks(sectionHtml);

    sections.push({
      level: heading.level,
      title: heading.title,
      content: contentBlocks,
      pageRange: [i + 1, i + 1],
      sectionNumber: extractSectionNumber(heading.title),
    });
  }

  // If no sections created, create a default one
  if (sections.length === 0) {
    const contentBlocks = parseContentBlocks(html);
    sections.push({
      level: 1,
      title: 'Content',
      content: contentBlocks,
      pageRange: [1, 1],
    });
  }

  return sections;
}

/**
 * Parse HTML content into content blocks (text, lists, tables)
 */
function parseContentBlocks(html: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  
  // Split by paragraph tags
  const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi;
  const listRegex = /<(ul|ol)[^>]*>(.*?)<\/\1>/gi;
  const tableRegex = /<table[^>]*>(.*?)<\/table>/gi;

  // Extract tables first (they take priority)
  const tableMatches: Array<{ content: string; position: number }> = [];
  let match;
  
  while ((match = tableRegex.exec(html)) !== null) {
    const tableContent = stripHtmlTags(match[1]);
    tableMatches.push({
      content: tableContent,
      position: match.index,
    });
  }

  // Extract lists
  const listMatches: Array<{ content: string; position: number; isOrdered: boolean }> = [];
  while ((match = listRegex.exec(html)) !== null) {
    const listContent = stripHtmlTags(match[2] || match[3]);
    listMatches.push({
      content: listContent,
      position: match.index,
      isOrdered: match[1] === 'ol',
    });
  }

  // Extract paragraphs
  const paragraphMatches: Array<{ content: string; position: number }> = [];
  while ((match = paragraphRegex.exec(html)) !== null) {
    const paraContent = stripHtmlTags(match[1]).trim();
    if (paraContent && !paraContent.match(/^\s*$/)) {
      paragraphMatches.push({
        content: paraContent,
        position: match.index,
      });
    }
  }

  // Combine all matches and sort by position
  const allMatches: Array<{ content: string; position: number; type: 'text' | 'list' | 'table'; isOrdered?: boolean }> = [
    ...paragraphMatches.map(m => ({ ...m, type: 'text' as const })),
    ...listMatches.map(m => ({ ...m, type: 'list' as const, isOrdered: m.isOrdered })),
    ...tableMatches.map(m => ({ ...m, type: 'table' as const })),
  ].sort((a, b) => a.position - b.position);

  // Convert to content blocks
  for (const match of allMatches) {
    if (match.type === 'table') {
      blocks.push({
        type: 'table',
        content: match.content,
        pageNumber: 1,
      });
    } else if (match.type === 'list') {
      blocks.push({
        type: 'list',
        content: match.content,
        formatting: {
          isNumberedList: match.isOrdered || false,
          listLevel: 1,
        },
        pageNumber: 1,
      });
    } else {
      blocks.push({
        type: 'text',
        content: match.content,
        pageNumber: 1,
      });
    }
  }

  // If no blocks found, extract all text
  if (blocks.length === 0) {
    const text = stripHtmlTags(html).trim();
    if (text) {
      blocks.push({
        type: 'text',
        content: text,
        pageNumber: 1,
      });
    }
  }

  return blocks;
}

/**
 * Strip HTML tags from text
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp;
    .replace(/&amp;/g, '&') // Replace &amp;
    .replace(/&lt;/g, '<') // Replace &lt;
    .replace(/&gt;/g, '>') // Replace &gt;
    .replace(/&quot;/g, '"') // Replace &quot;
    .replace(/&#39;/g, "'") // Replace &#39;
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extract section number from heading text
 */
function extractSectionNumber(text: string): string | undefined {
  const match = text.match(/^((\d+\.?\s*)+)/);
  return match ? match[1].trim() : undefined;
}


