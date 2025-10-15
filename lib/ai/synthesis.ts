import { getAIProviderInstance } from './provider';
import { supabaseServer } from '../supabase-server';

export interface NodeSynthesisInput {
  chunks: Array<{
    id: string;
    text: string;
    sourceType: string;
    sourceRef: any;
    metadata: any;
  }>;
  projectContext?: {
    name: string;
    description?: string;
    domain?: string;
  };
}

export interface SynthesizedNode {
  node_id: string;
  title: string;
  short_summary: string;
  content: {
    text: string;
    structured_steps: Array<{
      step_no: number;
      action: string;
      params: Record<string, any>;
    }>;
  };
  metadata: {
    node_type: 'Protocol' | 'Data' | 'Software' | 'Result' | 'Instrument';
    tags: string[];
    status: 'in_progress' | 'complete' | 'deprecated';
    parameters: Record<string, any>;
    estimated_time_minutes: number;
  };
  links: Array<{
    type: 'github' | 'dataset' | 'doi' | 'url';
    url: string;
    desc: string;
  }>;
  attachments: Array<{
    id: string;
    name: string;
    range?: string;
  }>;
  provenance: {
    sources: Array<{
      chunk_id: string;
      source_type: string;
      snippet: string;
      offset: number;
    }>;
    generated_by: string;
    confidence: number;
  };
}

// Node synthesis prompt template
const NODE_SYNTHESIS_PROMPT = `You are an expert research protocol summarizer. Given input chunks (text segments + provenance), synthesize a single node as strict JSON that matches the schema described.

Do NOT invent values; if a parameter is missing, leave it null and set "needs_verification": true. Include top 3 provenance chunk ids that support key assertions.

Here are the top-k chunks:
{chunks}

Return only JSON matching this exact schema:
{
  "node_id": "generated-uuid",
  "title": "string",
  "short_summary": "string", 
  "content": {
    "text": "string",
    "structured_steps": [
      {
        "step_no": 1,
        "action": "string",
        "params": {"param_name": "value"}
      }
    ]
  },
  "metadata": {
    "node_type": "Protocol|Data|Software|Result|Instrument",
    "tags": ["..."],
    "status": "in_progress|complete|deprecated",
    "parameters": {"temp": "37C"},
    "estimated_time_minutes": 15
  },
  "links": [
    {
      "type": "github|dataset|doi|url",
      "url": "...",
      "desc": "..."
    }
  ],
  "attachments": [
    {
      "id": "attachment-uuid",
      "name": "...",
      "range": "00:01:10-00:01:45"
    }
  ],
  "provenance": {
    "sources": [
      {
        "chunk_id": "uuid",
        "source_type": "pdf",
        "snippet": "...",
        "offset": 123
      }
    ],
    "generated_by": "node-builder-v1",
    "confidence": 0.87
  }
}`;

// Synthesize a node from chunks
export async function synthesizeNode(input: NodeSynthesisInput): Promise<SynthesizedNode> {
  const aiProvider = getAIProviderInstance();
  
  // Format chunks for the prompt
  const chunksText = input.chunks.map((chunk, index) => 
    `${index + 1}) [chunk-id=${chunk.id}] "${chunk.text.substring(0, 500)}..."`
  ).join('\n');

  const prompt = NODE_SYNTHESIS_PROMPT.replace('{chunks}', chunksText);
  
  // Add project context if available
  let finalPrompt = prompt;
  if (input.projectContext) {
    let contextText = `\n\nProject Context: ${input.projectContext.name}`;
    if (input.projectContext.description) {
      contextText += ` - ${input.projectContext.description}`;
    }
    if (input.projectContext.domain) {
      contextText += ` (Domain: ${input.projectContext.domain})`;
    }
    finalPrompt = prompt.replace('{chunks}', contextText + '\n\n' + chunksText);
  } else {
    finalPrompt = prompt.replace('{chunks}', chunksText);
  }

  try {
    const result = await aiProvider.generateJSON(finalPrompt);
    
    // Validate the result structure
    if (!result.node_id || !result.title || !result.content) {
      throw new Error('Invalid node structure returned from AI');
    }

    // Generate a UUID for the node if not provided
    if (!result.node_id || result.node_id === 'generated-uuid') {
      result.node_id = crypto.randomUUID();
    }

    return result as SynthesizedNode;
  } catch (error) {
    console.error('Node synthesis failed:', error);
    throw new Error(`Failed to synthesize node: ${error.message}`);
  }
}

// Store synthesized node in the database
export async function storeSynthesizedNode(
  projectId: string,
  node: SynthesizedNode,
  status: 'proposed' | 'accepted' | 'rejected' = 'proposed'
): Promise<string> {
  const { data, error } = await supabaseServer
    .from('proposed_nodes')
    .insert({
      project_id: projectId,
      node_json: node,
      status,
      confidence: node.provenance.confidence,
      provenance: node.provenance,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error storing synthesized node:', error);
    throw new Error(`Failed to store synthesized node: ${error.message}`);
  }

  return data.id;
}

// Validate synthesized node against source chunks
export async function validateSynthesizedNode(
  node: SynthesizedNode,
  sourceChunks: Array<{ id: string; text: string }>
): Promise<{
  isValid: boolean;
  missingClaims: string[];
  confidenceOverride?: number;
}> {
  const aiProvider = getAIProviderInstance();
  
  const validationPrompt = `You are a fact-checker. Given the generated node and its provenance chunk texts, check whether each parameter/claim in node appears in at least one provenance chunk.

Generated Node:
${JSON.stringify(node, null, 2)}

Source Chunks:
${sourceChunks.map(chunk => `[${chunk.id}] ${chunk.text}`).join('\n\n')}

Return a JSON with fields:
{
  "is_valid": boolean,
  "missing_claims": [...],
  "confidence_override": number (0-1)
}`;

  try {
    const result = await aiProvider.generateJSON(validationPrompt);
    return result;
  } catch (error) {
    console.error('Node validation failed:', error);
    return {
      isValid: false,
      missingClaims: ['Validation failed'],
      confidenceOverride: 0.1,
    };
  }
}

// Calculate confidence score based on heuristics
export function calculateConfidence(node: SynthesizedNode): number {
  let confidence = 0.5; // Base confidence

  // Increase confidence based on number of sources
  const sourceCount = node.provenance.sources.length;
  confidence += Math.min(sourceCount * 0.1, 0.3);

  // Increase confidence if node has structured steps
  if (node.content.structured_steps && node.content.structured_steps.length > 0) {
    confidence += 0.1;
  }

  // Increase confidence if node has parameters
  if (node.metadata.parameters && Object.keys(node.metadata.parameters).length > 0) {
    confidence += 0.1;
  }

  // Decrease confidence if node needs verification
  if (node.metadata.needs_verification) {
    confidence -= 0.2;
  }

  // Ensure confidence is between 0 and 1
  return Math.max(0, Math.min(1, confidence));
}