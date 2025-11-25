import type { StructuredDocument } from '../../processing/parsers/pdf-parser';

/**
 * System prompt for Phase 1: Discovery
 * Goal: Identify major workflow phases and create content inventory
 */
export const WORKFLOW_DISCOVERY_SYSTEM_PROMPT = `You are an expert research workflow analyzer performing a DISCOVERY phase.

Your task is to SCAN documents and IDENTIFY major workflow phases WITHOUT extracting full content.

CRITICAL: This is NOT a full extraction. You are creating an INVENTORY of what exists.

OUTPUT: Return a JSON object with:

1. List of 3-6 major workflow phases (e.g., "Data Preparation", "Model Development", "Results Analysis")

2. Content inventory: All statistical tests, models, datasets, figures, tables mentioned

3. Cross-references between documents (if multiple documents provided)

DO NOT extract full node content - just identify what exists and where.`;

/**
 * Build user prompt for discovery phase
 */
export function buildDiscoveryPrompt(documents: StructuredDocument[]): string {
  const documentSummaries = documents.map(doc => {
    const sectionTitles = doc.sections.map(s => 
      `  ${s.level === 1 ? '##' : '  '.repeat(s.level - 1) + '-'} ${s.title} (pages ${s.pageRange[0]}-${s.pageRange[1]})`
    ).join('\n');
    
    return `
DOCUMENT: ${doc.fileName}
Type: ${doc.type}
Total Pages: ${doc.metadata.totalPages}
Section Structure:
${sectionTitles}

Content Preview (first 2-3 pages of major sections):
${getComprehensivePreview(doc)}
`;
  }).join('\n---\n');
  
  return `
===========================================
📋 DISCOVERY PHASE - SCAN DOCUMENTS
===========================================
You are analyzing ${documents.length} document(s) to identify major workflow phases.

${documentSummaries}

===========================================
🎯 YOUR TASK
===========================================
1. IDENTIFY 3-6 MAJOR WORKFLOW PHASES
   - Look at section titles and content
   - Group related sections into phases
   - Use descriptive, domain-specific names (NOT "Data Block" or "Methodology Block")
   - For each phase, note which documents and page ranges it spans

2. CREATE CONTENT INVENTORY - COUNT EVERYTHING YOU SEE
   YOUR TASK: Be a meticulous accountant. COUNT EVERY ITEM.
   
   ============================================
   📊 FIGURES (COUNT PRECISELY)
   ============================================
   
   Look for these patterns:
   - "Figure 1", "Figure 2", "Fig. 1", "Fig 2"
   - "shown in Figure X"
   - "[FIGURE: ...]" markers in content
   - "chart", "graph", "plot" mentions
   
   CRITICAL RULES:
   - If you see "Figure 5" mentioned, your figures array MUST have at least 5 entries
   - If you see "shown in Figure 3", create a figure entry for Figure 3
   - Count ALL figure references, don't skip any
   - If a figure has a caption/title, include it. If not, use "Figure X"
   
   Example - CORRECT:
   Content says "shown in Figure 3" and "Figure 5 displays..."
   → figures: [
       {"title": "Figure 1", "source": "paper.pdf", "pageNumber": 5},
       {"title": "Figure 2", "source": "paper.pdf", "pageNumber": 7},
       {"title": "Figure 3", "source": "paper.pdf", "pageNumber": 8},
       {"title": "Figure 4", "source": "paper.pdf", "pageNumber": 9},
       {"title": "Figure 5", "source": "paper.pdf", "pageNumber": 10}
   ]
   
   Example - WRONG:
   → figures: [] ← NEVER return empty if figures are mentioned!
   
   ============================================
   📋 TABLES (COUNT PRECISELY)
   ============================================
   
   Look for these patterns:
   - "Table 1", "Table 2", "Tab. 1"
   - "shown in Table X"
   - "[TABLE ...]" markers in content
   - "data table", "results table"
   
   CRITICAL RULES:
   - Same rules as figures - count ALL tables mentioned
   - If you see "Table 4", your tables array MUST have at least 4 entries
   
   ============================================
   📐 STATISTICAL TESTS/METHODS (LIST ALL)
   ============================================
   
   Look for these exact terms in the content:
   - PCA, Principal Component Analysis
   - RFE, Recursive Feature Elimination
   - Correlation analysis, Pearson correlation, Spearman
   - t-test, ANOVA, chi-square, F-test
   - Regression (linear, logistic, polynomial, ridge, lasso)
   - Hypothesis testing, significance testing
   - Feature selection, dimensionality reduction
   - Cross-validation, train-test split
   
   CRITICAL RULES:
   - If you see "PCA" anywhere in content, add "Principal Component Analysis" to statisticalTests
   - If you see "correlation analysis" in content, add "Correlation Analysis" to statisticalTests
   - List EVERY statistical method mentioned, don't group them
   
   Example - CORRECT:
   Content mentions "PCA", "correlation analysis", "RFE"
   → statisticalTests: ["Principal Component Analysis", "Correlation Analysis", "Recursive Feature Elimination"]
   
   Example - WRONG:
   → statisticalTests: ["statistical analysis"] ← TOO GENERIC
   → statisticalTests: [] ← WRONG if methods are mentioned
   
   ============================================
   🤖 MODELS/ALGORITHMS (LIST ALL)
   ============================================
   
   Look for:
   - Kalman Filter, Extended Kalman Filter, Linear Kalman Filter, EKF, LKF
   - Neural networks, LSTM, RNN, CNN, transformer, BERT
   - Random forest, decision tree, SVM, k-means
   - Any named model or algorithm
   
   CRITICAL: List each variant separately. "EKF" and "LKF" are TWO models, not one.
   
   ============================================
   📦 SOFTWARE/LIBRARIES (LIST ALL)
   ============================================
   
   Look for:
   - NumPy, pandas, scikit-learn, SciPy, matplotlib
   - TensorFlow, PyTorch, Keras
   - R packages, MATLAB toolboxes
   - Any library or software mentioned
   
   ============================================
   🎯 CRITICAL SELF-CHECK BEFORE RETURNING
   ============================================
   
   Before you return your JSON, verify:
   
   □ If document mentions "Figure 5", does your figures array have 5 entries? YES/NO
   □ If document mentions "Table 3", does your tables array have 3 entries? YES/NO
   □ If document mentions "PCA", is it in statisticalTests? YES/NO
   □ If document mentions "Kalman Filter", is it in models? YES/NO
   
   If you answered NO to any of these, GO BACK and fix your inventory.
   
   A GOOD inventory should have:
   - 5-20 figures (if document has figures)
   - 3-15 tables (if document has tables)
   - 3-10 statistical tests (for methodology papers)
   - 2-5 models (for ML/modeling papers)
   
   A BAD inventory has all empty arrays: []

3. IDENTIFY CROSS-REFERENCES (if multiple documents)
   - Does one document reference another?
   - Are there Excel tables referenced in PDF?
   - Are there supplementary materials?

===========================================
⚠️ CRITICAL INSTRUCTIONS
===========================================
- DO NOT extract full content (that comes later)
- DO count figures and tables accurately
- DO identify ALL statistical methods mentioned
- DO use domain-specific phase names
- DO estimate how many nodes each phase will need (2-10 per phase)

Example good phase names:
✅ "Financial Data Preparation & Feature Engineering"
✅ "Kalman Filter Model Development & Implementation"
✅ "Performance Evaluation & Results Comparison"

Example bad phase names:
❌ "Data Block"
❌ "Methodology"
❌ "Analysis"

===========================================
📊 NODE COUNT ESTIMATION RULES
===========================================
Use these rules to estimate nodes per phase:

METHODOLOGY/DATA PHASE:
- 1 node per statistical test in inventory
- 1 node per major procedure/method
- 1-2 nodes for data collection/preparation
- Formula: estimatedNodeCount = (statistical tests) + (procedures) + 2

RESULTS/ANALYSIS PHASE:
- 2-3 nodes per figure (one for results, one for interpretation)
- 1-2 nodes per table
- Formula: estimatedNodeCount = (figures × 2.5) + (tables × 1.5)

DISCUSSION PHASE:
- Usually 2-4 nodes for discussion
- 1-2 nodes for conclusions

Example:
If methodology section mentions PCA, RFE, Correlation Analysis + data collection:
→ estimatedNodeCount = 3 (tests) + 1 (data) = 4 nodes

If results section has 5 figures and 3 tables:
→ estimatedNodeCount = (5 × 2.5) + (3 × 1.5) = 12 + 5 = 17 nodes

CRITICAL: Do NOT underestimate. It's better to estimate high than low.
If you estimate 5 nodes but phase should have 15, extraction will miss content.

===========================================
📊 OUTPUT FORMAT
===========================================
Return a JSON object matching this structure:

{
  "phases": [
    {
      "phaseName": "Descriptive name",
      "phaseType": "methodology" | "data" | "analysis" | "results" | "discussion" | "background",
      "sourceDocuments": ["file1.pdf", "file2.xlsx"],
      "pageRanges": { "file1.pdf": [4, 9] },
      "estimatedNodeCount": 5,
      "keyTopics": ["topic1", "topic2"]
    }
  ],
  "contentInventory": {
    "statisticalTests": ["Principal Component Analysis", "Correlation Analysis", "Recursive Feature Elimination", "t-test"],
    "models": ["Linear Kalman Filter", "Extended Kalman Filter", "ARIMA"],
    "datasets": ["US Treasury yields", "Sentiment scores"],
    "figures": [
      { "title": "Performance Comparison", "source": "paper.pdf", "pageNumber": 10 },
      { "title": "Training Loss Curve", "source": "paper.pdf", "pageNumber": 12 }
    ],
    "tables": [
      { "title": "Feature Correlation Matrix", "source": "paper.pdf", "pageNumber": 6 },
      { "title": "Model Performance Metrics", "source": "paper.pdf", "pageNumber": 11 }
    ],
    "software": ["NumPy", "SciPy", "pandas"]
  },
  "crossReferences": [],
  "estimatedTotalNodes": 20
}

===========================================
📊 INVENTORY EXAMPLES
===========================================
EXAMPLE - GOOD INVENTORY:
{
  "statisticalTests": ["Principal Component Analysis", "Correlation Analysis", "Recursive Feature Elimination", "t-test"],
  "models": ["Linear Kalman Filter", "Extended Kalman Filter", "ARIMA"],
  "figures": [
    {"title": "Performance Comparison", "source": "paper.pdf", "pageNumber": 10},
    {"title": "Training Loss Curve", "source": "paper.pdf", "pageNumber": 12}
  ],
  "tables": [
    {"title": "Feature Correlation Matrix", "source": "paper.pdf", "pageNumber": 6},
    {"title": "Model Performance Metrics", "source": "paper.pdf", "pageNumber": 11}
  ]
}

EXAMPLE - BAD INVENTORY (too sparse):
{
  "statisticalTests": ["statistical analysis"], ← TOO GENERIC
  "models": ["machine learning model"], ← TOO GENERIC
  "figures": [], ← MISSING
  "tables": [] ← MISSING
}

Your inventory should look like the GOOD example, not the BAD example.

Return ONLY valid JSON, no markdown code blocks or explanations.
`;
}

