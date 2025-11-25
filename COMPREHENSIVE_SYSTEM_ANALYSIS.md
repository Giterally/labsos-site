# Comprehensive System Analysis - All 8 Question Sets

## Question Set 1: Block Consolidation Status

### 1.1 Where ENABLE_BLOCK_CONSOLIDATION is defined

**Answer: NO ENV VARIABLE EXISTS**

- **Search Result**: No `ENABLE_BLOCK_CONSOLIDATION` environment variable found in codebase
- **Current State**: Consolidation is **ALWAYS ENABLED** - there's no flag to disable it
- **Location**: Consolidation runs unconditionally in `lib/processing/ai-synthesis-pipeline.ts`

### 1.2 Current Value

**Answer: ALWAYS TRUE (hardcoded)**

- Consolidation is **always enabled** - no conditional check
- No environment variable to control it
- Runs for both single-document and multi-document extractions

### 1.3 Where it's checked before running consolidation

**Answer: NO CHECK - ALWAYS RUNS**

**Code Location**: `lib/processing/ai-synthesis-pipeline.ts`

**Single Document Path (lines 873-890)**:
```typescript
const { result: consolidatedResult, log: consolidationLog } = consolidateBlocks(
  singleResult,
  {
    targetBlockCount: 5,
    minNodesPerBlock: 2,
    mergeSimilarBlocks: true,
    similarityThreshold: 0.6
  }
);
```

**Multi-Document Path (lines 974-991)**:
```typescript
const { result: consolidatedWorkflow, log: consolidationLog } = consolidateBlocks(
  mergedWorkflow,
  {
    targetBlockCount: 5,
    minNodesPerBlock: 2,
    mergeSimilarBlocks: true,
    similarityThreshold: 0.6
  }
);
```

**No conditional check** - consolidation always runs after extraction.

### 1.4 Consolidation Logic Location

**File**: `lib/processing/block-consolidator.ts`

**Key Functions**:
- `consolidateBlocks()` - Main entry point (line 24)
- `mergeSingleNodeBlocks()` - Rule 1 (line 86)
- `mergeSimilarNamedBlocks()` - Rule 2 (line 134)
- `mergeCommonPatterns()` - Rule 3 (line 169)
- `mergeSmallestBlocks()` - Rule 4 (line 229)
- `createMergedName()` - Name merging helper (line 285)

**Where Called From**:
- `lib/processing/ai-synthesis-pipeline.ts` line 873 (single doc)
- `lib/processing/ai-synthesis-pipeline.ts` line 974 (multi-doc merge)

---

## Question Set 2: Current Extraction Prompt

### 2.1 System Prompt

**File**: `lib/ai/prompts/workflow-extraction-system.ts`

**Content**:
```typescript
export const WORKFLOW_EXTRACTION_SYSTEM_PROMPT = `You are an expert research workflow analyzer. Your task is to extract experimental workflows from research documents (papers, protocols, dissertations, etc.) and structure them as experiment trees.

CRITICAL REQUIREMENTS:
1. Extract ALL experimental steps, procedures, and analyses from the document
2. Preserve the exact text from the source document - do NOT paraphrase or summarize
3. Group related steps into logical workflow blocks (Protocol, Data Creation, Analysis, Results, Software)
4. Identify dependencies between steps (what must happen before what)
5. Extract nested procedures that could be reusable protocols
6. Maintain the original structure and hierarchy from the document

OUTPUT FORMAT:
You must return valid JSON matching the exact schema provided. The response must be complete, valid JSON with no markdown formatting or additional text.

QUALITY STANDARDS:
- Each node should contain complete, detailed information
- Use exact quotes from the document for content
- Identify all parameters, methods, and procedures mentioned
- Extract dependencies accurately based on document structure
- Mark nested trees when procedures are clearly reusable

Return only the JSON object, no explanations or markdown code blocks.`;
```

### 2.2 User Prompt Template

**File**: `lib/ai/workflow-extractor.ts` - Function `buildUserPrompt()` (line 256)

**Key Sections**:

1. **Base Instructions** (lines 263-278):
   - Extract ALL experiments, methods, analyses, results
   - Create separate nodes for each distinct item
   - Each node should be atomic and specific

