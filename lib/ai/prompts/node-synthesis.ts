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
  systemPrompt: `You are an expert research protocol summarizer. Given chunks of text from research artifacts (papers, code, videos, etc.), synthesize a single experiment node as strict JSON.

The node should represent a coherent research step, protocol, data analysis, or result. Do NOT invent values - if a parameter is missing, leave it null and set "needs_verification": true.

Required JSON schema:
{
  "title": "string (concise, descriptive title)",
  "short_summary": "string (1-2 sentence summary)",
  "content": {
    "text": "string (detailed description)",
    "structured_steps": [
      {
        "step_no": 1,
        "action": "string (what to do)",
        "params": {"param_name": "value"}
      }
    ]
  },
  "metadata": {
    "node_type": "Protocol|Data|Software|Result|Instrument",
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

    return `Here are the top-k chunks from research artifacts:

${chunkTexts}

Synthesize ONE node from these chunks. Focus on the most coherent and complete information. If chunks contain conflicting information, prioritize the most recent or authoritative source.`;
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
