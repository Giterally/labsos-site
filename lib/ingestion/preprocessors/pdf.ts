import { supabaseServer } from '../../supabase-server';

export interface PreprocessedContent {
  text?: string;
  tables?: string[][][];
  code?: string;
  needsTranscription?: boolean;
  metadata?: any;
}

// Preprocess PDF files
export async function preprocessPDF(
  storagePath: string,
  metadata: any
): Promise<PreprocessedContent> {
  try {
    // Download PDF file from storage
    const { data: pdfData, error: downloadError } = await supabaseServer.storage
      .from('project-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download PDF file: ${downloadError.message}`);
    }

    // Convert PDF buffer to text
    const pdfBuffer = await pdfData.arrayBuffer();
    
    // Load our vendored pdf-parse wrapper that bypasses the debug code issue
    // This wrapper loads pdf-parse/lib/pdf-parse.js directly, bypassing index.js
    let pdf: any;
    try {
      pdf = require('../../vendors/pdf-parse-fixed');
      console.log('[PREPROCESS_PDF] Successfully loaded pdf-parse via vendored wrapper');
    } catch (error: any) {
      console.error('[PREPROCESS_PDF] Failed to load pdf-parse library:', error);
      throw new Error(`Failed to load pdf-parse library: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    const pdfInfo = await pdf(Buffer.from(pdfBuffer));
    
    const text = pdfInfo.text;
    const pageCount = pdfInfo.numpages;
    
    // Extract tables from PDF text (simple heuristic-based approach)
    const tables = extractTablesFromText(text);
    
    // Extract code blocks from PDF text
    const code = extractCodeFromText(text);
    
    return {
      text,
      tables,
      code,
      metadata: {
        ...metadata,
        pageCount,
        wordCount: text.split(/\s+/).length,
        lineCount: text.split('\n').length,
        tableCount: tables.length,
        hasCode: code.length > 0,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('PDF preprocessing error:', error);
    throw new Error(`Failed to preprocess PDF file: ${error.message}`);
  }
}

// Extract tables from PDF text using heuristics
function extractTablesFromText(text: string): string[][][] {
  const tables: string[][][] = [];
  const lines = text.split('\n');
  
  let currentTable: string[][] = [];
  let inTable = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Detect table rows (lines with multiple columns separated by spaces/tabs)
    if (isTableRow(trimmedLine)) {
      if (!inTable) {
        inTable = true;
        currentTable = [];
      }
      
      const columns = splitTableRow(trimmedLine);
      currentTable.push(columns);
    } else {
      // End of table
      if (inTable && currentTable.length > 1) {
        tables.push([...currentTable]);
      }
      inTable = false;
      currentTable = [];
    }
  }
  
  // Add final table if exists
  if (inTable && currentTable.length > 1) {
    tables.push(currentTable);
  }
  
  return tables;
}

// Check if a line looks like a table row
function isTableRow(line: string): boolean {
  // Simple heuristic: line has multiple columns separated by spaces
  const columns = line.split(/\s{2,}|\t/);
  return columns.length >= 2 && columns.every(col => col.trim().length > 0);
}

// Split a table row into columns
function splitTableRow(line: string): string[] {
  return line.split(/\s{2,}|\t/).map(col => col.trim());
}

// Extract code blocks from PDF text
function extractCodeFromText(text: string): string {
  const codeBlocks: string[] = [];
  
  // Look for common code patterns
  const codePatterns = [
    // Function definitions
    /def\s+\w+\([^)]*\):[\s\S]*?(?=\n\w|\n\n|$)/g,
    // Class definitions
    /class\s+\w+[^{]*\{[\s\S]*?\}/g,
    // Import statements
    /import\s+[\w\s,]+;?/g,
    // Variable assignments
    /\w+\s*=\s*[^;\n]+/g,
  ];
  
  for (const pattern of codePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      codeBlocks.push(...matches);
    }
  }
  
  return codeBlocks.join('\n\n');
}