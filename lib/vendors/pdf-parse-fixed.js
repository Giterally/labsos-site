/**
 * Vendored pdf-parse wrapper that bypasses the problematic debug code in index.js
 * 
 * This wrapper loads the actual pdf-parse implementation directly from lib/pdf-parse.js,
 * bypassing the index.js file that contains debug code that fails in Next.js bundled contexts.
 */

// Load the actual pdf-parse implementation directly
const pdfParse = require('pdf-parse/lib/pdf-parse');

// Re-export as default (matching pdf-parse's export style)
module.exports = pdfParse;

