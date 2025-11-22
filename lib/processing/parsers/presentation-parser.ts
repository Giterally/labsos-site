import { supabaseServer } from '../../supabase-server';
import { StructuredDocument, Section, ContentBlock } from './pdf-parser';
import { parsePDF } from './pdf-parser';

/**
 * Parse PowerPoint (.pptx, .ppt) or Google Slides (exported as PDF) file
 * preserving hierarchical structure
 */
export async function parsePresentation(
  storagePath: string,
  sourceId: string,
  fileName: string,
  mimeType?: string
): Promise<StructuredDocument> {
  try {
    // Download file from storage
    const { data: fileData, error: downloadError } = await supabaseServer.storage
      .from('user-uploads')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download presentation file: ${downloadError.message}`);
    }

    const fileBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    console.log(`[PRESENTATION_PARSER] Parsing presentation: ${fileName} (${buffer.length} bytes), MIME: ${mimeType}`);

    // Check if this is a Google Slides export (PDF format) or actual PDF
    // Google Slides are exported as PDF by the Google Drive service
    // Check by MIME type, file extension, or PDF magic bytes (%PDF)
    const isPDF = mimeType === 'application/pdf' || 
                  fileName.toLowerCase().endsWith('.pdf') ||
                  (buffer.length > 4 && buffer.toString('ascii', 0, 4) === '%PDF') ||
                  mimeType === 'application/vnd.google-apps.presentation'; // Google Slides are exported as PDF
    
    if (isPDF) {
      console.log(`[PRESENTATION_PARSER] Detected PDF format (Google Slides export or native PDF), using PDF parser`);
      // Use PDF parser for Google Slides (exported as PDF)
      const pdfDoc = await parsePDF(storagePath, sourceId, fileName);
      // Convert PDF document to presentation format
      return {
        type: 'presentation',
        sourceId,
        fileName,
        sections: pdfDoc.sections.map((section, index) => ({
          ...section,
          title: section.title || `Slide ${index + 1}`,
          pageRange: [index + 1, index + 1],
        })),
        metadata: {
          ...pdfDoc.metadata,
          slideCount: pdfDoc.sections.length,
          processedAt: new Date().toISOString(),
        },
      };
    }

    // For native PowerPoint files (.pptx, .ppt), extract text from slides
    // Note: This requires a PowerPoint parsing library
    // For now, we'll use a basic text extraction approach
    console.log(`[PRESENTATION_PARSER] Detected native PowerPoint file, extracting text`);
    
    try {
      // Try to use pptx library if available
      const pptx = require('pptx');
      const presentation = await pptx.read(buffer);
      
      const sections: Section[] = [];
      
      // Extract slides
      for (let i = 0; i < presentation.slides.length; i++) {
        const slide = presentation.slides[i];
        const contentBlocks: ContentBlock[] = [];
        
        // Extract text from slide
        let slideText = '';
        if (slide.text) {
          slideText = slide.text;
        } else if (slide.shapes) {
          // Extract text from shapes
          slideText = slide.shapes
            .map((shape: any) => shape.text || '')
            .filter((text: string) => text.trim().length > 0)
            .join('\n');
        }
        
        if (slideText.trim()) {
          // Split text into paragraphs
          const paragraphs = slideText.split(/\n+/).filter(p => p.trim().length > 0);
          
          for (const para of paragraphs) {
            contentBlocks.push({
              type: 'text',
              content: para.trim(),
              pageNumber: i + 1,
            });
          }
        }
        
        // If no content blocks, create an empty one
        if (contentBlocks.length === 0) {
          contentBlocks.push({
            type: 'text',
            content: '',
            pageNumber: i + 1,
          });
        }
        
        sections.push({
          level: 1,
          title: slide.title || `Slide ${i + 1}`,
          content: contentBlocks,
          pageRange: [i + 1, i + 1],
        });
      }
      
      return {
        type: 'presentation',
        sourceId,
        fileName,
        sections,
        metadata: {
          totalPages: sections.length,
          slideCount: sections.length,
          processedAt: new Date().toISOString(),
        },
      };
    } catch (pptxError: any) {
      // If pptx library is not available or fails, fall back to basic extraction
      console.warn(`[PRESENTATION_PARSER] PowerPoint library not available, using fallback: ${pptxError.message}`);
      
      // Fallback: Try to extract text using a simpler method
      // PowerPoint files are ZIP archives containing XML files
      // We can extract text from slide XML files
      try {
        return await parsePowerPointFallback(buffer, sourceId, fileName);
      } catch (fallbackError: any) {
        console.error(`[PRESENTATION_PARSER] Fallback parsing also failed: ${fallbackError.message}`);
        // Last resort: return minimal structure
        return {
          type: 'presentation',
          sourceId,
          fileName,
          sections: [{
            level: 1,
            title: 'Presentation',
            content: [{
              type: 'text',
              content: 'Unable to parse PowerPoint file. Please ensure the file is not corrupted.',
              pageNumber: 1,
            }],
            pageRange: [1, 1],
          }],
          metadata: {
            totalPages: 1,
            slideCount: 1,
            processedAt: new Date().toISOString(),
          },
        };
      }
    }
  } catch (error: any) {
    console.error('Presentation parsing error:', error);
    throw new Error(`Failed to parse presentation file: ${error.message}`);
  }
}

/**
 * Fallback parser for PowerPoint files when library is not available
 * Extracts text from PowerPoint XML structure
 */
async function parsePowerPointFallback(
  buffer: Buffer,
  sourceId: string,
  fileName: string
): Promise<StructuredDocument> {
  try {
    // PowerPoint files (.pptx) are ZIP archives
    // We can extract and parse the XML files inside
    let JSZip;
    try {
      JSZip = require('jszip');
    } catch (requireError) {
      throw new Error('jszip library is required for PowerPoint parsing. Please install it: npm install jszip');
    }
    const zip = await JSZip.loadAsync(buffer);
    
    const sections: Section[] = [];
    let slideIndex = 1;
    
    // Find all slide files (ppt/slides/slide*.xml)
    const slideFiles = Object.keys(zip.files).filter(name => 
      name.match(/^ppt\/slides\/slide\d+\.xml$/)
    ).sort();
    
    for (const slidePath of slideFiles) {
      const slideXml = await zip.files[slidePath].async('string');
      const contentBlocks = extractTextFromSlideXml(slideXml);
      
      sections.push({
        level: 1,
        title: `Slide ${slideIndex}`,
        content: contentBlocks.length > 0 ? contentBlocks : [{
          type: 'text',
          content: '',
          pageNumber: slideIndex,
        }],
        pageRange: [slideIndex, slideIndex],
      });
      
      slideIndex++;
    }
    
    // If no slides found, create a default section
    if (sections.length === 0) {
      sections.push({
        level: 1,
        title: 'Presentation',
        content: [{
          type: 'text',
          content: 'Unable to extract content from presentation',
          pageNumber: 1,
        }],
        pageRange: [1, 1],
      });
    }
    
    return {
      type: 'presentation',
      sourceId,
      fileName,
      sections,
      metadata: {
        totalPages: sections.length,
        slideCount: sections.length,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('PowerPoint fallback parsing error:', error);
    // Last resort: return a single section with error message
    return {
      type: 'presentation',
      sourceId,
      fileName,
      sections: [{
        level: 1,
        title: 'Presentation',
        content: [{
          type: 'text',
          content: `Error parsing presentation: ${error.message}`,
          pageNumber: 1,
        }],
        pageRange: [1, 1],
      }],
      metadata: {
        totalPages: 1,
        slideCount: 1,
        processedAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Extract text content from PowerPoint slide XML
 */
function extractTextFromSlideXml(xml: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  
  // Extract text from <a:t> tags (text elements in PowerPoint XML)
  const textRegex = /<a:t[^>]*>(.*?)<\/a:t>/gi;
  let match;
  const texts: string[] = [];
  
  while ((match = textRegex.exec(xml)) !== null) {
    const text = match[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    
    if (text) {
      texts.push(text);
    }
  }
  
  // Group consecutive texts into paragraphs
  let currentParagraph = '';
  for (const text of texts) {
    if (text.match(/^[•\-\*]\s/)) {
      // Bullet point
      if (currentParagraph) {
        blocks.push({
          type: 'list',
          content: currentParagraph,
          formatting: {
            isNumberedList: false,
            listLevel: 1,
          },
          pageNumber: 1,
        });
        currentParagraph = '';
      }
      blocks.push({
        type: 'list',
        content: text,
        formatting: {
          isNumberedList: false,
          listLevel: 1,
        },
        pageNumber: 1,
      });
    } else {
      currentParagraph += (currentParagraph ? ' ' : '') + text;
    }
  }
  
  if (currentParagraph) {
    blocks.push({
      type: 'text',
      content: currentParagraph,
      pageNumber: 1,
    });
  }
  
  return blocks;
}

