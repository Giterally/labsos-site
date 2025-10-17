export interface ChunkData {
  id: string;
  text: string;
  sourceType: string;
  metadata?: Record<string, any>;
}

export interface NodeSynthesisPrompt {
  systemPrompt: string;
  userPrompt: (chunks: ChunkData[]) => string;
}

export const NODE_SYNTHESIS_PROMPT: NodeSynthesisPrompt = {
  systemPrompt: `You are an expert research protocol synthesizer. Given chunks of text from research artifacts (papers, code, videos, etc.), synthesize ONE RICH, COMPREHENSIVE experiment node as strict JSON.

CRITICAL: Create nodes that are SATURATED with information. Each node should be a complete, standalone unit containing:
- Comprehensive descriptions with full context
- All relevant parameters, methods, and details from the chunks
- Complete step-by-step procedures (if applicable)
- All metadata, links, and attachments mentioned
- Full provenance information

CONSOLIDATION PRINCIPLES:
- Combine related information from ALL chunks into ONE comprehensive node
- DO NOT create sparse or partial nodes - include all available details
- Prefer ONE rich node with complete information over multiple thin nodes
- Avoid redundancy by consolidating similar concepts
- Only create separate nodes for truly distinct research steps

IMPORTANT NAMING GUIDELINES:
- Titles MUST be UNIQUE and SPECIFIC to the content (not generic)
- Use descriptive, differentiating details in titles (e.g., "Differential Expression Analysis - Quality Control Phase", "RNA Extraction Protocol - Cell Lysis Step")
- If multiple similar procedures exist, differentiate them in the title (e.g., "Part 1", "Initial Phase", "Validation Phase")
- Avoid duplicate titles - each node must have a unique, meaningful name
- Keep titles concise but specific (max 60 characters)

NODE TYPE ASSIGNMENT GUIDELINES:
Choose the most appropriate node_type based on the content:

- "protocol": Step-by-step procedures, methods, wet lab protocols, experimental procedures
  Examples: "RNA Extraction Protocol", "Sample Collection Procedure", "Quality Control Protocol"

- "data_creation": Data collection, sequencing, measurement generation, data acquisition
  Examples: "RNA-seq Sequencing", "Microscopy Imaging", "Flow Cytometry Data Collection"

- "analysis": Computational analysis, statistical processing, bioinformatics, data processing
  Examples: "Differential Expression Analysis", "Statistical Analysis", "Bioinformatics Pipeline"

- "results": Findings, output data, validated results, experimental outcomes
  Examples: "Gene Expression Results", "Statistical Test Results", "Validation Outcomes"

- "software": Scripts, tools, computational setup, software installation/configuration
  Examples: "R Script Setup", "Bioinformatics Tools Installation", "Analysis Software Configuration"

DEPENDENCY EXTRACTION:
- Analyze the text for references to other research steps, protocols, or procedures
- Look for keywords like "after", "following", "using results from", "requires", "based on", "using the output of"
- Extract dependencies with appropriate types:
  * "requires": Prerequisite step that must be completed first
  * "uses_output": Uses data or results from another step
  * "follows": Sequential step that comes after another
  * "validates": Verification step that checks results from another step
- Only include dependencies that are explicitly mentioned in the text
- Use descriptive titles for referenced nodes (not generic terms)

Required JSON schema:
{
  "title": "string (topic-oriented umbrella term, max 40 chars)",
  "short_summary": "string (1-sentence summary, max 100 chars)",
  "content": {
    "text": "string (well-formatted, detailed description with proper grammar)",
    "structured_steps": [
      {
        "step_no": 1,
        "action": "string (what to do)",
        "params": {"param_name": "value"}
      }
    ]
  },
  "metadata": {
    "node_type": "protocol|data_creation|analysis|results|software",
    "tags": ["string array"],
    "status": "in_progress|complete|deprecated",
    "parameters": {"key": "value"},
    "estimated_time_minutes": number
  },
  "links": [
    {
      "type": "github|dataset|doi|url",
      "url": "string",
      "desc": "string"
    }
  ],
  "attachments": [
    {
      "id": "attachment-uuid",
      "name": "string",
      "range": "00:01:10-00:01:45 (for video/audio)"
    }
  ],
  "dependencies": [
    {
      "referenced_title": "string (title of prerequisite node)",
      "dependency_type": "requires|uses_output|follows|validates",
      "confidence": 0.85
    }
  ],
  "provenance": {
    "sources": [
      {
        "chunk_id": "uuid",
        "source_type": "pdf|video|github|excel",
        "snippet": "relevant text excerpt"
      }
    ],
    "generated_by": "node-builder-v1",
    "confidence": 0.87
  },
  "needs_verification": boolean
}

Return ONLY valid JSON. No explanations or markdown formatting.`,

  userPrompt: (chunks: ChunkData[]) => {
    const chunkTexts = chunks.map((chunk, index) => 
      `${index + 1}) [chunk-id=${chunk.id}] "${chunk.text}"`
    ).join('\n\n');

    return `Here are related chunks from research artifacts:

${chunkTexts}

IMPORTANT: Synthesize ONE COMPREHENSIVE, INFORMATION-RICH node that consolidates ALL relevant details from these chunks:

1. Combine ALL related information into a single cohesive node
2. Include COMPLETE descriptions, not summaries - saturate the node with details
3. Extract ALL parameters, steps, methods, and metadata mentioned in any chunk
4. Create a UNIQUE, SPECIFIC title that clearly differentiates this node from others
5. If chunks contain conflicting info, reconcile or include both with context
6. Do NOT create sparse nodes - make this a complete, standalone research unit

Focus on creating a rich, comprehensive node that captures the full depth of information available.`;
  }
};

export const NODE_VALIDATION_PROMPT = {
  systemPrompt: `You are a fact-checker for research nodes. Given a generated node and its source chunks, verify whether each claim in the node appears in at least one source chunk.

Return strict JSON:
{
  "is_valid": boolean,
  "missing_claims": ["list of claims not found in sources"],
  "confidence_override": number (0-1, adjust if needed),
  "issues": ["list of potential problems"]
}`,

  userPrompt: (nodeJson: any, chunks: ChunkData[]) => {
    const chunkTexts = chunks.map(chunk => `[${chunk.id}] ${chunk.text}`).join('\n\n');
    
    return `Generated Node:
${JSON.stringify(nodeJson, null, 2)}

Source Chunks:
${chunkTexts}

Validate the node against the source chunks. Check if all parameters, steps, and claims are supported by the source material.`;
  }
};

export const NODE_MERGE_PROMPT = {
  systemPrompt: `You are an expert at merging research nodes. Given multiple related nodes, create a single comprehensive node that combines the best information from all sources.

Follow the same JSON schema as node synthesis. Preserve all unique information and resolve conflicts by choosing the most complete or recent data.`,

  userPrompt: (nodes: any[]) => {
    const nodeTexts = nodes.map((node, index) => 
      `Node ${index + 1}:\n${JSON.stringify(node, null, 2)}`
    ).join('\n\n---\n\n');

    return `Merge these related nodes into a single comprehensive node:

${nodeTexts}

Create one unified node that captures all unique information while avoiding redundancy.`;
  }
};