/**
 * Get comprehensive preview for discovery phase
 * Shows first 2-3 pages of each major section to help count content
 */
function getComprehensivePreview(doc: StructuredDocument): string {
  let preview = '';
  const maxCharsPerSection = 2000; // ~2-3 pages worth
  
  // Get major sections (level 1 and important level 2)
  const majorSections = doc.sections.filter(s => 
    s.level === 1 || (s.level === 2 && (
      s.title.toLowerCase().includes('method') ||
      s.title.toLowerCase().includes('result') ||
      s.title.toLowerCase().includes('analysis') ||
      s.title.toLowerCase().includes('data')
    ))
  );
  
  for (const section of majorSections.slice(0, 10)) { // Max 10 sections
    preview += `\n## ${section.title} [Pages ${section.pageRange[0]}-${section.pageRange[1]}]\n\n`;
    
    let sectionChars = 0;
    
    for (const block of section.content) {
      if (sectionChars >= maxCharsPerSection) break;
      
      if (block.type === 'text') {
        const remainingChars = maxCharsPerSection - sectionChars;
        const text = block.content.substring(0, remainingChars);
        preview += text + '\n\n';
        sectionChars += text.length;
      } else if (block.type === 'figure') {
        preview += `[FIGURE: ${block.content}]\n\n`;
        sectionChars += 50;
      } else if (block.type === 'table') {
        preview += `[TABLE: ${block.content.substring(0, 200)}]\n\n`;
        sectionChars += 200;
      }
    }
    
    if (sectionChars >= maxCharsPerSection) {
      preview += '[... section continues ...]\n\n';
    }
  }
  
  return preview;
}

