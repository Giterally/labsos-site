/**
 * Semantic Chunking System
 * 
 * Implements hierarchical splitting with semantic boundaries to preserve
 * document structure and prevent breaking protocols, tables, and code blocks.
 */

import { countTokens } from '../ai/embeddings';

export interface SemanticChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
  minChunkSize?: number;
  preserveStructure?: boolean;
}

export interface SemanticChunk {
  id: string;
  text: string;
  tokenCount: number;
  metadata: {
    sourceType: string;
    sourceRef: any;
    chunkIndex: number;
    totalChunks: number;
    startLine: number;
    endLine: number;
    startChar: number;
    endChar: number;
    headerHierarchy?: string[];
    structureFlags: {
      containsTable: boolean;
      containsCode: boolean;
      containsNumberedList: boolean;
      isProtocol: boolean;
    };
    continuationInfo?: {
      continuesFrom?: string; // Previous chunk ID
      continuesTo?: string;   // Next chunk ID
    };
  };
}

interface ProtectedRegion {
  type: 'table' | 'code' | 'numbered_list' | 'equation';
  startIndex: number;
  endIndex: number;
  content: string;
}

const DEFAULT_OPTIONS: SemanticChunkOptions = {
  maxTokens: 1000,
  overlapTokens: 150,
  minChunkSize: 100,
  preserveStructure: true,
};

/**
 * Main semantic chunking function with hierarchical splitting
 */
export function chunkTextSemantically(
  text: string,
  sourceType: string,
  sourceRef: any,
  options: SemanticChunkOptions = {}
): SemanticChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Identify and mark protected regions
  const protectedRegions = identifyProtectedRegions(text);
  
  // Detect document type for specialized strategies
  const docType = detectDocumentType(text, sourceType);
  
  // Apply document-type specific chunking strategy
  switch (docType) {
    case 'scientific_paper':
      return chunkScientificPaper(text, sourceType, sourceRef, opts, protectedRegions);
    case 'protocol':
      return chunkProtocol(text, sourceType, sourceRef, opts, protectedRegions);
    case 'code':
      return chunkCodeDocument(text, sourceType, sourceRef, opts, protectedRegions);
    default:
      return chunkGenericDocument(text, sourceType, sourceRef, opts, protectedRegions);
  }
}

/**
 * Identify protected regions that should never be split
 */
function identifyProtectedRegions(text: string): ProtectedRegion[] {
  const regions: ProtectedRegion[] = [];
  
  // Find code blocks (``` markers)
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    regions.push({
      type: 'code',
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      content: match[0],
    });
  }
  
  // Find tables (markdown tables)
  const tableRegex = /(\|[^\n]+\|[\n\r]+)+/g;
  while ((match = tableRegex.exec(text)) !== null) {
    // Only consider it a table if it has multiple rows
    const rows = match[0].split(/[\n\r]+/).filter(r => r.trim());
    if (rows.length >= 2) {
      regions.push({
        type: 'table',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        content: match[0],
      });
    }
  }
  
  // Find numbered lists (1. 2. 3. pattern)
  const numberedListRegex = /(?:^\d+\.\s+.+$[\n\r]*)+/gm;
  while ((match = numberedListRegex.exec(text)) !== null) {
    const listItems = match[0].split(/[\n\r]+/).filter(line => /^\d+\./.test(line.trim()));
    if (listItems.length >= 3) { // Only protect lists with 3+ items
      regions.push({
        type: 'numbered_list',
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        content: match[0],
      });
    }
  }
  
  // Find equations ($$ markers)
  const equationRegex = /\$\$[\s\S]*?\$\$/g;
  while ((match = equationRegex.exec(text)) !== null) {
    regions.push({
      type: 'equation',
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      content: match[0],
    });
  }
  
  // Sort regions by start index
  return regions.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Detect document type for specialized handling
 */
