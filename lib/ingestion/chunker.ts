import { countTokens } from '../ai/embeddings';

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
  minChunkSize?: number;
}

export interface Chunk {
  id: string;
  text: string;
  tokenCount: number;
  metadata: {
    sourceType: string;
    sourceRef: any;
    chunkIndex: number;
    totalChunks: number;
    startOffset: number;
    endOffset: number;
  };
}

// Default chunking options
const DEFAULT_OPTIONS: ChunkOptions = {
  maxTokens: 800,
  overlapTokens: 100,
  minChunkSize: 50,
};

// Chunk text content with semantic awareness
export function chunkText(
  text: string,
  sourceType: string,
  sourceRef: any,
  options: ChunkOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];
  
  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let startOffset = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = countTokens(paragraph);
    
    // If adding this paragraph would exceed max tokens, finalize current chunk
    if (currentTokens + paragraphTokens > opts.maxTokens && currentChunk.length > 0) {
      chunks.push(createChunk(
        currentChunk,
        sourceType,
        sourceRef,
        chunkIndex,
        startOffset,
        startOffset + currentChunk.length,
        chunks.length + 1
      ));
      
      // Start new chunk with overlap
      const overlapText = getOverlapText(currentChunk, opts.overlapTokens);
      currentChunk = overlapText + '\n\n' + paragraph;
      currentTokens = countTokens(currentChunk);
      startOffset += currentChunk.length - overlapText.length - paragraph.length;
      chunkIndex++;
    } else {
      // Add paragraph to current chunk
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
        startOffset = text.indexOf(paragraph);
      }
      currentTokens += paragraphTokens;
    }
  }

  // Add final chunk if it has content
  if (currentChunk.trim().length >= opts.minChunkSize) {
    chunks.push(createChunk(
      currentChunk,
      sourceType,
      sourceRef,
      chunkIndex,
      startOffset,
      startOffset + currentChunk.length,
      chunks.length + 1
    ));
  }

  return chunks;
}

// Chunk code content with function/class awareness
export function chunkCode(
  code: string,
  sourceType: string,
  sourceRef: any,
  options: ChunkOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];
  
  // Split by functions, classes, and major blocks
  const codeBlocks = splitCodeIntoBlocks(code);
  
  let currentChunk = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  let startOffset = 0;

  for (const block of codeBlocks) {
    const blockTokens = countTokens(block.text);
    
    // If adding this block would exceed max tokens, finalize current chunk
    if (currentTokens + blockTokens > opts.maxTokens && currentChunk.length > 0) {
      chunks.push(createChunk(
        currentChunk,
        sourceType,
        sourceRef,
        chunkIndex,
        startOffset,
        startOffset + currentChunk.length,
        chunks.length + 1,
        { blockType: 'code' }
      ));
      
      // Start new chunk
      currentChunk = block.text;
      currentTokens = blockTokens;
      startOffset = block.startOffset;
      chunkIndex++;
    } else {
      // Add block to current chunk
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + block.text;
      } else {
        currentChunk = block.text;
        startOffset = block.startOffset;
      }
      currentTokens += blockTokens;
    }
  }

  // Add final chunk if it has content
  if (currentChunk.trim().length >= opts.minChunkSize) {
    chunks.push(createChunk(
      currentChunk,
      sourceType,
      sourceRef,
      chunkIndex,
      startOffset,
      startOffset + currentChunk.length,
      chunks.length + 1,
      { blockType: 'code' }
    ));
  }

  return chunks;
}

