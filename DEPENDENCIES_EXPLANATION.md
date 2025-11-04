# Dependencies in LabsOS: Complete Explanation

## What Are Dependencies?

**Dependencies** are relationships between experiment tree nodes **WITHIN THE SAME TREE** that indicate one node requires, uses output from, follows, or validates another node. They create a graph-based workflow representation where nodes can reference prerequisites from any block (not just sequential ordering).

## ⚠️ Important: Dependencies vs. Nested Trees

**Dependencies** and **Nested Trees** are **completely different concepts**:

### Dependencies
- **Scope:** Within a single tree
- **Relationship:** Node A → Node B (both in same tree)
- **Purpose:** Show workflow relationships (prerequisites, data flow, sequencing)
- **Storage:** `node_dependencies` table
- **Example:** "Statistical Analysis" depends on "Data Collection" (both nodes in same tree)

### Nested Trees
- **Scope:** Between different trees
- **Relationship:** Node in Tree A → Entire Tree B (separate independent tree)
- **Purpose:** Reference reusable procedures/protocols as separate independent trees
- **Storage:** `tree_nodes.referenced_tree_ids` array
- **Example:** "RNA Extraction" node references a separate "RNA Extraction Protocol" tree (complete tree with blocks and nodes)

## Where Dependencies Exist

### 1. **During Workflow Extraction (LLM Phase)**

**Location:** `lib/ai/workflow-extractor.ts` and `lib/ai/schemas/workflow-extraction-schema.ts`

When the LLM extracts workflow nodes from documents, it can identify dependencies in the `dependencies` array within each node:

```typescript
dependencies: z.array(z.object({
  referencedNodeTitle: z.string(),        // Title of the node this depends on
  dependencyType: z.enum([                  // Type of dependency
    'requires',      // Prerequisite (must do X before Y)
    'uses_output',   // Data dependency (uses output/data from X)
    'follows',       // Sequential (after X, do Y)
    'validates'      // Verification (verify/validate X)
  ]),
  extractedPhrase: z.string(),              // Exact phrase from source showing dependency
  confidence: z.number().optional(),        // Confidence score 0-1
  matchedVia: z.string().optional()         // How the dependency was matched
})).default([])
```

**Example from document:**
- Node: "Statistical Analysis" 
- Dependency: `{ referencedNodeTitle: "Data Collection", dependencyType: "uses_output", extractedPhrase: "using data from the previous step" }`

### 2. **In Proposed Nodes (Proposals Table)**

**Location:** `proposed_nodes` table, `node_json` column

After extraction, dependencies are stored in the `node_json` field of `proposed_nodes`:

```json
{
  "title": "Statistical Analysis",
  "content": { "text": "..." },
  "dependencies": [
    {
      "referencedNodeTitle": "Data Collection",
      "dependencyType": "uses_output",
      "extractedPhrase": "using data from the previous step",
      "confidence": 0.85
    }
  ]
}
```

### 3. **During Tree Building (Proposal → Tree Conversion)**

**Location:** `app/api/projects/[projectId]/proposals/route.ts` (lines 992-1074)

When building the tree from accepted proposals, dependencies are extracted and stored:

**Step 1: Extract dependencies from proposals**
```typescript
// For each created node, find its proposal
const proposal = sortedProposals.find(p => p.id === createdNode.provenance.proposal_id);

if (proposal && proposal.node_json?.dependencies) {
  for (const dep of proposal.node_json.dependencies) {
    const referencedTitle = dep.referenced_title || dep.referencedNodeTitle;
    
    // Find the referenced node by matching titles
    const referencedNodeId = nodeTitleToIdMap.get(referencedTitle.toLowerCase());
    
    if (referencedNodeId && referencedNodeId !== createdNode.id) {
      dependencyEntries.push({
        from_node_id: createdNode.id,      // Node that depends
        to_node_id: referencedNodeId,      // Node being depended upon
        dependency_type: dep.dependency_type || 'requires',
        evidence_text: dep.extractedPhrase || dep.evidence || '',
        confidence: dep.confidence || 0.8,
      });
    }
  }
}
```

**Step 2: Validate dependencies**
- Check that target nodes exist (remove orphaned references)
- Store unresolved dependencies in tree metadata for later resolution

**Step 3: Store in database**
```typescript
// Insert valid dependencies into node_dependencies table
await supabaseServer
  .from('node_dependencies')
  .insert(validDependencies);
```

### 4. **In Database (node_dependencies Table)**

**Location:** `migrations/009_add_node_dependencies.sql` and `migrations/035_update_node_dependencies_table.sql`