function detectDocumentType(text: string, sourceType: string): string {
  if (sourceType === 'github' || sourceType === 'code') return 'code';
  
  // Check for scientific paper indicators
  const scientificIndicators = ['abstract', 'introduction', 'methods', 'results', 'discussion', 'references'];
  const lowerText = text.toLowerCase();
  const scientificScore = scientificIndicators.filter(ind => lowerText.includes(ind)).length;
  if (scientificScore >= 4) return 'scientific_paper';
  
  // Check for protocol indicators
  const protocolIndicators = ['protocol', 'procedure', 'materials', 'reagents', 'step 1', 'step 2'];
  const protocolScore = protocolIndicators.filter(ind => lowerText.includes(ind)).length;
  if (protocolScore >= 3) return 'protocol';
  
  return 'generic';
}

/**
 * Chunk a scientific paper respecting section structure
 */
function chunkScientificPaper(
  text: string,
  sourceType: string,
  sourceRef: any,
  opts: SemanticChunkOptions,
  protectedRegions: ProtectedRegion[]
): SemanticChunk[] {
  // Split by major sections first
  const sections = splitByHeaders(text, ['#', '##']);
  return hierarchicalChunking(sections, text, sourceType, sourceRef, opts, protectedRegions);
}

/**
 * Chunk a protocol keeping numbered steps together
 */
function chunkProtocol(
  text: string,
  sourceType: string,
  sourceRef: any,
  opts: SemanticChunkOptions,
  protectedRegions: ProtectedRegion[]
): SemanticChunk[] {
  // Protocols need special handling to keep step sequences together
  const sections = splitByHeaders(text, ['#', '##', '###']);
  return hierarchicalChunking(sections, text, sourceType, sourceRef, opts, protectedRegions, {
    keepNumberedListsTogether: true,
  });
}

/**
 * Chunk code document keeping functions together
 */
function chunkCodeDocument(
  text: string,
  sourceType: string,
  sourceRef: any,
  opts: SemanticChunkOptions,
  protectedRegions: ProtectedRegion[]
): SemanticChunk[] {
  // For code, split between functions/classes
  const sections = splitCodeIntoFunctions(text);
  return hierarchicalChunking(sections, text, sourceType, sourceRef, opts, protectedRegions);
}

/**
 * Generic document chunking with hierarchical splitting
 */
function chunkGenericDocument(
  text: string,
  sourceType: string,
  sourceRef: any,
  opts: SemanticChunkOptions,
  protectedRegions: ProtectedRegion[]
): SemanticChunk[] {
  const sections = splitByHeaders(text, ['#', '##', '###']);
  return hierarchicalChunking(sections, text, sourceType, sourceRef, opts, protectedRegions);
}

/**
 * Split text by markdown headers
 */
function splitByHeaders(text: string, headerLevels: string[]): Array<{ text: string; header?: string; level: number }> {
  const sections: Array<{ text: string; header?: string; level: number }> = [];
  const lines = text.split(/\r?\n/);
  
  let currentSection = '';
  let currentHeader: string | undefined;
  let currentLevel = 0;
  
  for (const line of lines) {
    // Check if this line is a header
    let isHeader = false;
    let headerLevel = 0;
    
    for (const level of headerLevels) {
      const pattern = new RegExp(`^${level.replace(/#/g, '\\#')}\\s+(.+)$`);
      const match = line.match(pattern);
      if (match) {
        isHeader = true;
        headerLevel = level.length;
        
        // Save previous section
        if (currentSection.trim()) {
          sections.push({
            text: currentSection.trim(),
            header: currentHeader,
            level: currentLevel,
          });
        }
        
        // Start new section
        currentSection = line + '\n';
        currentHeader = match[1];
        currentLevel = headerLevel;
        break;
      }
    }
    
    if (!isHeader) {
      currentSection += line + '\n';
    }
  }
  
  // Add final section
  if (currentSection.trim()) {
    sections.push({
      text: currentSection.trim(),
      header: currentHeader,
      level: currentLevel,
    });
  }
  
  return sections;
}

