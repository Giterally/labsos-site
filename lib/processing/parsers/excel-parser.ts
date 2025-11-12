import * as XLSX from 'xlsx';
import { supabaseServer } from '../../supabase-server';
import { StructuredDocument, Section, ContentBlock } from './pdf-parser';

export interface ExcelStructuredDocument extends StructuredDocument {
  type: 'excel';
  sheets?: ExcelSheet[];
}

export interface ExcelSheet {
  name: string;
  sections: Section[];
  tables: {
    range: string; // e.g., "A1:D10"
    headers: string[];
    rows: string[][];
  }[];
}

/**
 * Parse Excel file preserving sheet structure and tables
 */
export async function parseExcel(
  storagePath: string,
  sourceId: string,
  fileName: string
): Promise<ExcelStructuredDocument> {
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

    const sheets: ExcelSheet[] = [];

    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

      if (sheetData.length === 0) continue;

      // Convert to string array
      const stringData = sheetData.map((row: any[]) =>
        row.map((cell: any) => String(cell || ''))
      );

      // Detect tables in sheet
      const tables = detectTables(stringData, sheetName);
      
      // Create sections from sheet
      const sections = createSectionsFromSheet(stringData, sheetName, tables);

      sheets.push({
        name: sheetName,
        sections,
        tables,
      });
    }

    // Combine all sections from all sheets
    const allSections: Section[] = [];
    sheets.forEach((sheet, sheetIndex) => {
      allSections.push(...sheet.sections);
    });

    return {
      type: 'excel',
      sourceId,
      fileName,
      sections: allSections,
      sheets,
      metadata: {
        totalPages: sheets.length, // Treat sheets as pages
        sheetNames: sheets.map(s => s.name),
        sheetCount: sheets.length,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('Excel parsing error:', error);
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

/**
 * Detect tables in Excel sheet data
 */
function detectTables(data: string[][], sheetName: string): ExcelSheet['tables'][] {
  const tables: ExcelSheet['tables'] = [];

  if (data.length === 0) return tables;

  // Find potential table boundaries (rows with headers)
  let currentTable: { headers: string[]; rows: string[][]; startRow: number } | null = null;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const nonEmptyCells = row.filter(cell => cell.trim().length > 0);

    // Check if this row looks like a header (fewer empty cells, descriptive text)
    const couldBeHeader = nonEmptyCells.length >= 2 && 
                          nonEmptyCells.length <= 15 &&
                          row.some(cell => cell.trim().length > 5);

    if (couldBeHeader && !currentTable) {
      // Start new table
      currentTable = {
        headers: row.map(cell => String(cell || '')),
        rows: [],
        startRow: i,
      };
    } else if (currentTable) {
      // Check if we should continue this table or end it
      const hasData = nonEmptyCells.length >= currentTable.headers.filter(h => h.trim()).length * 0.5;
      
      if (hasData) {
        currentTable.rows.push(row.map(cell => String(cell || '')));
      } else {
        // End current table
        if (currentTable.rows.length > 0) {
          const endRow = i - 1;
          tables.push({
            range: `A${currentTable.startRow + 1}:${getColumnLetter(currentTable.headers.length)}${endRow + 1}`,
            headers: currentTable.headers,
            rows: currentTable.rows,
          });
        }
        currentTable = null;
      }
    }
  }

  // Add final table if exists
  if (currentTable && currentTable.rows.length > 0) {
    const endRow = data.length - 1;
    tables.push({
      range: `A${currentTable.startRow + 1}:${getColumnLetter(currentTable.headers.length)}${endRow + 1}`,
      headers: currentTable.headers,
      rows: currentTable.rows,
    });
  }

  return tables;
}

/**
 * Convert column number to letter (1 -> A, 2 -> B, etc.)
 */
function getColumnLetter(columnNumber: number): string {
  let result = '';
  while (columnNumber > 0) {
    columnNumber--;
    result = String.fromCharCode(65 + (columnNumber % 26)) + result;
    columnNumber = Math.floor(columnNumber / 26);
  }
  return result;
}

/**
 * Create sections from Excel sheet data
 */
function createSectionsFromSheet(
  data: string[][],
  sheetName: string,
  tables: ExcelSheet['tables']
): Section[] {
  const sections: Section[] = [];

  // Create a main section for the sheet
  const contentBlocks: ContentBlock[] = [];

  // Add sheet name as heading
  contentBlocks.push({
    type: 'text',
    content: `Sheet: ${sheetName}`,
    pageNumber: 1,
  });

  // Add tables as table blocks
  tables.forEach((table, index) => {
    // Format table as text
    const tableText = [
      table.headers.join('\t'),
      table.rows.map(row => row.join('\t')).join('\n'),
    ].join('\n');

    contentBlocks.push({
      type: 'table',
      content: tableText,
      pageNumber: 1,
    });
  });

  // Add remaining data as text blocks
  const usedRows = new Set<number>();
  tables.forEach(table => {
    // Mark rows used by tables (approximate)
    for (let i = 0; i < Math.min(20, data.length); i++) {
      usedRows.add(i);
    }
  });

  for (let i = 0; i < data.length; i++) {
    if (usedRows.has(i)) continue;
    const row = data[i];
    const rowText = row.filter(cell => cell.trim()).join(' ');
    if (rowText.trim()) {
      contentBlocks.push({
        type: 'text',
        content: rowText,
        pageNumber: 1,
      });
    }
  }

  sections.push({
    level: 1,
    title: sheetName,
    content: contentBlocks,
    pageRange: [1, 1],
  });

  return sections;
}