2. **Block Naming Guidelines** (lines 311-467):
   - **CRITICAL**: Block names MUST be specific and domain-relevant
   - **BAD examples**: "Data Block", "Methodology Block", "Analysis Block"
   - **GOOD examples**: "Financial Data Preparation & Feature Engineering", "Kalman Filter Model Implementation"
   - Domain-specific examples for Biology, ML/AI, Finance

3. **Block Consolidation Guidelines** (lines 385-467):
   - Avoid creating multiple blocks for same conceptual phase
   - Common consolidation patterns with examples
   - Block count targets (3-5 for short, 4-7 for standard, 5-9 for long, 6-12 for dissertation)
   - Workflow diagram integration guidance
   - Block size guidelines (min 2 nodes per block)
   - Block sequencing guidance

4. **Content Extraction Rules** (lines 1207-1307):
   - One node per figure/table/statistical test
   - Split distinct procedures into separate nodes
   - Minimum content length: 2-3 sentences (150+ chars)
   - Preserve exact text from document

5. **Extraction Checklist** (lines 1308-1637):
   - Step 1: Count items before extracting (figures, tables, tests, etc.)
   - Step 2: Second pass review
   - Mandatory extraction checklist
   - Quality self-check

6. **Document Context** (lines 1646-1688):
   - Document title and first section preview
   - Block organization instructions (5 steps)
   - Key terminology extraction guidance

### 2.3 Examples Sent to LLM

**Location**: `lib/ai/workflow-extractor.ts` lines 468-1160

**Examples Include**:
- Machine learning paper structure (4 blocks, 12 nodes)
- Biology protocol structure (5 blocks, 17 nodes)
- Finance dissertation structure (7 blocks, 24 nodes)
- Bad examples showing over-fragmentation (9-12 blocks)
- Specific extraction examples (statistical tests, figures, methods subsections)

### 2.4 JSON Schema

**File**: `lib/ai/schemas/workflow-extraction-schema.ts`

**Schema Structure**:
```typescript
WorkflowExtractionResultSchema = z.object({
  treeName: z.string(),
  treeDescription: z.string(),
  blocks: z.array(z.object({
    blockName: z.string(), // Descriptive name (not enum!)
    blockType: z.string(), // "methodology", "data", "analysis", "results", "tools" (not enum!)
    blockDescription: z.string().optional(),
    position: z.number(),
    nodes: z.array(z.object({
      nodeId: z.string(),
      title: z.string(),
      content: z.object({ text: z.string() }),
      nodeType: z.string(), // Flexible string (not enum!)
      status: z.enum(['draft', 'complete']),
      dependencies: z.array(z.object({
        referencedNodeTitle: z.string(),
        dependencyType: z.enum(['requires', 'uses_output', 'follows', 'validates']),
        extractedPhrase: z.string(),
        confidence: z.number().optional()
      })),
      attachments: z.array(...),
      parameters: z.record(z.any()).optional(),
      metadata: z.object({...}).optional(),
      isNestedTree: z.boolean().optional()
    }))
  })),
  nestedTrees: z.array(...).default([])
})
```

**Key Points**:
- `blockName`, `blockType`, `nodeType` are **strings** (not enums) - allows flexibility
- Schema is flexible to accept domain-specific types

---

## Question Set 3: Provider Selection & Model Used

### 3.1 Provider Selection Logic

**File**: `lib/ai/provider.ts` - Function `selectProviderForDocument()` (line 483)

**Decision Logic**:
```typescript
const TOKEN_THRESHOLD_FOR_GEMINI = 120000; // 120K tokens

function selectProviderForDocument(document: StructuredDocument): WorkflowAIProvider {
  const provider = process.env.AI_PRIMARY_PROVIDER || 'openai';
  const fallbackProvider = process.env.AI_FALLBACK_PROVIDER || 'gemini';
  
  // Estimate full prompt size (document + overhead)
  const { documentTokens, estimatedFullPrompt } = estimateFullPromptTokens(document);
  
  // Decision logic
  if (estimatedFullPrompt < TOKEN_THRESHOLD_FOR_GEMINI) {
    // Use PRIMARY_PROVIDER (default: OpenAI)
    if (provider === 'openai' && isProviderRecentlyRateLimited('openai')) {
      return new WorkflowGeminiProvider(); // Fallback if rate limited
    }
    return new WorkflowOpenAIProvider();
  } else {
    // Use FALLBACK_PROVIDER (default: Gemini) for large documents
    return new WorkflowGeminiProvider();
  }
}
```