/**
 * Split code into functions/classes
 */
function splitCodeIntoFunctions(code: string): Array<{ text: string; header?: string; level: number }> {
  const functions: Array<{ text: string; header?: string; level: number }> = [];
  const lines = code.split(/\r?\n/);
  
  let currentFunction = '';
  let currentName: string | undefined;
  let braceDepth = 0;
  let inFunction = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect function/class definition
    const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|def)\s+(\w+)/);
    if (funcMatch && !inFunction) {
      // Save previous function
      if (currentFunction.trim()) {
        functions.push({
          text: currentFunction.trim(),
          header: currentName,
          level: 1,
        });
      }
      
      // Start new function
      currentFunction = line + '\n';
      currentName = funcMatch[1];
      inFunction = true;
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    } else if (inFunction) {
      currentFunction += line + '\n';
      braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      
      // End of function when braces balance
      if (braceDepth === 0 && trimmed.length > 0) {
        functions.push({
          text: currentFunction.trim(),
          header: currentName,
          level: 1,
        });
        currentFunction = '';
        currentName = undefined;
        inFunction = false;
      }
    } else {
      currentFunction += line + '\n';
    }
  }
  
  // Add final function
  if (currentFunction.trim()) {
    functions.push({
      text: currentFunction.trim(),
      header: currentName,
      level: 1,
    });
  }
  
  return functions;
}

/**
 * Hierarchical chunking with semantic boundaries
 */
function hierarchicalChunking(
  sections: Array<{ text: string; header?: string; level: number }>,
  fullText: string,
  sourceType: string,
  sourceRef: any,
  opts: SemanticChunkOptions,
  protectedRegions: ProtectedRegion[],
  specialRules: { keepNumberedListsTogether?: boolean } = {}
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  const headerStack: string[] = [];
  
  for (const section of sections) {
    const sectionTokens = countTokens(section.text);
    
    // Update header hierarchy
    if (section.header) {
      // Pop headers at same or lower level
      while (headerStack.length >= section.level) {
        headerStack.pop();
      }
      headerStack.push(section.header);
    }
    
    // If section fits in one chunk, add it directly
    if (sectionTokens <= opts.maxTokens!) {
      chunks.push(createSemanticChunk(
        section.text,
        fullText,
        sourceType,
        sourceRef,
        chunks.length,
        [...headerStack],
        protectedRegions
      ));
    } else {
      // Section is too large, split it further
      const subChunks = splitLargeSection(
        section.text,
        fullText,
        opts.maxTokens!,
        opts.overlapTokens!,
        protectedRegions,
        specialRules
      );
      
      subChunks.forEach(subText => {
        chunks.push(createSemanticChunk(
          subText,
          fullText,
          sourceType,
          sourceRef,
          chunks.length,
          [...headerStack],
          protectedRegions
        ));
      });
    }
  }
  
  // Add continuation info
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      chunks[i].metadata.continuationInfo = {
        ...chunks[i].metadata.continuationInfo,
        continuesFrom: chunks[i - 1].id,
      };
    }
    if (i < chunks.length - 1) {
      chunks[i].metadata.continuationInfo = {
        ...chunks[i].metadata.continuationInfo,
        continuesTo: chunks[i + 1].id,
      };
    }
  }
  
  // Update total chunks count
  chunks.forEach(chunk => {
    chunk.metadata.totalChunks = chunks.length;
  });
  
  return chunks;
}

/**
 * Split a large section using hierarchical boundaries
 */
