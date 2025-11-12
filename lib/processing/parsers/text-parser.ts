import { supabaseServer } from '../../supabase-server';
import { StructuredDocument, Section, ContentBlock } from './pdf-parser';

/**
 * Parse text/markdown files preserving structure
 */
export async function parseText(
  storagePath: string,
  sourceId: string,
  fileName: string,
  isMarkdown: boolean = false
): Promise<StructuredDocument> {
  try {
    // Download text file from storage
    const { data: textData, error: downloadError } = await supabaseServer.storage
      .from('user-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download text file: ${downloadError.message}`);
    }

    const rawText = await textData.text();

    let sections: Section[];

    if (isMarkdown) {
      sections = parseMarkdownStructure(rawText);
    } else {
      sections = parsePlainTextStructure(rawText);
    }

    return {
      type: 'text',
      sourceId,
      fileName,
      sections,
      metadata: {
        totalPages: sections.length || 1,
        wordCount: rawText.split(/\s+/).length,
        lineCount: rawText.split('\n').length,
        isMarkdown,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('Text parsing error:', error);
    throw new Error(`Failed to parse text file: ${error.message}`);
  }
}

/**
 * Parse Markdown preserving heading hierarchy
 */
function parseMarkdownStructure(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split('\n');
  
  let currentSection: Section | null = null;
  let currentContent: ContentBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for markdown heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent;
        sections.push(currentSection);
        currentContent = [];
      }

      // Create new section
      const level = headingMatch[1].length;
      currentSection = {
        level,
        title: headingMatch[2],
        content: [],
        pageRange: [sections.length + 1, sections.length + 1],
        sectionNumber: extractSectionNumber(headingMatch[2]),
      };
      continue;
    }

    // If no section yet, create a default one
    if (!currentSection) {
      currentSection = {
        level: 1,
        title: 'Content',
        content: [],
        pageRange: [1, 1],
      };
    }

    // Detect content type
    if (!trimmed) {
      // Empty line - potential section break
      if (currentContent.length > 0 && i < lines.length - 1 && lines[i + 1].trim()) {
        // Don't add empty block, but allow it as separator
        continue;
      }
    } else if (isNumberedList(trimmed)) {
      currentContent.push({
        type: 'list',
        content: trimmed,
        formatting: {
          isNumberedList: true,
          listLevel: getIndentLevel(line),
        },
        pageNumber: sections.length + 1,
      });
    } else if (isBulletList(trimmed)) {
      currentContent.push({
        type: 'list',
        content: trimmed,
        formatting: {
          isNumberedList: false,
          listLevel: getIndentLevel(line),
        },
        pageNumber: sections.length + 1,
      });
    } else if (isCodeBlock(markdown, i)) {
      // Extract code block
      const codeBlock = extractCodeBlock(markdown, i);
      if (codeBlock) {
        currentContent.push({
          type: 'code',
          content: codeBlock.content,
          pageNumber: sections.length + 1,
        });
        i += codeBlock.linesConsumed - 1; // Skip processed lines
      }
    } else {
      currentContent.push({
        type: 'text',
        content: trimmed,
        pageNumber: sections.length + 1,
      });
    }
  }

  // Add final section
  if (currentSection) {
    currentSection.content = currentContent;
    sections.push(currentSection);
  }

  // If no sections found, create one with all content
  if (sections.length === 0) {
    const allContent: ContentBlock[] = lines
      .filter(l => l.trim())
      .map(line => ({
        type: 'text' as const,
        content: line.trim(),
        pageNumber: 1,
      }));

    sections.push({
      level: 1,
      title: 'Content',
      content: allContent,
      pageRange: [1, 1],
    });
  }

  return sections;
}

/**
 * Parse plain text detecting structure
 */