**Token Estimation** (lines 458-477):
```typescript
function estimateFullPromptTokens(document: StructuredDocument) {
  const docSize = JSON.stringify(document).length;
  const documentTokens = Math.ceil(docSize / 4);
  
  // Prompt overhead:
  // - System prompt: ~500 tokens
  // - User prompt structure: ~2000-3000 tokens
  // - Complexity-aware guidance: ~500-1000 tokens
  // - Safety margin: 20%
  const promptOverhead = 3500;
  const safetyMargin = 1.2;
  
  const estimatedFullPrompt = Math.ceil((documentTokens + promptOverhead) * safetyMargin);
  
  return { documentTokens, estimatedFullPrompt };
}
```

### 3.2 Token Thresholds

**Threshold**: **120,000 tokens** (120K)

**Decision**:
- **< 120K tokens** → OpenAI GPT-4o (primary)
- **≥ 120K tokens** → Gemini 1.5 Pro (fallback)

**Models Available**:

| Provider | Model | Input Limit | Output Limit | Input Cost | Output Cost |
|----------|-------|-------------|--------------|------------|-------------|
| **OpenAI** | gpt-4o-2024-08-06 | 128K | 16K | $2.50/M | $10.00/M |
| **Gemini** | gemini-1.5-pro | 2M | 8K | $1.25/M | $5.00/M |

### 3.3 Environment Variables

**Available Variables**:
- `AI_PRIMARY_PROVIDER` - Default: `'openai'` (line 486)
- `AI_FALLBACK_PROVIDER` - Default: `'gemini'` (line 487)

**No `PROVIDER_OVERRIDE` variable exists**

### 3.4 What Triggers Gemini vs OpenAI

**Triggers for Gemini**:
1. **Document size**: Estimated full prompt ≥ 120K tokens
2. **Rate limit fallback**: OpenAI recently rate limited (within 10 minutes)
3. **Truncation fallback**: OpenAI response truncated → automatic retry with Gemini

**Triggers for OpenAI**:
1. **Document size**: Estimated full prompt < 120K tokens
2. **Primary provider**: Default selection for smaller documents
3. **Rate limit fallback**: Gemini rate limited → fallback to OpenAI (if configured)

**Rate Limit Tracking** (lines 384-409):
- In-memory map tracks rate limits
- 10-minute window (600,000ms)
- Automatically avoids recently rate-limited providers

---

## Question Set 4: Extraction Output Validation

### 4.1 Where LLM Response is Validated

**Location**: Provider-specific validation in:
- `lib/ai/providers/openai-provider.ts` line 116
- `lib/ai/providers/gemini-provider.ts` line 76

**Validation Code**:
```typescript
// OpenAI Provider (line 116)
const validatedResult = WorkflowExtractionResultSchema.parse(result);

// Gemini Provider (line 76)
const validatedResult = WorkflowExtractionResultSchema.parse(extracted);
```

**Schema**: `WorkflowExtractionResultSchema` from `lib/ai/schemas/workflow-extraction-schema.ts`

### 4.2 Quality Checks on Extracted Blocks

**Post-Extraction Validation** (lines 50-82 in `workflow-extractor.ts`):

1. **Over-fragmentation Warning**:
   ```typescript
   if (result.blocks.length > 9) {
     console.warn(`[WORKFLOW_EXTRACTOR] Warning: ${result.blocks.length} blocks detected. Consider consolidation.`);
   }
   ```