// Chunk table data with row/column awareness
export function chunkTable(
  tableData: string[][],
  sourceType: string,
  sourceRef: any,
  options: ChunkOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];
  
  if (tableData.length === 0) return chunks;
  
  // Convert table to text representation
  const tableText = tableData.map(row => row.join('\t')).join('\n');
  const totalTokens = countTokens(tableText);
  
  // If table is small enough, chunk as single unit
  if (totalTokens <= opts.maxTokens) {
    chunks.push(createChunk(
      tableText,
      sourceType,
      sourceRef,
      0,
      0,
      tableText.length,
      1,
      { 
        blockType: 'table',
        rowCount: tableData.length,
        columnCount: tableData[0]?.length || 0,
        headers: tableData[0] || []
      }
    ));
    return chunks;
  }
  
  // Chunk by rows if table is too large
  const rowsPerChunk = Math.floor((opts.maxTokens * tableData.length) / totalTokens);
  let chunkIndex = 0;
  
  for (let i = 0; i < tableData.length; i += rowsPerChunk) {
    const chunkRows = tableData.slice(i, i + rowsPerChunk);
    const chunkText = chunkRows.map(row => row.join('\t')).join('\n');
    
    chunks.push(createChunk(
      chunkText,
      sourceType,
      sourceRef,
      chunkIndex,
      i,
      i + chunkRows.length,
      chunks.length + 1,
      { 
        blockType: 'table',
        rowCount: chunkRows.length,
        columnCount: chunkRows[0]?.length || 0,
        headers: tableData[0] || [],
        startRow: i,
        endRow: i + chunkRows.length - 1
      }
    ));
    chunkIndex++;
  }
  
  return chunks;
}

// Helper function to create a chunk object
function createChunk(
  text: string,
  sourceType: string,
  sourceRef: any,
  chunkIndex: number,
  startOffset: number,
  endOffset: number,
  totalChunks: number,
  additionalMetadata: any = {}
): Chunk {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    tokenCount: countTokens(text),
    metadata: {
      sourceType,
      sourceRef,
      chunkIndex,
      totalChunks,
      startOffset,
      endOffset,
      ...additionalMetadata,
    },
  };
}

// Helper function to get overlap text from the end of a chunk
function getOverlapText(text: string, overlapTokens: number): string {
  const words = text.split(/\s+/);
  const overlapWords = Math.floor(overlapTokens * 0.75); // Approximate words per token
  return words.slice(-overlapWords).join(' ');
}

// Helper function to split code into logical blocks
function splitCodeIntoBlocks(code: string): Array<{ text: string; startOffset: number }> {
  const blocks: Array<{ text: string; startOffset: number }> = [];
  const lines = code.split('\n');
  
  let currentBlock = '';
  let currentStartOffset = 0;
  let inFunction = false;
  let inClass = false;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Detect function/class definitions
    if (trimmedLine.match(/^(def|class|function|const|let|var)\s+/)) {
      // Finalize current block if it exists
      if (currentBlock.trim().length > 0) {
        blocks.push({
          text: currentBlock.trim(),
          startOffset: currentStartOffset,
        });
      }
      
      // Start new block
      currentBlock = line;
      currentStartOffset = code.indexOf(line);
      inFunction = trimmedLine.startsWith('def ') || trimmedLine.startsWith('function ');
      inClass = trimmedLine.startsWith('class ');
      braceCount = 0;
    } else if (inFunction || inClass) {
      // Count braces to detect end of function/class
      currentBlock += '\n' + line;
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      
      // If we're back to brace count 0, we've reached the end
      if (braceCount === 0 && trimmedLine.length > 0) {
        blocks.push({
          text: currentBlock.trim(),
          startOffset: currentStartOffset,
        });
        currentBlock = '';
        inFunction = false;
        inClass = false;
      }
    } else {
      // Regular code line
      currentBlock += '\n' + line;
    }
  }
  
  // Add final block if it exists
  if (currentBlock.trim().length > 0) {
    blocks.push({
      text: currentBlock.trim(),
      startOffset: currentStartOffset,
    });
  }
  
  return blocks;
}

// Chunk mixed content (text + code + tables)
export function chunkMixedContent(
  content: string,
  sourceType: string,
  sourceRef: any,
  options: ChunkOptions = {}
): Chunk[] {
  // This would implement more sophisticated chunking for mixed content
  // For now, fall back to text chunking
  return chunkText(content, sourceType, sourceRef, options);
}