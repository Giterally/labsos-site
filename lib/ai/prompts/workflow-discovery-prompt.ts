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
   📐 METHODS & ANALYSES (LIST ALL)
   ============================================
   
   Look for ANY analytical methods, statistical tests, or procedures mentioned.
   
   WHAT TO LOOK FOR:
   - Statistical tests: ANY test mentioned (t-test, ANOVA, chi-square, Mann-Whitney, etc.)
   - Dimensionality reduction: PCA, ICA, Factor Analysis, t-SNE, UMAP, etc.
   - Feature selection: RFE, LASSO, Ridge, Forward Selection, etc.
   - Machine learning: SVM, Random Forest, Neural Networks, Regression, Clustering, etc.
   - Laboratory techniques: PCR, Western Blot, ELISA, Mass Spec, Chromatography, etc.
   - Imaging methods: MRI, CT, SEM, TEM, Confocal, Fluorescence, etc.
   - Physical analyses: XRD, DSC, TGA, Rheology, Tensile Testing, etc.
   - Computational methods: Finite Element, Molecular Dynamics, Monte Carlo, etc.
   
   CRITICAL PATTERN: Look for phrases like:
   - "was performed", "was used", "was applied", "was conducted"
   - "using [METHOD NAME]", "via [METHOD NAME]", "by [METHOD NAME]"
   - "analyzed with", "measured by", "tested using"
   - Method names in parentheses: "(PCA)", "(t-test)", "(ELISA)"
   - Method names with citations: "correlation analysis [15]"
   
   EXTRACTION RULE:
   - If you see "PCA was performed" → Add "Principal Component Analysis" to statisticalTests
   - If you see "analyzed using ANOVA" → Add "ANOVA" to statisticalTests
   - If you see "via Western Blot" → Add "Western Blot" to statisticalTests
   - If you see "(SEM)" after a noun → Add "Scanning Electron Microscopy" to statisticalTests
   
   DO NOT:
   - List methods that aren't mentioned in the document
   - Assume standard methods exist just because it's a certain field
   - Add methods from your training knowledge
   
   ONLY list methods explicitly mentioned in the document content.
   
   Example - CORRECT:
   Document says: "PCA was performed to reduce dimensionality"
   → statisticalTests: ["Principal Component Analysis"]
   
   Document says: "Images were captured using confocal microscopy"
   → statisticalTests: ["Confocal Microscopy"]
   
   Example - WRONG:
   Document is about biology but doesn't mention PCR
   → statisticalTests: [] ← CORRECT (don't add PCR just because it's biology)
   → statisticalTests: ["PCR"] ← WRONG
   
   ============================================
   🤖 MODELS, ALGORITHMS & TOOLS (LIST ALL)
   ============================================
   
   Look for ANY computational models, algorithms, or analytical tools mentioned.
   
   WHAT TO LOOK FOR:
   - Machine learning models: Neural Networks, SVM, Random Forest, XGBoost, etc.
   - Statistical models: Linear Regression, ARIMA, Kalman Filter, Hidden Markov, etc.
   - Simulation tools: COMSOL, ANSYS, Gaussian, LAMMPS, etc.
   - Mathematical models: Differential equations, Agent-based models, etc.
   - Domain-specific models: Pharmacokinetic models, Climate models, etc.
   
   CRITICAL PATTERN: Look for:
   - Model names in capitals or with specific versions: "BERT", "GPT-4", "ResNet50"
   - Phrases like "using [MODEL]", "implemented [MODEL]", "[MODEL] was used"
   - Comparisons: "compared LKF and EKF", "tested three models: A, B, C"
   
   EXTRACTION RULE:
   - List each variant separately: "Linear Kalman Filter" and "Extended Kalman Filter" are TWO models
   - Don't combine: "Kalman Filters" should be split into LKF and EKF if both mentioned
   
   Example - CORRECT:
   Document says: "Linear Kalman Filter and Extended Kalman Filter were compared"
   → models: ["Linear Kalman Filter", "Extended Kalman Filter"]
   
   Document says: "analyzed using a pharmacokinetic two-compartment model"
   → models: ["Pharmacokinetic Two-Compartment Model"]
   
   Example - WRONG:
   Document is about ML but only mentions "neural networks" generally
   → models: ["BERT", "GPT-4"] ← WRONG (specific models not mentioned)
   → models: ["Neural Networks"] ← CORRECT
   
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

===========================================
📚 EXAMPLES FROM DIFFERENT RESEARCH DOMAINS
===========================================

FINANCE/ECONOMICS PAPER:
methods: ["Principal Component Analysis", "Correlation Analysis", "Kalman Filter"]
models: ["Linear Kalman Filter", "Extended Kalman Filter", "ARIMA"]
figures: [{"title": "Performance Comparison", ...}]

BIOLOGY PAPER:
methods: ["Western Blot", "PCR", "Flow Cytometry", "ELISA"]
models: ["Pharmacokinetic Model", "Dose-Response Curve"]
figures: [{"title": "Gene Expression Heatmap", ...}]

MATERIALS SCIENCE PAPER:
methods: ["X-Ray Diffraction", "Scanning Electron Microscopy", "Tensile Testing"]
models: ["Finite Element Analysis", "Molecular Dynamics Simulation"]
figures: [{"title": "Stress-Strain Curve", ...}]

PSYCHOLOGY PAPER:
methods: ["ANOVA", "t-test", "Regression Analysis", "Structural Equation Modeling"]
models: ["Linear Mixed Effects Model", "Hierarchical Model"]
figures: [{"title": "Reaction Time Distribution", ...}]

PHYSICS PAPER:
methods: ["Monte Carlo Simulation", "Spectroscopy", "Interferometry"]
models: ["Quantum Field Theory Model", "Statistical Mechanics Model"]
figures: [{"title": "Energy Spectrum", ...}]

NOTICE: Each field has completely different methods and models.
Your job is to find what's ACTUALLY in the document, not assume based on field.

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