2. **Single-Node Block Warning**:
   ```typescript
   const singleNodeBlocks = result.blocks.filter(b => b.nodes.length === 1);
   if (singleNodeBlocks.length > 0) {
     console.warn(`[WORKFLOW_EXTRACTOR] Warning: ${singleNodeBlocks.length} block(s) with only 1 node:`, 
       singleNodeBlocks.map(b => b.blockName));
   }
   ```

3. **Duplicate Block Detection**:
   ```typescript
   // Check for potential duplicates (>60% similarity in names)
   const blockNames = result.blocks.map(b => b.blockName.toLowerCase());
   for (let i = 0; i < blockNames.length; i++) {
     for (let j = i + 1; j < blockNames.length; j++) {
       const similarity = calculateSimilarity(blockNames[i], blockNames[j]);
       if (similarity > 0.6) {
         console.warn(`[WORKFLOW_EXTRACTOR] Potential duplicate blocks detected:`,
           `"${result.blocks[i].blockName}" and "${result.blocks[j].blockName}" (${Math.round(similarity * 100)}% similar)`);
       }
     }
   }
   ```

4. **Coverage Ratio Check** (lines 697-713 in `ai-synthesis-pipeline.ts`):
   ```typescript
   const coverageRatio = expectedNodes > 0 ? totalNodes / expectedNodes : 0;
   
   if (coverageRatio < 0.5) {
     console.log(`⚠️  WARNING: Severe under-extraction detected!`);
   } else if (coverageRatio < 0.7) {
     console.log(`⚠️  WARNING: Moderate under-extraction detected (coverage < 70%)`);
   }
   ```

### 4.3 Error Handling for Malformed Responses

**JSON Parse Error Handling**:

**OpenAI Provider** (lines 79-113):
```typescript
try {
  result = JSON.parse(content);
} catch (parseError) {
  const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
  
  // Detect truncation errors
  const isTruncationError = 
    errorMessage.includes('Unterminated string') ||
    errorMessage.includes('Unexpected end') ||
    errorMessage.includes('Expected') && errorMessage.includes('after') ||
    isLikelyTruncated ||
    finishReason === 'length';
  
  if (isTruncationError) {
    throw new Error('Document too large for GPT-4o (exceeded 16K output limit)...');
  }
  
  throw new Error(`Failed to parse OpenAI response as JSON: ${errorMessage}...`);
}
```

**Gemini Provider** (lines 65-73):
```typescript
try {
  extracted = JSON.parse(content);
} catch (parseError) {
  const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
  throw new Error(
    `Failed to parse Gemini response as JSON: ${errorMessage}. ` +
    `The response may be malformed or truncated. Content preview: ${content.substring(0, 200)}...`
  );
}
```

**Zod Schema Validation** (lines 116 in OpenAI, 76 in Gemini):
```typescript
const validatedResult = WorkflowExtractionResultSchema.parse(result);
// Throws ZodError if schema doesn't match
```