**Schema:**
```sql
CREATE TABLE node_dependencies (
  id uuid PRIMARY KEY,
  node_id uuid REFERENCES tree_nodes(id),           -- DEPRECATED (kept for compatibility)
  depends_on_node_id uuid REFERENCES tree_nodes(id), -- DEPRECATED (kept for compatibility)
  from_node_id uuid REFERENCES tree_nodes(id),       -- NEW: Node that depends
  to_node_id uuid REFERENCES tree_nodes(id),         -- NEW: Node depended upon
  dependency_type text CHECK (dependency_type IN (
    'requires',      -- Prerequisite
    'uses_output',   -- Data dependency
    'follows',       -- Sequential
    'validates'      -- Verification
  )),
  confidence decimal(3,2) DEFAULT 0.8,              -- Confidence score 0-1
  evidence_text text,                               -- Original phrase from source
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(from_node_id, to_node_id, dependency_type)
);
```

## Dependency Types Explained

### 1. **`requires`** (Prerequisite)
- **Meaning:** Node A must be completed before Node B can start
- **Example:** "Sample Preparation" requires "Equipment Setup"
- **Use case:** Enforcing workflow order

### 2. **`uses_output`** (Data Dependency)
- **Meaning:** Node A uses data/output produced by Node B
- **Example:** "Statistical Analysis" uses_output from "Data Collection"
- **Use case:** Data flow tracking

### 3. **`follows`** (Sequential)
- **Meaning:** Node A naturally follows Node B in sequence
- **Example:** "Data Analysis" follows "Data Collection"
- **Use case:** Logical workflow ordering

### 4. **`validates`** (Verification)
- **Meaning:** Node A validates/verifies results from Node B
- **Example:** "Quality Control" validates "Data Processing"
- **Use case:** Quality assurance workflows

## Dependency Matching Process

When building the tree, dependencies are matched by **node titles**:

1. **Create title-to-ID mapping:**
   ```typescript
   const nodeTitleToIdMap = new Map(
     createdTreeNodes.map(n => [n.name.toLowerCase(), n.id])
   );
   ```

2. **Match dependency titles:**
   ```typescript
   const referencedTitle = dep.referenced_title || dep.referencedNodeTitle;
   const referencedNodeId = nodeTitleToIdMap.get(referencedTitle.toLowerCase());
   ```

3. **Handle unresolved dependencies:**
   - If a referenced node title doesn't match any created node, it's marked as "unresolved"
   - Unresolved dependencies are stored in `experiment_trees.metadata` for manual resolution later

## Example: Dependency Flow

### Document Text:
> "After collecting samples (Step 1), we analyzed them using the data from Step 1."

### Extraction:
```json
{
  "nodeId": "node-2",
  "title": "Sample Analysis",
  "dependencies": [
    {
      "referencedNodeTitle": "Sample Collection",
      "dependencyType": "uses_output",
      "extractedPhrase": "using the data from Step 1",
      "confidence": 0.9
    }
  ]
}
```

### Tree Building:
1. Creates nodes: "Sample Collection" (node-1) and "Sample Analysis" (node-2)
2. Matches dependency by title: "Sample Collection" → node-1
3. Creates dependency: `{ from_node_id: node-2, to_node_id: node-1, dependency_type: 'uses_output' }`

### Database Result:
```sql
INSERT INTO node_dependencies (from_node_id, to_node_id, dependency_type, evidence_text, confidence)
VALUES ('node-2-id', 'node-1-id', 'uses_output', 'using the data from Step 1', 0.9);
```

## Current Status in Your Tree

For the tree "[Plant Tissue Consumption Preferences under Oil Exposure] Study":
- **Total dependencies:** 0
- **Reason:** The LLM extraction didn't identify explicit dependencies in the source document, or they weren't extracted properly

## Where Dependencies Are Used

1. **Visualization:** Dependency graphs can show workflow relationships
2. **Validation:** Ensure prerequisite steps are completed
3. **Workflow Planning:** Determine execution order
4. **Documentation:** Show how steps relate to each other

## How to See Dependencies

1. **In proposals:** Check `proposed_nodes.node_json.dependencies`
2. **In trees:** Query `node_dependencies` table:
   ```sql
   SELECT * FROM node_dependencies 
   WHERE from_node_id IN (
     SELECT id FROM tree_nodes WHERE tree_id = 'your-tree-id'
   );
   ```
3. **In UI:** Dependencies should be visualized in the tree view (if implemented)

## Future Improvements

- Better dependency extraction from documents
- Automatic dependency inference from node content
- Visual dependency graph in the UI
- Dependency validation before tree execution

