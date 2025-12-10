# Complete Flow: File Import to Node Generation

## Overview

This document explains the complete pipeline from uploading a file to generating experiment tree nodes, including all models used, costs, and decision points.

---

## Phase 1: File Upload & Storage

### Step 1.1: File Upload (`app/api/import/upload/route.ts`)

**What happens:**
1. User uploads file via frontend (max 25MB)
2. File validation (type, size, user limit: 7 files max)
3. File uploaded to Supabase Storage (`user-uploads` bucket)
4. `ingestion_sources` record created with status `'uploaded'`

**No AI/LLM usage** - Pure file handling

**Cost:** $0 (storage only)

---

## Phase 2: Preprocessing

### Step 2.1: Document Parsing (`lib/processing/preprocessing-pipeline.ts`)

**What happens:**
1. File retrieved from Supabase Storage
2. Parser selected based on file type:
   - **PDF**: `pdf-parse` library (text extraction with page markers)
   - **Word**: `mammoth` library (preserves formatting)
   - **Excel**: `xlsx` library (sheet-by-sheet parsing)
   - **PowerPoint**: `officegen` or similar
   - **Video**: Whisper API (transcription)
   - **Audio**: Whisper API (transcription)
   - **Text/Markdown**: Direct text extraction

3. Creates `StructuredDocument` object:
   ```typescript
   {
     fileName: string,
     type: 'pdf' | 'word' | 'excel' | etc,
     sections: Array<{
       title: string,
       level: number,
       content: Array<{ type, content }>,
       pageRange: [number, number]
     }>,
     metadata: { ... }
   }
   ```

4. Stores in `structured_documents` table (user-scoped)

**AI/LLM Usage:**
- **Video/Audio**: OpenAI Whisper API (if used)
  - Cost: ~$0.006 per minute of audio/video

**Cost:** 
- Text files: $0
- Video/Audio: ~$0.006 per minute

---

## Phase 3: AI Workflow Extraction

### Step 3.1: Document Complexity Analysis (`lib/processing/document-analyzer.ts`)

**What happens:**
1. Analyzes document structure (sections, length, content density)
2. Determines extraction strategy:
   - `simple`: 5-15 nodes (short papers)
   - `moderate`: 15-30 nodes (standard papers)
   - `complex`: 30-50 nodes (long papers)
   - `comprehensive`: 40-100+ nodes (dissertations)

3. Recommends provider and extraction method

**No AI/LLM usage** - Rule-based analysis

**Cost:** $0

---

### Step 3.2: Provider Selection (`lib/ai/provider.ts`)

**Decision Logic:**

```
IF estimated_prompt_tokens < 120,000:
  → Use PRIMARY_PROVIDER (default: OpenAI GPT-4o)
ELSE:
  → Use FALLBACK_PROVIDER (default: Gemini 1.5 Pro)
```

**Provider Selection Factors:**
- Document size (token count)
- Recent rate limit history
- Provider availability

**Models Available:**

| Provider | Model | Input Limit | Output Limit | Input Cost | Output Cost |
|----------|-------|-------------|--------------|------------|-------------|
| **OpenAI** | GPT-4o-2024-08-06 | 128K tokens | 16K tokens | $2.50/M | $10.00/M |
| **Gemini** | Gemini 1.5 Pro | 2M tokens | 8K tokens | $1.25/M | $5.00/M |

**Cost:** $0 (selection only)

---

### Step 3.3: Workflow Extraction (`lib/ai/workflow-extractor.ts`)

**What happens:**
1. Builds comprehensive prompt:
   - System prompt (~500 tokens)
   - User prompt with document content
   - Extraction guidelines and examples (~2000-3000 tokens)
   - Complexity-aware instructions

2. Sends to selected LLM provider

3. LLM returns structured JSON:
   ```json
   {
     "treeName": "Experiment Title",
     "treeDescription": "Brief description",
     "blocks": [
       {
         "blockName": "Descriptive Block Name",
         "blockType": "methodology",
         "blockDescription": "...",
         "position": 1,
         "nodes": [
           {
             "nodeId": "node-1",
             "title": "Node Title",
             "content": { "text": "..." },
             "nodeType": "protocol",
             "dependencies": [...],
             "attachments": [...]
           }
         ]
       }
     ]
   }
   ```

4. Validates response with Zod schema

5. **Automatic Fallback:**
   - If OpenAI truncates → Automatically retries with Gemini
   - If rate limit → Automatically retries with Gemini
   - If timeout → Error (no fallback)

**AI/LLM Usage:**
- **Primary**: OpenAI GPT-4o OR Gemini 1.5 Pro
- **Fallback**: Automatic switch to alternative provider

**Cost Calculation:**

**Example: 100-page dissertation**
- Input tokens: ~80,000 (document + prompt overhead)
- Output tokens: ~12,000 (extracted workflow JSON)