**ZodError Handling** (lines 88-101 in `workflow-extractor.ts`):
```typescript
if (error.name === 'ZodError') {
  console.error(`[WORKFLOW_EXTRACTOR] Schema validation failed with ${error.errors?.length || 0} errors:`);
  const errorPreview = error.errors?.slice(0, 5).map((e: any) => 
    `  - ${e.path.join('.')}: ${e.message}`
  ).join('\n');
  console.error(`[WORKFLOW_EXTRACTOR] Validation errors:\n${errorPreview}`);
  
  throw new Error(`Invalid workflow extraction result: ${error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ')}`);
}
```

### 4.4 Retry Logic if Extraction Fails

**Retry Wrapper**: `lib/ai/base-provider.ts` - Function `withRetry()` (line 44)

**Retry Logic**:
```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  // Exponential backoff: 1s, 2s, 4s, 8s...
  // Retries on rate limits, service errors, network errors
  // Respects retry-after headers for rate limits
}
```

**Automatic Fallback** (lines 85-155 in `workflow-extractor.ts`):
```typescript
} catch (error: any) {
  const isRateLimit = errorStatus === 429 || errorMessage?.includes('rate limit');
  const isTruncationError = 
    errorMessage?.includes('exceeded') && errorMessage?.includes('output limit') ||
    errorMessage?.includes('too large') ||
    errorMessage?.includes('truncated') ||
    errorMessage?.includes('Unterminated string');
  
  if ((isRateLimit || isTruncationError) && shouldAttemptFallback(provider, structuredDoc)) {
    console.log(`[WORKFLOW_EXTRACTOR] ${errorType} detected, falling back to alternative provider`);
    
    const fallbackProvider = getFallbackProvider(provider, structuredDoc);
    const fallbackResult = await fallbackProvider.extractWorkflowFromDocument(...);
    
    return fallbackResult; // Returns fallback result
  }
  
  throw error; // Re-throw if no fallback or fallback fails
}
```

**Retry Conditions**:
- Rate limit errors (429)
- Truncation errors
- Network errors (ECONNRESET, ETIMEDOUT)
- Service errors (503)

**No Retry On**:
- Authentication errors (401)
- Schema validation errors (ZodError)
- Timeout errors

---

## Question Set 5: Recent Extraction Logs

### 5.1 Console Logs from Last Extraction

**Log Format** (from `workflow-extractor.ts`):

**Provider Selection**:
```
[PROVIDER_SELECTION] Document tokens: X, Estimated full prompt: Y tokens
[PROVIDER_SELECTION] Using openai (estimated prompt < 120000 tokens)
```

**Extraction Start**:
```
[WORKFLOW_EXTRACTOR] Starting extraction from pdf document: "UCL_dissertation.pdf"
[WORKFLOW_EXTRACTOR] Formatted document: X chars, 22 sections
[WORKFLOW_EXTRACTOR] Using model: gpt-4o-2024-08-06
[WORKFLOW_EXTRACTOR] Model capacity: 128000 input tokens, 16384 output tokens
[WORKFLOW_EXTRACTOR] Complexity strategy: comprehensive (estimated X nodes)
```

**Extraction Complete**:
```
[WORKFLOW_EXTRACTOR] ✓ Extraction complete: X blocks, Y nodes
[WORKFLOW_EXTRACTOR] Total time: Xms (LLM: Yms, processing: Zms)
```

**Cost Logging** (OpenAI):
```
[COST] Estimated: $X.XXXX (input_tokens in, output_tokens out)
[TOKENS] Input: X, Output: Y
```

**Consolidation Logs**:
```
[BLOCK_CONSOLIDATOR] Starting consolidation: X blocks → target 5
[BLOCK_CONSOLIDATOR] Merged single-node "..." into "..."
[BLOCK_CONSOLIDATOR] Consolidation complete: X → Y blocks
[FAST_IMPORT] Block consolidation applied to single document:
[FAST_IMPORT] X → Y blocks
```

### 5.2 Which Provider/Model Was Used

**From Logs**: Need to check server logs for:
```
[WORKFLOW_EXTRACTOR] Using model: <model-name>
```

**Possible Values**:
- `gpt-4o-2024-08-06` (OpenAI)
- `gemini-1.5-pro` (Gemini)

**For UCL_dissertation.pdf (22 sections)**:
- Likely **Gemini 1.5 Pro** (dissertation = large document, probably > 120K tokens)
- But could be **GPT-4o** if document was smaller than expected

### 5.3 Token Counts

**Logged In**:
- `lib/ai/providers/openai-provider.ts` lines 122-130
- `lib/ai/providers/gemini-provider.ts` lines 87-95

**Log Format**:
```
[COST] Estimated: $0.XXXX (input_tokens in, output_tokens out)
[TOKENS] Input: X, Output: Y
```

**Not Stored in Database** - Only logged to console

### 5.4 Warnings During Extraction

**Warnings Generated**:
1. Over-fragmentation (>9 blocks)
2. Single-node blocks
3. Duplicate blocks (>60% similarity)
4. Under-extraction (coverage < 50% or < 70%)

**Location**: `lib/ai/workflow-extractor.ts` lines 60-82

### 5.5 Whether Consolidation Ran

**Consolidation Always Runs** (no conditional check)

**Logs to Check**:
```
[BLOCK_CONSOLIDATOR] Starting consolidation: X blocks → target 5
[BLOCK_CONSOLIDATOR] Already at target count (X blocks)  // If skipped
[BLOCK_CONSOLIDATOR] Consolidation complete: X → Y blocks
[FAST_IMPORT] Block consolidation applied to single document:
```

**If consolidation ran**: Will see merge logs
**If skipped**: Will see "Already at target count"

---

## Question Set 6: Block Naming Logic

### 6.1 Does LLM Generate blockName Directly?

**Answer: YES**

- LLM generates `blockName` directly in the JSON response
- No post-processing of block names (except during consolidation merges)
- Schema expects: `blockName: z.string()` - LLM must provide it

**Prompt Instructions** (lines 311-467 in `workflow-extractor.ts`):
- Explicit guidelines for block naming
- Good/bad examples
- Domain-specific examples
- Consolidation guidance

### 6.2 Post-Processing of Block Names

**Answer: YES - During Consolidation Only**

**Location**: `lib/processing/block-consolidator.ts`

**When Block Names Are Modified**:

1. **Single-Node Merge** (line 111):
   ```typescript
   if (!target.blockName.includes('&') && bestScore < 0.7) {
     target.blockName = `${target.blockName} & ${block.blockName}`;
   }
   ```

2. **Similar Name Merge** (line 150):
   ```typescript
   blocks[j].blockName = createMergedName(name1, name2);
   ```

3. **Pattern-Based Merge** (line 213):
   ```typescript
   blocks[targetIndex].blockName = pattern.targetName;
   // Uses hardcoded pattern names like "Performance Evaluation & Results Analysis"
   ```

4. **Size-Based Merge** (line 242):
   ```typescript
   secondSmallest.block.blockName = createMergedName(
     secondSmallest.block.blockName,
     smallest.block.blockName
   );
   ```

### 6.3 How "Model Implementation Analysis State Space" Gets Created

**Answer: Via `createMergedName()` Function**

**Function**: `lib/processing/block-consolidator.ts` lines 285-304

**Logic**:
```typescript
function createMergedName(name1: string, name2: string): string {
  // Remove duplicated words
  const words1 = name1.split(/[\s&]+/).filter(w => w.length > 0);
  const words2 = name2.split(/[\s&]+/).filter(w => w.length > 0);
  
  const uniqueWords = new Set([...words1, ...words2.filter(w => 
    !words1.some(w1 => w1.toLowerCase() === w.toLowerCase())
  )]);
  
  const merged = Array.from(uniqueWords).join(' ');
  
  // If too long, use "X & Y" format with key terms
  if (merged.length > 60) {
    const key1 = extractKeyTerm(name1);
    const key2 = extractKeyTerm(name2);
    return `${key1} & ${key2}`;
  }
  
  return merged;
}
```

**Example**:
- Input: `"Model Implementation"` + `"Analysis State Space"`
- Process: Removes duplicates, joins unique words
- Output: `"Model Implementation Analysis State Space"`

**If Too Long** (>60 chars):
- Uses `extractKeyTerm()` to get first 2-3 words from each
- Format: `"Key Term 1 & Key Term 2"`

### 6.4 Where Block Names Are Assigned/Modified

**Locations**:

1. **LLM Generation**: Directly in extraction JSON response
2. **Consolidation Merges**: `lib/processing/block-consolidator.ts`
   - Line 111: Single-node merge
   - Line 150: Similar name merge
   - Line 213: Pattern-based merge
   - Line 242: Size-based merge
3. **No Other Post-Processing**: Block names are not modified elsewhere

---

## Question Set 7: Content to Node Mapping

### 7.1 Extraction Algorithm/Instructions

**File**: `lib/ai/workflow-extractor.ts` - Function `buildUserPrompt()`

**Key Instructions**:

1. **"ONE NODE PER X" Rules** (lines 1345-1365):
   - One node per figure
   - One node per table
   - One node per statistical test
   - One node per experimental condition
   - One node per Methods subsection
   - One node per distinct protocol/procedure
   - One node per model/algorithm
   - One node per validation step

2. **Counting Before Extracting** (lines 1318-1343):
   - Count figures, tables, tests, subsections
   - Extract nodes based on counts
   - Verify node count matches item count

3. **Content Extraction Strategy** (lines 1248-1254):
   - Start with key sentence/phrase
   - Add 2-3 sentences of surrounding context
   - Include relevant parameters, conditions, details
   - Preserve exact wording from source

4. **Split vs Keep Together** (lines 1263-1286):
   - **SPLIT** if: Distinct procedures, different conditions, multiple tests, multiple results
   - **KEEP TOGETHER** if: One continuous procedure, tightly coupled steps, single result with explanation

### 7.2 How Document Sections Map to Blocks/Nodes

**Section Processing** (lines 131-172 in `workflow-extractor.ts`):
```typescript
export function formatStructuredDocumentForLLM(doc: StructuredDocument): string {
  for (const section of doc.sections) {
    const headingPrefix = '#'.repeat(section.level);
    output += `\n${headingPrefix} ${section.title}\n`;
    output += `[Page ${section.pageRange[0]}-${section.pageRange[1]}]\n\n`;
    
    for (const block of section.content) {
      switch (block.type) {
        case 'text': output += `${block.content}\n\n`; break;
        case 'list': output += `- ${block.content}\n`; break;
        case 'table': output += `[TABLE]\n${block.content}\n[/TABLE]\n\n`; break;
        case 'figure': output += `[FIGURE: Page ${block.pageNumber}]\n${block.content}\n\n`; break;
      }
    }
  }
}
```

**LLM Instructions**:
- Document structure is preserved with section hierarchy
- LLM sees all sections with their content
- LLM decides which sections map to which blocks/nodes
- **No explicit section-to-block mapping logic** - LLM makes decisions

### 7.3 Section Detection Logic

**File**: `lib/processing/document-analyzer.ts`

**Section Analysis** (lines 18-148):
```typescript
export function analyzeDocumentComplexity(doc: StructuredDocument): DocumentComplexity {
  const sections = doc.sections || [];
  const totalSections = sections.length;
  const subsections = sections.filter(s => s.level > 1).length;
  const sectionDepth = Math.max(...sections.map(s => s.level), 1);
  
  // Count experiment indicators
  const experimentKeywords = ['method', 'procedure', 'protocol', 'experiment', ...];
  let experimentIndicators = 0;
  for (const section of sections) {
    // Check if section title or content contains keywords
  }
  
  // Count figures, tables
  const figureCount = sections.reduce((sum, s) => {
    return sum + s.content.filter(c => c.type === 'figure' || c.type === 'table').length;
  }, 0);
  
  // Estimate node count based on sections, figures, keywords
}
```

**Section Filtering** (lines 154-237):
- Filters out invalid sections (fragments, citations, equations)
- Validates section titles and content
- Used for hierarchical extraction splitting

### 7.4 How Methodology Content is Identified

**Answer: LLM-Based, Not Rule-Based**

**No Explicit Methodology Detection**:
- LLM receives full document with section structure
- LLM uses prompt instructions to identify methodology
- Prompt guides LLM but doesn't explicitly tag sections

**Prompt Guidance** (lines 455-467):
```
**Block Sequencing:**
Typical sequence (adapt to actual document):
1. Data acquisition/preparation phase
2. Methodology development/implementation phase
3. Experimental execution/analysis phase
4. Results evaluation/interpretation phase
```

**LLM Decision Process**:
1. Reads document sections
2. Identifies methodology sections based on content
3. Groups methodology content into blocks
4. Creates nodes from methodology content

**No Section Tagging**: Sections are not pre-tagged as "methodology" - LLM infers from content

---

## Question Set 8: Cost Tracking

### 8.1 Database Table Storing Extraction Costs

**Answer: NO DEDICATED TABLE**

- **No `extraction_costs` table exists**
- **No `extraction_metadata` table exists**
- Costs are **only logged to console**, not stored in database

**Cost Logging** (not storage):
- `lib/ai/providers/openai-provider.ts` lines 124-130
- `lib/ai/providers/gemini-provider.ts` lines 89-95

**Log Format**:
```
[COST] Estimated: $0.XXXX (input_tokens in, output_tokens out)
[TOKENS] Input: X, Output: Y
```

### 8.2 Recent Extraction Records with Token Counts

**Answer: NOT STORED IN DATABASE**

- Token counts are logged but not persisted
- No database table stores extraction costs
- Only available in server logs

**Where to Find**:
- Server console logs
- Vercel function logs
- Application logs (if configured)

### 8.3 Which Model Was Used

**Answer: LOGGED BUT NOT STORED**

**Log Location**: `lib/ai/workflow-extractor.ts` line 32
```
[WORKFLOW_EXTRACTOR] Using model: <model-name>
```

**Not Stored In**:
- Database
- Extraction metadata
- Proposal metadata

**Only Available In**: Server logs

### 8.4 Actual $ Cost Per Extraction

**Answer: CALCULATED BUT NOT STORED**

**Cost Calculation** (OpenAI - lines 124-127):
```typescript
const estimatedCost = (
  (estimatedInputTokens / 1000000) * modelInfo.costPerMillionInputTokens +
  (outputTokens / 1000000) * modelInfo.costPerMillionOutputTokens
);