function parsePlainTextStructure(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split('\n');
  
  let currentSection: Section | null = null;
  let currentContent: ContentBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      // Blank line - potential section break
      if (currentContent.length > 0 && i < lines.length - 1 && lines[i + 1].trim()) {
        continue;
      }
    }

    // Detect headings (ALL CAPS, short lines)
    if (trimmed === trimmed.toUpperCase() && 
        trimmed.length < 100 && 
        trimmed.length > 3 &&
        (i === 0 || lines[i - 1].trim() === '')) {
      
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        currentSection.content = currentContent;
        sections.push(currentSection);
        currentContent = [];
      }

      // Create new section
      currentSection = {
        level: 1,
        title: trimmed,
        content: [],
        pageRange: [sections.length + 1, sections.length + 1],
        sectionNumber: extractSectionNumber(trimmed),
      };
      continue;
    }

    // If no section yet, create a default one
    if (!currentSection) {
      currentSection = {
        level: 1,
        title: 'Content',
        content: [],
        pageRange: [1, 1],
      };
    }

    // Detect content type
    if (isNumberedList(trimmed)) {
      currentContent.push({
        type: 'list',
        content: trimmed,
        formatting: {
          isNumberedList: true,
          listLevel: getIndentLevel(line),
        },
        pageNumber: sections.length + 1,
      });
    } else if (isBulletList(trimmed)) {
      currentContent.push({
        type: 'list',
        content: trimmed,
        formatting: {
          isNumberedList: false,
          listLevel: getIndentLevel(line),
        },
        pageNumber: sections.length + 1,
      });
    } else {
      currentContent.push({
        type: 'text',
        content: trimmed,
        pageNumber: sections.length + 1,
      });
    }
  }

  // Add final section
  if (currentSection) {
    currentSection.content = currentContent;
    sections.push(currentSection);
  }

  // If no sections found, create one with all content
  if (sections.length === 0) {
    const allContent: ContentBlock[] = lines
      .filter(l => l.trim())
      .map(line => ({
        type: 'text' as const,
        content: line.trim(),
        pageNumber: 1,
      }));

    sections.push({
      level: 1,
      title: 'Content',
      content: allContent,
      pageRange: [1, 1],
    });
  }

  return sections;
}

/**
 * Helper functions
 */
function isNumberedList(line: string): boolean {
  return /^[\s]*(\d+[.)]|Step\s+\d+:|Procedure\s+\d+:)/i.test(line.trim());
}

function isBulletList(line: string): boolean {
  return /^[\s]*[-*•]\s+/.test(line.trim());
}

function getIndentLevel(line: string): number {
  const indentMatch = line.match(/^(\s*)/);
  return Math.floor((indentMatch?.[1].length || 0) / 2) + 1;
}

function isCodeBlock(markdown: string, lineIndex: number): boolean {
  const lines = markdown.split('\n');
  const line = lines[lineIndex];
  return line.trim().startsWith('```') || (line.trim().startsWith('    ') && lineIndex > 0);
}

function extractCodeBlock(markdown: string, startIndex: number): { content: string; linesConsumed: number } | null {
  const lines = markdown.split('\n');
  const startLine = lines[startIndex];

  if (startLine.trim().startsWith('```')) {
    // Fenced code block
    const language = startLine.trim().slice(3).trim();
    let endIndex = startIndex + 1;
    
    while (endIndex < lines.length && !lines[endIndex].trim().startsWith('```')) {
      endIndex++;
    }

    if (endIndex < lines.length) {
      const content = lines.slice(startIndex + 1, endIndex).join('\n');
      return {
        content,
        linesConsumed: endIndex - startIndex + 1,
      };
    }
  } else if (startLine.trim().startsWith('    ')) {
    // Indented code block
    let endIndex = startIndex;
    const codeLines: string[] = [];

    while (endIndex < lines.length && (lines[endIndex].trim().startsWith('    ') || lines[endIndex].trim() === '')) {
      if (lines[endIndex].trim()) {
        codeLines.push(lines[endIndex].replace(/^    /, ''));
      }
      endIndex++;
    }

    if (codeLines.length > 0) {
      return {
        content: codeLines.join('\n'),
        linesConsumed: endIndex - startIndex,
      };
    }
  }

  return null;
}

function extractSectionNumber(text: string): string | undefined {
  const match = text.match(/^((\d+\.?\s*)+)/);
  return match ? match[1].trim() : undefined;
}