function splitLargeSection(
  text: string,
  fullText: string,
  maxTokens: number,
  overlapTokens: number,
  protectedRegions: ProtectedRegion[],
  specialRules: { keepNumberedListsTogether?: boolean }
): string[] {
  const chunks: string[] = [];
  
  // Try splitting by paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  
  let currentChunk = '';
  let currentTokens = 0;
  
  for (const paragraph of paragraphs) {
    // Check if this paragraph is in a protected region
    const isProtected = isInProtectedRegion(paragraph, text, fullText, protectedRegions);
    const paragraphTokens = countTokens(paragraph);
    
    // If adding this paragraph would exceed max and we have content, finalize chunk
    if (currentTokens + paragraphTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Start new chunk with smart overlap
      const overlap = createSmartOverlap(currentChunk, overlapTokens);
      currentChunk = overlap + '\n\n' + paragraph;
      currentTokens = countTokens(currentChunk);
    } else if (isProtected && paragraphTokens > maxTokens) {
      // Protected region too large - split by sentences as last resort
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentTokens = 0;
      }
      
      const sentenceChunks = splitBySentences(paragraph, maxTokens, overlapTokens);
      chunks.push(...sentenceChunks);
    } else {
      // Add paragraph to current chunk
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
      currentTokens += paragraphTokens;
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Check if text is in a protected region
 */
function isInProtectedRegion(
  snippet: string,
  sectionText: string,
  fullText: string,
  protectedRegions: ProtectedRegion[]
): boolean {
  const snippetIndex = fullText.indexOf(snippet);
  if (snippetIndex === -1) return false;
  
  return protectedRegions.some(region =>
    snippetIndex >= region.startIndex && snippetIndex < region.endIndex
  );
}

/**
 * Create smart overlap that includes context
 */
function createSmartOverlap(text: string, overlapTokens: number): string {
  // Find the last header in the text
  const lines = text.split('\n');
  let lastHeader = '';
  
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].match(/^#{1,6}\s+/)) {
      lastHeader = lines[i];
      break;
    }
  }
  
  // Get last N tokens
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const overlapText = sentences.slice(-Math.ceil(overlapTokens / 20)).join('. ');
  
  // Include header if found
  return lastHeader ? lastHeader + '\n\n' + overlapText : overlapText;
}

/**
 * Split by sentences as last resort
 */
function splitBySentences(text: string, maxTokens: number, overlapTokens: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  
  let currentChunk = '';
  let currentTokens = 0;
  
  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence);
    
    if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Get last few words for overlap
      const words = currentChunk.split(/\s+/);
      const overlapWords = Math.floor(overlapTokens * 0.75);
      const overlap = words.slice(-overlapWords).join(' ');
      
      currentChunk = overlap + ' ' + sentence;
      currentTokens = countTokens(currentChunk);
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentTokens += sentenceTokens;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Create a semantic chunk with rich metadata
 */
function createSemanticChunk(
  text: string,
  fullText: string,
  sourceType: string,
  sourceRef: any,
  chunkIndex: number,
  headerHierarchy: string[],
  protectedRegions: ProtectedRegion[]
): SemanticChunk {
  // Calculate line numbers
  const beforeText = fullText.substring(0, fullText.indexOf(text));
  const startLine = (beforeText.match(/\n/g) || []).length + 1;
  const endLine = startLine + (text.match(/\n/g) || []).length;
  
  // Calculate character positions
  const startChar = fullText.indexOf(text);
  const endChar = startChar + text.length;
  
  // Detect structure flags
  const structureFlags = {
    containsTable: text.includes('|') && text.split('\n').filter(l => l.includes('|')).length >= 2,
    containsCode: text.includes('```') || text.includes('    ') && text.split('\n').some(l => l.startsWith('    ')),
    containsNumberedList: /^\d+\.\s+/m.test(text),
    isProtocol: /step\s+\d+|procedure|protocol/i.test(text),
  };
  
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    tokenCount: countTokens(text),
    metadata: {
      sourceType,
      sourceRef,
      chunkIndex,
      totalChunks: 0, // Will be updated later
      startLine,
      endLine,
      startChar,
      endChar,
      headerHierarchy: headerHierarchy.length > 0 ? headerHierarchy : undefined,
      structureFlags,
    },
  };
}

