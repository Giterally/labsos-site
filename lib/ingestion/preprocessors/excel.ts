import * as XLSX from 'xlsx';
import { supabaseServer } from '../../supabase-server';

export interface PreprocessedContent {
  text?: string;
  tables?: string[][][];
  code?: string;
  needsTranscription?: boolean;
  metadata?: any;
}

// Preprocess Excel files
export async function preprocessExcel(
  storagePath: string,
  metadata: any
): Promise<PreprocessedContent> {
  try {
    // Download Excel file from storage
    const { data: excelData, error: downloadError } = await supabaseServer.storage
      .from('user-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download Excel file: ${downloadError.message}`);
    }

    // Convert to buffer and read with xlsx
    const excelBuffer = await excelData.arrayBuffer();
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    
    const tables: string[][][] = [];
    const sheetNames: string[] = [];
    let totalRows = 0;
    let totalColumns = 0;
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      if (sheetData.length > 0) {
        // Convert to string array
        const stringData = sheetData.map((row: any) => 
          row.map((cell: any) => String(cell || ''))
        );
        
        tables.push(stringData);
        sheetNames.push(sheetName);
        totalRows += stringData.length;
        totalColumns = Math.max(totalColumns, stringData[0]?.length || 0);
      }
    }
    
    // Generate text representation of the data
    const text = generateTextFromTables(tables, sheetNames);
    
    return {
      text,
      tables,
      metadata: {
        ...metadata,
        sheetNames,
        sheetCount: tables.length,
        totalRows,
        totalColumns,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Excel preprocessing error:', error);
    throw new Error(`Failed to preprocess Excel file: ${error.message}`);
  }
}

// Generate text representation from tables
function generateTextFromTables(tables: string[][][], sheetNames: string[]): string {
  const textParts: string[] = [];
  
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const sheetName = sheetNames[i];
    
    textParts.push(`Sheet: ${sheetName}`);
    textParts.push('='.repeat(50));
    
    if (table.length > 0) {
      // Add header row
      const headerRow = table[0];
      textParts.push(headerRow.join('\t'));
      textParts.push('-'.repeat(headerRow.join('\t').length));
      
      // Add data rows
      for (let j = 1; j < table.length; j++) {
        textParts.push(table[j].join('\t'));
      }
    }
    
    textParts.push(''); // Empty line between sheets
  }
  
  return textParts.join('\n');
}

// Extract structured data from Excel tables
export function extractStructuredData(tables: string[][][]): {
  headers: string[][];
  dataRows: string[][][];
  summary: {
    totalSheets: number;
    totalRows: number;
    totalColumns: number;
  };
} {
  const headers: string[][] = [];
  const dataRows: string[][][] = [];
  
  for (const table of tables) {
    if (table.length > 0) {
      headers.push(table[0]);
      dataRows.push(table.slice(1));
    }
  }
  
  const totalRows = dataRows.reduce((sum, sheet) => sum + sheet.length, 0);
  const totalColumns = Math.max(...headers.map(h => h.length), 0);
  
  return {
    headers,
    dataRows,
    summary: {
      totalSheets: tables.length,
      totalRows,
      totalColumns,
    },
  };
}