**OpenAI GPT-4o:**
- Input: 80,000 / 1,000,000 × $2.50 = **$0.20**
- Output: 12,000 / 1,000,000 × $10.00 = **$0.12**
- **Total: $0.32**

**Gemini 1.5 Pro:**
- Input: 80,000 / 1,000,000 × $1.25 = **$0.10**
- Output: 12,000 / 1,000,000 × $5.00 = **$0.06**
- **Total: $0.16**

**Typical Costs:**
- Short paper (10-30 pages): $0.05 - $0.15
- Standard paper (30-80 pages): $0.15 - $0.35
- Long paper (80-150 pages): $0.35 - $0.60
- Dissertation (150+ pages): $0.60 - $1.20

---

### Step 3.4: Block Consolidation (`lib/processing/block-consolidator.ts`)

**What happens:**
1. Analyzes extracted blocks for fragmentation
2. Applies 4 consolidation rules:
   - **Rule 1**: Merge single-node blocks into similar neighbors
   - **Rule 2**: Merge blocks with similar names (>60% similarity)
   - **Rule 3**: Merge common patterns (results, analysis, setup)
   - **Rule 4**: Merge smallest blocks if still over target (5 blocks)

3. Reduces block count (e.g., 12 blocks → 5-6 blocks)
4. Preserves all nodes (no content loss)

**No AI/LLM usage** - Rule-based consolidation

**Cost:** $0

---

### Step 3.5: Multi-Document Merging (`lib/ai/multi-document-synthesis.ts`)

**What happens (if multiple documents):**
1. If 2+ documents selected, merges workflows
2. Uses LLM to create coherent unified workflow
3. Resolves conflicts and dependencies

**AI/LLM Usage:**
- **Model**: Same as extraction (OpenAI or Gemini)
- **Input**: All extracted workflows + merge instructions
- **Output**: Unified workflow structure

**Cost:**
- Additional ~$0.10 - $0.30 per merge (depends on number of documents)

---

## Phase 4: Post-Extraction Processing

### Step 4.1: Attachment Resolution (`lib/processing/attachment-resolver.ts`)

**What happens:**
1. Scans node content for figure/table references
2. Matches references to actual figures/tables in document
3. Creates attachment records linking nodes to source content

**No AI/LLM usage** - Pattern matching

**Cost:** $0

---

### Step 4.2: Dependency Extraction (`lib/processing/dependency-extractor.ts`)

**What happens:**
1. Analyzes node content for dependency phrases
2. Matches dependencies to other nodes
3. Creates dependency graph

**No AI/LLM usage** - Rule-based extraction

**Cost:** $0

---

### Step 4.3: Nested Tree Detection (`lib/processing/nested-tree-detector.ts`)

**What happens:**
1. Identifies reusable sub-workflows
2. Marks nodes as potential nested trees

**No AI/LLM usage** - Heuristic-based

**Cost:** $0

---

### Step 4.4: Node Summary Generation (`lib/ai/synthesis.ts`)

**What happens:**
1. For each extracted node, generates 1-sentence summary
2. Uses LLM to create concise summaries

**AI/LLM Usage:**
- **Model**: GPT-4o-mini (lightweight, fast)
- **Input**: Node content (~500-2000 tokens per node)
- **Output**: 1-sentence summary (~20-30 tokens)

**Cost Calculation:**

**Example: 20 nodes**
- Input: 20 nodes × 1000 tokens avg = 20,000 tokens
- Output: 20 nodes × 25 tokens avg = 500 tokens

**GPT-4o-mini:**
- Input: 20,000 / 1,000,000 × $0.15 = **$0.003**
- Output: 500 / 1,000,000 × $0.60 = **$0.0003**
- **Total: ~$0.003** (negligible)

**Typical Costs:**
- 10 nodes: ~$0.002
- 20 nodes: ~$0.003
- 50 nodes: ~$0.008

---

## Phase 5: Proposal Storage

### Step 5.1: Store Proposals (`lib/processing/ai-synthesis-pipeline.ts`)

**What happens:**
1. Converts extracted nodes to `proposed_nodes` format
2. Stores in database with:
   - Node content
   - Block metadata (name, type, description, position)
   - Dependencies
   - Attachments
   - Extraction metrics

**No AI/LLM usage** - Database operations

**Cost:** $0

---

## Phase 6: Tree Building (User-Initiated)

### Step 6.1: User Selects Proposals (`app/api/projects/[projectId]/proposals/route.ts`)

**What happens:**
1. User reviews proposals in UI
2. Selects which proposals to include in tree
3. Clicks "Build Tree"

**No AI/LLM usage** - User interaction

**Cost:** $0

---

### Step 6.2: Create Experiment Tree (`app/api/projects/[projectId]/proposals/route.ts`)

**What happens:**
1. Creates `experiment_trees` record
2. Creates `tree_blocks` from consolidated block structure
3. Creates `tree_nodes` from selected proposals
4. Stores `node_content` for each node
5. Links dependencies between nodes

