import { supabaseServer } from '../../supabase-server';

export interface PreprocessedContent {
  text?: string;
  tables?: string[][][];
  code?: string;
  needsTranscription?: boolean;
  metadata?: any;
}

// Preprocess text files (plain text, markdown)
export async function preprocessText(
  storagePath: string,
  metadata: any
): Promise<PreprocessedContent> {
  try {
    // Download text file from storage
    const { data: textData, error: downloadError } = await supabaseServer.storage
      .from('user-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download text file: ${downloadError.message}`);
    }

    const text = await textData.text();
    
    return {
      text,
      metadata: {
        ...metadata,
        wordCount: text.split(/\s+/).length,
        lineCount: text.split('\n').length,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Text preprocessing error:', error);
    throw new Error(`Failed to preprocess text file: ${error.message}`);
  }
}

// Preprocess markdown files
export async function preprocessMarkdown(
  storagePath: string,
  metadata: any
): Promise<PreprocessedContent> {
  try {
    // Download markdown file from storage
    const { data: markdownData, error: downloadError } = await supabaseServer.storage
      .from('user-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download markdown file: ${downloadError.message}`);
    }

    const markdown = await markdownData.text();
    
    // Extract text content (remove markdown syntax)
    const text = extractTextFromMarkdown(markdown);
    
    return {
      text,
      metadata: {
        ...metadata,
        originalMarkdown: markdown,
        wordCount: text.split(/\s+/).length,
        lineCount: text.split('\n').length,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Markdown preprocessing error:', error);
    throw new Error(`Failed to preprocess markdown file: ${error.message}`);
  }
}

// Extract plain text from markdown
function extractTextFromMarkdown(markdown: string): string {
  return markdown
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Clean up whitespace
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}