console.log(`[COST] Estimated: $${estimatedCost.toFixed(4)} (${estimatedInputTokens} in, ${outputTokens} out)`);
```

**Cost Calculation** (Gemini - lines 89-92):
```typescript
const estimatedCost = (
  (estimatedInputTokens / 1000000) * modelInfo.costPerMillionInputTokens +
  (outputTokens / 1000000) * modelInfo.costPerMillionOutputTokens
);

console.log(`[COST] Estimated: $${estimatedCost.toFixed(4)} (${estimatedInputTokens} in, ${outputTokens} out)`);
```

**Pricing**:
- **OpenAI GPT-4o**: $2.50/M input, $10.00/M output
- **Gemini 1.5 Pro**: $1.25/M input, $5.00/M output

**Not Persisted**: Costs are calculated and logged but not stored in database

---

## Summary: Critical Findings

### ✅ Consolidation Status
- **ENABLED**: Always runs (no flag to disable)
- **Location**: `lib/processing/block-consolidator.ts`
- **Runs After**: Single-doc extraction (line 873) and multi-doc merge (line 974)

### ✅ Extraction Prompt
- **System Prompt**: `lib/ai/prompts/workflow-extraction-system.ts` (24 lines)
- **User Prompt**: `lib/ai/workflow-extractor.ts` `buildUserPrompt()` (~1400 lines)
- **Includes**: Block naming guidelines, consolidation guidance, extraction rules, examples

### ✅ Provider Selection
- **Threshold**: 120K tokens
- **< 120K**: OpenAI GPT-4o (default)
- **≥ 120K**: Gemini 1.5 Pro (default)
- **Fallback**: Automatic on rate limit/truncation

### ✅ Validation
- **Zod Schema**: `WorkflowExtractionResultSchema.parse()`
- **Quality Checks**: Over-fragmentation, single-node blocks, duplicates, coverage ratio
- **Error Handling**: JSON parse errors, truncation detection, ZodError handling
- **Retry Logic**: Exponential backoff, automatic fallback

### ✅ Block Naming
- **LLM Generated**: Directly in JSON response
- **Post-Processing**: Only during consolidation merges
- **Merging Function**: `createMergedName()` combines words, removes duplicates

### ✅ Content Mapping
- **LLM-Based**: No explicit section-to-block mapping
- **Instructions**: "ONE NODE PER X" rules, counting guidance
- **Section Detection**: Analyzes sections for complexity, filters invalid sections

### ✅ Cost Tracking
- **NOT STORED**: Only logged to console
- **Calculation**: Done in provider files
- **Available In**: Server logs only

---

## Root Cause Analysis

Based on the analysis, here are the likely issues:

1. **Consolidation IS Running** - So that's not the problem
2. **Model Selection** - Need to check if Gemini was used (likely for dissertation)
3. **Prompt Quality** - Prompt is comprehensive but may need more specificity
4. **No Cost Storage** - Can't verify actual costs from database
5. **LLM Decision Making** - Content-to-node mapping is entirely LLM-based (no rules)

**Next Steps**: Check server logs to confirm which model was used and whether consolidation actually ran.

