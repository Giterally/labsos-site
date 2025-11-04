import type { StructuredDocument, Section } from './parsers/pdf-parser';

/**
 * Clean and optimize a structured document before sending to LLM
 * This removes noise, trims excessive whitespace, and ensures quality content
 */
export function cleanStructuredDocument(doc: StructuredDocument): StructuredDocument {
  return {
    ...doc,
    sections: doc.sections
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
      })
  };
}

