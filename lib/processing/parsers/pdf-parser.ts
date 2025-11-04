import { supabaseServer } from '../../supabase-server';
import { Buffer } from 'buffer';

export interface StructuredDocument {
  type: 'pdf' | 'excel' | 'video' | 'text';
  sourceId: string;
  fileName: string;
  sections: Section[];
  metadata: {
    totalPages: number;
    author?: string;
    createdDate?: string;
    [key: string]: any;
  };
}

export interface Section {
  level: number; // 1=main heading, 2=subheading, etc.
  title: string;
  content: ContentBlock[];
  pageRange: [number, number];
  sectionNumber?: string; // e.g., "1.2.3"
}

export interface ContentBlock {
  type: 'text' | 'list' | 'table' | 'figure' | 'code';
  content: string;
  formatting?: {
    isBold?: boolean;
    isItalic?: boolean;
    isNumberedList?: boolean;
    listLevel?: number;
  };
  pageNumber: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

/**
 * Parse PDF file preserving hierarchical structure
 */
export async function parsePDF(
  storagePath: string,
  sourceId: string,
  fileName: string
): Promise<StructuredDocument> {
  try {
    // Download PDF file from storage
    const { data: pdfData, error: downloadError } = await supabaseServer.storage
      .from('project-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download PDF file: ${downloadError.message}`);
    }

    // Convert PDF buffer to text
    console.log(`[PDF_PARSER] Downloading PDF buffer for ${fileName}...`);
    const pdfBuffer = await pdfData.arrayBuffer();
    console.log(`[PDF_PARSER] PDF buffer size: ${pdfBuffer.byteLength} bytes`);
    
    // Ensure Buffer is available (Node.js runtime required)
    if (typeof Buffer === 'undefined') {
      throw new Error('Buffer is not available. PDF parsing requires Node.js runtime. Ensure API route has `export const runtime = "nodejs"`.');
    }
    
    console.log(`[PDF_PARSER] Importing pdf-parse library...`);
    
    // Load our vendored pdf-parse wrapper that bypasses the debug code issue
    // This wrapper loads pdf-parse/lib/pdf-parse.js directly, bypassing index.js
    let pdf: any;
    try {
      pdf = require('../../vendors/pdf-parse-fixed');
      console.log('[PDF_PARSER] Successfully loaded pdf-parse via vendored wrapper');
    } catch (error: any) {
      console.error('[PDF_PARSER] Failed to load pdf-parse library:', error);
      throw new Error(`Failed to load pdf-parse library: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    console.log(`[PDF_PARSER] Parsing PDF with pdf-parse...`);
    console.log(`[PDF_PARSER] PDF buffer size: ${pdfBuffer.byteLength} bytes`);
    
    // Wrap PDF parsing in a timeout to prevent hanging (max 90 seconds for parsing)
    // Using a shorter timeout and ensuring it actually works
    const TIMEOUT_MS = 90 * 1000; // 90 seconds
    let timeoutId: NodeJS.Timeout | null = null;
    
    const parseWithTimeout = (buffer: Buffer): Promise<any> => {
      return Promise.race([
        pdf(buffer).then((result: any) => {
          if (timeoutId) clearTimeout(timeoutId);
          console.log(`[PDF_PARSER] pdf-parse returned successfully`);
          return result;
        }).catch((err: any) => {
          if (timeoutId) clearTimeout(timeoutId);
          console.error(`[PDF_PARSER] pdf-parse threw an error:`, err);
          throw err;
        }),
        new Promise<any>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('PDF parsing timed out after 90 seconds. The PDF may be corrupted or too large. Please try a different PDF file.'));
          }, TIMEOUT_MS);
        })
      ]);
    };
    
    console.log(`[PDF_PARSER] Starting parseWithTimeout...`);
    const pdfInfo = await parseWithTimeout(Buffer.from(pdfBuffer));
    console.log(`[PDF_PARSER] PDF parsed successfully: ${pdfInfo.numpages} pages, ${pdfInfo.text.length} characters`);

    let text = pdfInfo.text;
    const pageCount = pdfInfo.numpages;
    const metadata = pdfInfo.info || {};

    // CRITICAL FIX: Reconstruct missing spaces in PDF text
    // pdf-parse often loses spaces between words, especially with custom fonts
    console.log(`[PDF_PARSER] Raw text length: ${text.length} chars`);
    text = reconstructSpaces(text);
    console.log(`[PDF_PARSER] Fixed text length: ${text.length} chars`);

    // Parse text into structured sections
    let sections = parsePDFStructure(text, pageCount);
    console.log(`[PDF_PARSER] Initial sections: ${sections.length}`);
    
    // Filter out noisy sections (headers, footers, page numbers)
    sections = filterNoisySections(sections);
    console.log(`[PDF_PARSER] After filtering noise: ${sections.length} sections`);
    
    // Merge very small sections into larger coherent blocks
    sections = mergeSmallSections(sections);
    console.log(`[PDF_PARSER] After merging: ${sections.length} sections`);

    return {
      type: 'pdf',
      sourceId,
      fileName,
      sections,
      metadata: {
        totalPages: pageCount,
        author: metadata.Author,
        createdDate: metadata.CreationDate,
        title: metadata.Title,
        subject: metadata.Subject,
        wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('PDF parsing error:', error);
    throw new Error(`Failed to parse PDF file: ${error.message}`);
  }
}

/**
 * Reconstruct missing spaces in PDF text
 * pdf-parse often loses spaces between words, especially with custom fonts or complex layouts
 */
function reconstructSpaces(text: string): string {
  // Pattern 1: lowercase letter followed by uppercase letter (word boundary)
  // "wordAnother" → "word Another"
  text = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Pattern 2: letter followed by number
  // "page1" → "page 1"
  text = text.replace(/([a-zA-Z])(\d)/g, '$1 $2');
  
  // Pattern 3: number followed by letter (but not scientific notation)
  // "1page" → "1 page", but "1.5e10" stays as is
  text = text.replace(/(\d)([a-zA-Z])/g, '$1 $2');
  
  // Pattern 4: Multiple consecutive capital letters followed by lowercase
  // "USAtoday" → "USA today"
  text = text.replace(/([A-Z]{2,})([a-z])/g, '$1 $2');
  
  // Pattern 5: Common word boundaries (heuristic approach)
  // This catches patterns like "theexperiment" → "the experiment"
  const commonWords = [
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'were', 'have',
    'their', 'which', 'between', 'these', 'under', 'into', 'over', 'than',
    'also', 'could', 'would', 'should', 'about', 'after', 'before',
    'method', 'methods', 'results', 'result', 'conclusion', 'discussion',
    'introduction', 'abstract', 'background', 'objectives', 'objective'
  ];
  
  // Create regex pattern for common words
  for (const word of commonWords) {
    // Match word at start of a sequence: "theexperiment" → "the experiment"
    const startPattern = new RegExp(`(^|\\s)${word}([a-z])`, 'gi');
    text = text.replace(startPattern, `$1${word} $2`);
    
    // Match word at end of a sequence: "experimentthe" → "experiment the"
    const endPattern = new RegExp(`([a-z])${word}($|\\s)`, 'gi');
    text = text.replace(endPattern, `$1 ${word}$2`);
  }
  
  // Pattern 6: Common scientific abbreviations followed by words
  // "et al." → "et al. " (already has space, but ensure it's preserved)
  const abbreviations = ['et al', 'i.e.', 'e.g.', 'vs.', 'Dr.', 'Mr.', 'Ms.', 'Prof.'];
  for (const abbr of abbreviations) {
    const abbrPattern = new RegExp(`(${abbr.replace('.', '\\.')})([a-zA-Z])`, 'gi');
    text = text.replace(abbrPattern, `$1 $2`);
  }
  
  // Pattern 7: Fix spacing around punctuation (but preserve existing spacing)
  // "word,word" → "word, word" (but "word, word" stays as is)
  text = text.replace(/([a-zA-Z])([,;:])([a-zA-Z])/g, '$1$2 $3');
  
  // Clean up multiple spaces
  text = text.replace(/\s{3,}/g, '  ');
  
  return text;
}

/**
 * Detect and filter out page headers, footers, and other noise sections
 */
function isNoisySection(section: Section): boolean {
  const title = section.title.toLowerCase();
  const contentText = section.content.map(b => b.content).join(' ').toLowerCase();
  const combined = title + ' ' + contentText;
  
  // Pattern 1: Page numbers and references (e.g., "2 / 14", "Page 3")
  if (/^\d+\s*\/\s*\d+$/.test(section.title.trim())) return true;
  if (/^page\s+\d+/i.test(title)) return true;
  if (/^\d+\s*\/\s*\d+/.test(title)) return true;
  
  // Pattern 2: DOI and URL patterns (common in headers/footers)
  if (/doi\.org|https?:\/\/|plosone|journal\.|doi:|doi\s*:/.test(combined)) {
    // But allow if it's in actual content (longer section)
    if (contentText.length < 200) return true;
  }
  
  // Pattern 3: Very short fragments (likely page artifacts)
  const totalContentLength = section.content.reduce((sum, block) => sum + block.content.length, 0);
  if (section.title.trim().length < 3 && totalContentLength < 10) return true;
  
  // Pattern 4: Only punctuation, numbers, or special chars
  if (/^[0-9\s\.,;:\-\/\(\)]+$/.test(section.title.trim()) && totalContentLength < 50) return true;
  
  // Pattern 5: Date patterns in headers/footers
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/i.test(combined)) {
    if (totalContentLength < 100) return true;
  }
  
  // Pattern 6: Page number references (e.g., "December 5, 2018 2 / 14")
  if (/december|november|january|february|march|april|may|june|july|august|september|october/i.test(title)) {
    if (/\d+\s*\/\s*\d+/.test(combined) && totalContentLength < 100) return true;
  }
  
  // Pattern 7: Very short titles that are just numbers or equations
  if (/^[=<>≤≥\+\-]?\s*\d+[.,]?\d*\s*$/.test(section.title.trim())) {
    if (totalContentLength < 30) return true;
  }
  
  return false;
}

/**
 * Filter out noisy sections from the parsed document
 */
function filterNoisySections(sections: Section[]): Section[] {
  return sections.filter(section => {
    const isNoise = isNoisySection(section);
    if (isNoise) {
      console.log(`[PDF_PARSER] Filtering noisy section: "${section.title}" (${section.content.length} blocks)`);
    }
    return !isNoise;
  });
}

/**
 * Merge very small adjacent sections into larger coherent blocks
 */
function mergeSmallSections(sections: Section[]): Section[] {
  const MIN_SECTION_LENGTH = 150; // Minimum characters for a standalone section
  const merged: Section[] = [];
  
  let currentSection: Section | null = null;
  
  for (const section of sections) {
    const totalLength = section.content.reduce((sum, block) => sum + block.content.length, 0);
    
    // If section is long enough, add it
    if (totalLength >= MIN_SECTION_LENGTH) {
      if (currentSection) {
        merged.push(currentSection);
        currentSection = null;
      }
      merged.push(section);
    } else {
      // Accumulate small sections
      if (!currentSection) {
        currentSection = {
          ...section,
          title: section.title || 'Content',
        };
      } else {
        // Merge into current accumulator
        currentSection.content.push(...section.content);
        // Keep the more descriptive title
        if (section.title.length > currentSection.title.length && 
            section.title.length > 5 && 
            !isNoisySection({ ...section, content: [] })) {
          currentSection.title = section.title;
        }
        // Update page range
        currentSection.pageRange[1] = section.pageRange[1];
      }
      
      // If accumulated content is now large enough, flush it
      const accumulatedLength = currentSection.content.reduce((sum, block) => sum + block.content.length, 0);
      if (accumulatedLength >= MIN_SECTION_LENGTH) {
        merged.push(currentSection);
        currentSection = null;
      }
    }
  }
  
  // Add any remaining accumulated content
  if (currentSection && currentSection.content.length > 0) {
    const finalLength = currentSection.content.reduce((sum, block) => sum + block.content.length, 0);
    if (finalLength >= 50) { // Minimum threshold for final section
      merged.push(currentSection);
    }
  }
  
  return merged;
}

/**
 * Parse PDF text into hierarchical sections with preserved structure
 */
function parsePDFStructure(text: string, totalPages: number): Section[] {
  const sections: Section[] = [];
  const lines = text.split('\n');
  
  let currentSection: Section | null = null;
  let currentLevel = 0;
  let currentPage = 1; // Approximate page tracking
  let pageCounter = 0;
  const linesPerPage = Math.ceil(lines.length / totalPages);

  // Detect headings (lines that are larger, bold, or followed by whitespace)
  function detectHeading(line: string, index: number): { isHeading: boolean; level: number } {
    const trimmed = line.trim();
    if (!trimmed) return { isHeading: false, level: 0 };

    // Check for numbered headings (e.g., "1. Introduction", "1.2.3 Section")
    const numberedHeading = trimmed.match(/^(\d+\.?\s*)+[A-Z]/);
    if (numberedHeading) {
      const level = (numberedHeading[0].match(/\./g) || []).length + 1;
      return { isHeading: true, level: Math.min(level, 5) };
    }

    // Check for ALL CAPS (likely heading)
    if (trimmed === trimmed.toUpperCase() && trimmed.length < 100 && trimmed.length > 3) {
      return { isHeading: true, level: 1 };
    }

    // Check if line is short and followed by blank line (likely heading)
    if (trimmed.length < 100 && index < lines.length - 1 && lines[index + 1].trim() === '') {
      // Check for common heading patterns
      if (trimmed.match(/^(Chapter|Section|Part|Appendix)\s+\d+/i)) {
        return { isHeading: true, level: 1 };
      }
      if (trimmed.match(/^\d+\.\s+[A-Z]/)) {
        return { isHeading: true, level: 2 };
      }
      // Short line with capitalized words
      if (trimmed.split(/\s+/).length <= 10 && trimmed.match(/^[A-Z]/)) {
        return { isHeading: true, level: 2 };
      }
    }

    return { isHeading: false, level: 0 };
  }

  // Detect numbered lists
  function isNumberedList(line: string): boolean {
    return /^[\s]*(\d+[.)]|Step\s+\d+:|Procedure\s+\d+:)/i.test(line.trim());
  }

  // Detect bullet lists
  function isBulletList(line: string): boolean {
    return /^[\s]*[-*•]\s+/.test(line.trim());
  }

  // Detect code blocks (monospace-like patterns)
  function isCodeBlock(line: string): boolean {
    return /^\s{4,}|^\t/.test(line) || /[{}();]/.test(line) && line.length < 100;
  }

  // Detect tables (multiple columns separated by spaces)
  function isTableRow(line: string): boolean {
    const columns = line.split(/\s{2,}|\t/);
    return columns.length >= 3 && columns.every(col => col.trim().length > 0);
  }

  // Extract section number from heading
  function extractSectionNumber(text: string): string | undefined {
    const match = text.match(/^((\d+\.?\s*)+)/);
    return match ? match[1].trim() : undefined;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    pageCounter++;
    if (pageCounter >= linesPerPage) {
      currentPage = Math.min(currentPage + 1, totalPages);
      pageCounter = 0;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for heading
    const headingCheck = detectHeading(trimmed, i);
    if (headingCheck.isHeading) {
      // Save previous section if exists
      if (currentSection && currentSection.content.length > 0) {
        sections.push(currentSection);
      }

      // Create new section
      const sectionNumber = extractSectionNumber(trimmed);
      currentSection = {
        level: headingCheck.level,
        title: trimmed,
        content: [],
        pageRange: [currentPage, currentPage],
        sectionNumber,
      };
      currentLevel = headingCheck.level;
      continue;
    }

    // If no section yet, create a default one
    if (!currentSection) {
      currentSection = {
        level: 1,
        title: 'Introduction',
        content: [],
        pageRange: [1, 1],
      };
    }

    // Update page range
    currentSection.pageRange[1] = currentPage;

    // Detect content type
    let blockType: ContentBlock['type'] = 'text';
    let formatting: ContentBlock['formatting'] = {};

    if (isNumberedList(trimmed)) {
      blockType = 'list';
      formatting.isNumberedList = true;
      // Extract list level from indentation
      const indentMatch = line.match(/^(\s*)/);
      formatting.listLevel = Math.floor((indentMatch?.[1].length || 0) / 2) + 1;
    } else if (isBulletList(trimmed)) {
      blockType = 'list';
      formatting.isNumberedList = false;
      const indentMatch = line.match(/^(\s*)/);
      formatting.listLevel = Math.floor((indentMatch?.[1].length || 0) / 2) + 1;
    } else if (isTableRow(trimmed)) {
      blockType = 'table';
    } else if (isCodeBlock(trimmed)) {
      blockType = 'code';
    }

    // Add content block
    currentSection.content.push({
      type: blockType,
      content: trimmed,
      formatting,
      pageNumber: currentPage,
    });
  }

  // Add final section
  if (currentSection && currentSection.content.length > 0) {
    sections.push(currentSection);
  }

  // If no sections found, create one with all content
  if (sections.length === 0) {
    const allContent: ContentBlock[] = [];
    for (const line of lines) {
      if (line.trim()) {
        allContent.push({
          type: 'text',
          content: line.trim(),
          pageNumber: Math.floor((allContent.length / linesPerPage) + 1),
        });
      }
    }
    sections.push({
      level: 1,
      title: 'Content',
      content: allContent,
      pageRange: [1, totalPages],
    });
  }

  return sections;
}