**No AI/LLM usage** - Database operations

**Cost:** $0

---

## Complete Cost Breakdown

### Example: 100-page Dissertation

| Phase | Operation | Model | Input Tokens | Output Tokens | Cost |
|-------|-----------|-------|--------------|---------------|------|
| 1 | File Upload | - | - | - | $0.00 |
| 2 | Preprocessing | - | - | - | $0.00 |
| 3.1 | Complexity Analysis | - | - | - | $0.00 |
| 3.2 | Provider Selection | - | - | - | $0.00 |
| 3.3 | Workflow Extraction | GPT-4o | 80,000 | 12,000 | **$0.32** |
| 3.4 | Block Consolidation | - | - | - | $0.00 |
| 3.5 | Multi-Doc Merge | - | - | - | $0.00 |
| 4.1 | Attachment Resolution | - | - | - | $0.00 |
| 4.2 | Dependency Extraction | - | - | - | $0.00 |
| 4.3 | Nested Tree Detection | - | - | - | $0.00 |
| 4.4 | Node Summaries | GPT-4o-mini | 20,000 | 500 | **$0.003** |
| 5 | Proposal Storage | - | - | - | $0.00 |
| 6 | Tree Building | - | - | - | $0.00 |
| **TOTAL** | | | | | **~$0.32** |

### Cost Ranges by Document Size

| Document Size | Pages | Nodes | Extraction Cost | Summary Cost | **Total** |
|---------------|-------|-------|-----------------|--------------|-----------|
| Short | 10-30 | 5-15 | $0.05 - $0.15 | $0.001 - $0.002 | **$0.05 - $0.15** |
| Standard | 30-80 | 15-30 | $0.15 - $0.35 | $0.002 - $0.004 | **$0.15 - $0.35** |
| Long | 80-150 | 30-50 | $0.35 - $0.60 | $0.004 - $0.008 | **$0.35 - $0.61** |
| Dissertation | 150+ | 40-100+ | $0.60 - $1.20 | $0.008 - $0.015 | **$0.61 - $1.22** |

---

## Provider Selection Strategy

### Automatic Provider Selection

**Small Documents (< 120K tokens):**
- **Primary**: OpenAI GPT-4o (faster, better quality)
- **Fallback**: Gemini 1.5 Pro (if rate limited)

**Large Documents (≥ 120K tokens):**
- **Primary**: Gemini 1.5 Pro (higher input limit, cheaper)
- **Fallback**: OpenAI GPT-4o (if needed)

### Automatic Fallback Triggers

1. **Rate Limit (429)**: Automatically switches to alternative provider
2. **Truncation Error**: Detects incomplete JSON, switches to Gemini
3. **Timeout**: No fallback (returns error)

---

## Performance Characteristics

### Typical Processing Times

| Phase | Time | Notes |
|-------|------|-------|
| File Upload | < 1s | Network dependent |
| Preprocessing | 2-10s | Depends on file size |
| Complexity Analysis | < 1s | Rule-based |
| Provider Selection | < 1s | Rule-based |
| Workflow Extraction | 30-120s | LLM call (largest bottleneck) |
| Block Consolidation | < 1s | Rule-based |
| Attachment Resolution | 2-5s | Pattern matching |
| Dependency Extraction | 1-3s | Rule-based |
| Node Summaries | 5-15s | Multiple LLM calls (batched) |
| Proposal Storage | 1-3s | Database operations |
| **Total** | **45-160s** | For typical document |

### Bottlenecks

1. **Workflow Extraction** (30-120s): Single large LLM call
2. **Node Summaries** (5-15s): Multiple small LLM calls
3. **Preprocessing** (2-10s): File parsing

---

## Error Handling & Resilience

### Automatic Retries

- **Rate Limits**: Exponential backoff (1s, 2s, 4s)
- **Network Errors**: 3 retries with backoff
- **Service Errors (503)**: 3 retries with backoff

### Fallback Mechanisms

- **Provider Fallback**: Automatic switch on rate limit/truncation
- **Timeout Handling**: 2-minute timeout per extraction
- **Partial Results**: Stores what was extracted even if incomplete

---

## Summary

**Total AI/LLM Cost per Document:**
- **Short paper**: $0.05 - $0.15
- **Standard paper**: $0.15 - $0.35
- **Long paper**: $0.35 - $0.61
- **Dissertation**: $0.61 - $1.22

**Primary Cost Driver:**
- Workflow extraction (90-95% of total cost)
- Node summaries (5-10% of total cost)

**Processing Time:**
- **Typical**: 45-160 seconds
- **Bottleneck**: Workflow extraction (30-120s)

**Models Used:**
- **Workflow Extraction**: GPT-4o (primary) or Gemini 1.5 Pro (large docs/fallback)
- **Node Summaries**: GPT-4o-mini (lightweight, fast)
- **Embeddings** (if used): text-embedding-3-small





