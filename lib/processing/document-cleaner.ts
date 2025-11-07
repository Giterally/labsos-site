import type { StructuredDocument, Section } from './parsers/pdf-parser';

// Configurable citation ratio threshold
const CITATION_RATIO_THRESHOLD = 0.5; // 50% citations → filter section

/**
 * Detects if a section is primarily references/bibliography
 */
function isReferenceSection(section: Section): boolean {
  const titleLower = section.title.toLowerCase();
  
  // Check section title for reference-related keywords
  const referenceTitleKeywords = [
    'reference',
    'bibliograph',
    'works cited',
    'literature cited',
    'acknowledgment',
    'acknowledgement',
    'author contribution',
    'funding',
    'conflict of interest',
    'conflicts of interest',
    'supplementary reference', // Only if no protocols
  ];
  
  if (referenceTitleKeywords.some(keyword => titleLower.includes(keyword))) {
    return true;
  }
  
  return false;
}

/**
 * Detects if a section is mostly citations (even if title doesn't indicate it)
 */
function isMostlyCitations(section: Section): boolean {
  const contentText = section.content
    .filter(c => c.type === 'text')
    .map(c => c.content)
    .join('\n');
  
  // Count citation-like patterns
  const citationPatterns = [
    /^\[\d+\]/gm,              // [1], [2], etc.
    /^\d+\.\s+[A-Z]/gm,        // 1. Author, 2. Author
    /\(\d{4}\)\./g,            // (2020).
    /et al\./gi,               // et al.
    /doi:/gi,                  // doi:
    /https?:\/\/doi\.org/gi,   // https://doi.org/
    /^[A-Z][a-z]+\s+et\s+al\./gm, // Author et al.
  ];
  
  let citationCount = 0;
  for (const pattern of citationPatterns) {
    const matches = contentText.match(pattern);
    if (matches) citationCount += matches.length;
  }
  
  const lines = contentText.split('\n').filter(l => l.trim().length > 0);
  const citationRatio = lines.length > 0 ? citationCount / lines.length : 0;
  
  // If >50% of lines are citations, it's a reference section
  return citationRatio > CITATION_RATIO_THRESHOLD;
}

/**
 * Clean and optimize a structured document before sending to LLM
 * This removes noise, trims excessive whitespace, and ensures quality content
 */
export function cleanStructuredDocument(doc: StructuredDocument): StructuredDocument {
  const totalSections = doc.sections.length;
  let filteredCount = 0;
  
  const cleanedSections = doc.sections
    .filter(section => {
      // Remove very short sections (less than 50 characters total)
      const totalLength = section.content.reduce((sum, block) => sum + block.content.length, 0);
      if (totalLength < 50) {
        return false;
      }
      
      // Remove sections that are mostly punctuation or special characters
      const allText = section.content.map(b => b.content).join(' ');
      const alphaChars = (allText.match(/[a-zA-Z]/g) || []).length;
      const totalChars = allText.length;
      const alphaRatio = totalChars > 0 ? alphaChars / totalChars : 0;
      
      if (alphaRatio < 0.5) {
        return false; // Less than 50% alphabetic characters
      }
      
      // Filter out reference sections
      if (isReferenceSection(section)) {
        console.log(`[REFERENCE_FILTER] Filtering reference section: "${section.title}"`);
        filteredCount++;
        return false;
      }
      
      // Filter out sections that are mostly citations
      if (isMostlyCitations(section)) {
        console.log(`[REFERENCE_FILTER] Filtering citation-heavy section: "${section.title}"`);
        filteredCount++;
        return false;
      }
      
      return true;
    })
    .map(section => ({
      ...section,
      // Trim excessive whitespace (more than 2 consecutive newlines)
      content: section.content.map(block => ({
        ...block,
        content: block.content
          .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
          .replace(/\s{3,}/g, ' ') // Replace 3+ spaces with 1
          .trim()
      })),
      title: section.title.trim()
    }))
    .filter(section => {
      // After cleaning, check if section still has meaningful content
      const totalLength = section.content.reduce((sum, block) => sum + block.content.length, 0);
      return totalLength >= 30; // Minimum threshold after cleaning
    });
  
  console.log(`[REFERENCE_FILTER] Sections before: ${totalSections}`);
  console.log(`[REFERENCE_FILTER] Sections filtered: ${filteredCount}`);
  console.log(`[REFERENCE_FILTER] Sections after: ${cleanedSections.length}`);
  
  return {
    ...doc,
    sections: cleanedSections
  };
}

