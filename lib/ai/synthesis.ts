import { getAIProviderInstance } from './provider';
import { supabaseServer } from '../supabase-server';
import { NODE_SYNTHESIS_PROMPT as NODE_SYNTHESIS_PROMPT_CONFIG } from './prompts/node-synthesis';
import { validateAndFixNode } from './schemas';

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
  retrievedContext?: any; // RAG context from rag-retriever
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
    node_type: 'protocol' | 'data_creation' | 'analysis' | 'results' | 'software';
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
  dependencies: Array<{
    referenced_title: string;
    dependency_type: 'requires' | 'uses_output' | 'follows' | 'validates';
    confidence: number;
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
  const chunksData = input.chunks.map(chunk => ({
    id: chunk.id,
    text: chunk.text,
    sourceType: chunk.sourceType,
    metadata: chunk.metadata,
  }));

  // Build the complete prompt
  const systemPrompt = NODE_SYNTHESIS_PROMPT_CONFIG.systemPrompt;
  const userPrompt = NODE_SYNTHESIS_PROMPT_CONFIG.userPrompt(chunksData);
  
  // Add project context if available
  let finalUserPrompt = userPrompt;
  if (input.projectContext) {
    let contextText = `\n\nProject Context: ${input.projectContext.name}`;
    if (input.projectContext.description) {
      contextText += ` - ${input.projectContext.description}`;
    }
    if (input.projectContext.domain) {
      contextText += ` (Domain: ${input.projectContext.domain})`;
    }
    finalUserPrompt = contextText + '\n\n' + userPrompt;
  }
  
  // Add RAG-retrieved context if available
  if (input.retrievedContext) {
    const { formatContextForPrompt } = await import('./rag-retriever');
    const ragContextText = formatContextForPrompt(input.retrievedContext);
    finalUserPrompt = finalUserPrompt + '\n\n## Retrieved Context\n\n' + ragContextText;
    console.log('[SYNTHESIS] Enhanced prompt with RAG context:', {
      primaryChunks: input.retrievedContext.primaryChunks?.length || 0,
      relatedChunks: input.retrievedContext.relatedChunks?.length || 0,
      dependencyChunks: input.retrievedContext.dependencyChunks?.length || 0,
      existingNodes: input.retrievedContext.existingNodes?.length || 0,
    });
  }

  try {
    const rawResult = await aiProvider.generateJSON(systemPrompt, finalUserPrompt);
    
    // Validate and potentially fix the AI output using Zod schemas
    let result;
    try {
      result = validateAndFixNode(rawResult);
      console.log('[SYNTHESIS] Schema validation passed');
    } catch (validationError: any) {
      console.error('[SYNTHESIS] Schema validation failed:', validationError.message);
      throw new Error(`AI output validation failed: ${validationError.message}`);
    }
    
    // Additional basic validation (redundant but kept for safety)
    if (!result.title || !result.content) {
      throw new Error('Invalid node structure returned from AI');
    }

    // Generate a UUID for the node if not provided
    if (!result.node_id || result.node_id === 'generated-uuid') {
      result.node_id = crypto.randomUUID();
    }

    // Ensure all required fields are present with defaults
    const synthesizedNode: SynthesizedNode = {
      node_id: result.node_id || crypto.randomUUID(),
      title: result.title,
      short_summary: result.short_summary || result.title,
      content: {
        text: result.content?.text || '',
        structured_steps: result.content?.structured_steps || []
      },
      metadata: {
        node_type: result.metadata?.node_type || 'Protocol',
        tags: result.metadata?.tags || [],
        status: result.metadata?.status || 'in_progress',
        parameters: result.metadata?.parameters || {},
        estimated_time_minutes: result.metadata?.estimated_time_minutes || 30
      },
      links: result.links || [],
      attachments: result.attachments || [],
      dependencies: result.dependencies || [],
      provenance: {
        sources: result.provenance?.sources || input.chunks.map(chunk => ({
          chunk_id: chunk.id,
          source_type: chunk.sourceType,
          snippet: chunk.text.substring(0, 200)
        })),
        generated_by: 'node-builder-v2',
        confidence: result.provenance?.confidence || 0.8
      },
      // needs_verification: result.needs_verification || false
    };

    return synthesizedNode;
  } catch (error) {
    console.error('Node synthesis failed:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('rate_limit_error') || error.message.includes('429')) {
        throw new Error('Rate limit exceeded. Please try again in a few minutes.');
      } else if (error.message.includes('Invalid JSON')) {
        throw new Error('AI response format error. Please try again.');
      } else {
        throw new Error(`Failed to synthesize node: ${error.message}`);
      }
    } else {
      throw new Error('Failed to synthesize node: Unknown error');
    }
  }
}

// Store synthesized node in the database
export async function storeSynthesizedNode(
  userId: string,
  projectId: string,
  node: SynthesizedNode,
  status: 'proposed' | 'accepted' | 'rejected' = 'proposed'
): Promise<string> {
  console.log('[STORE_NODE] Storing proposal:', {
    userId,
    projectId,
    nodeId: node.node_id,
    title: node.title,
    hasNodeId: !!node.node_id,
  });

  const { data, error } = await supabaseServer
    .from('proposed_nodes')
    .insert({
      user_id: userId, // Proposals are per-user, per-project
      project_id: projectId,
      node_json: node,
      status,
      confidence: node.provenance.confidence,
      provenance: node.provenance,
      // Note: created_by column doesn't exist in proposed_nodes table
    })
    .select('id')
    .single();

  if (error) {
    console.error('[STORE_NODE] Error storing synthesized node:', error);
    console.error('[STORE_NODE] Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      userId,
      projectId,
      nodeId: node.node_id,
    });
    throw new Error(`Failed to store synthesized node: ${error.message}`);
  }

  console.log('[STORE_NODE] Successfully stored proposal:', data.id);

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

// Generate contextual tree name based on content
export async function generateTreeName(chunks: string[]): Promise<string> {
  const aiProvider = getAIProviderInstance();
  
  const prompt = `Based on the following research content, generate a concise, descriptive tree name (max 50 chars) that captures the main topic/workflow. Format: "[Topic] [Type]" (e.g., "RNA Sequencing Analysis Pipeline", "Protein Expression Study"):

${chunks.slice(0, 3).join('\n\n')}

Tree name:`;
  
  try {
    const response = await aiProvider.generateText(prompt);
    return response.trim() || 'Experiment Workflow';
  } catch (error) {
    console.error('Tree name generation failed:', error);
    return 'Experiment Workflow';
  }
}

// Generate topic-oriented node name
export async function generateNodeName(content: string, context: string): Promise<string> {
  const aiProvider = getAIProviderInstance();
  
  const prompt = `Generate a concise, topic-oriented name (max 40 chars) for this research step that serves as an umbrella term. Be specific and descriptive, avoid generic terms like "Overview" or "Introduction".

Content: ${content.slice(0, 300)}
Context: ${context}

Node name (topic-oriented):`;
  
  try {
    const response = await aiProvider.generateText(prompt);
    return response.trim();
  } catch (error) {
    console.error('Node name generation failed:', error);
    return 'Research Step';
  }
}

// Format content properly with good grammar and presentation
export async function formatNodeContent(rawContent: string): Promise<string> {
  const aiProvider = getAIProviderInstance();
  const startTime = Date.now();
  
  console.log('[FORMAT_CONTENT] Starting content formatting, length:', rawContent.length);
  
  const prompt = `Format this research content into well-structured, readable text with proper grammar, paragraphs, and presentation. Make it natural and professional:

${rawContent}

Formatted content:`;
  
  try {
    // Import withTimeout from provider
    const { withTimeout } = require('./provider');
    
    // Add 5-second timeout to AI formatting
    const response = await withTimeout(
      aiProvider.generateText(prompt),
      5000,
      'Content formatting'
    );
    
    console.log('[FORMAT_CONTENT] Formatting successful in', Date.now() - startTime, 'ms');
    return response.trim();
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error('[FORMAT_CONTENT] Formatting failed after', elapsed, 'ms:', error.message);
    
    // Return original content if formatting fails or times out
    return rawContent;
  }
}

// Generate brief summary for description
export async function generateBriefSummary(content: string): Promise<string> {
  const aiProvider = getAIProviderInstance();
  const startTime = Date.now();
  
  console.log('[GENERATE_SUMMARY] Starting summary generation, content length:', content.length);
  
  const prompt = `Create a single-sentence summary (max 100 chars) of this content:

${content.slice(0, 500)}

Summary:`;
  
  try {
    // Import withTimeout from provider
    const { withTimeout } = require('./provider');
    
    // Add 5-second timeout to summary generation
    const response = await withTimeout(
      aiProvider.generateText(prompt),
      5000,
      'Summary generation'
    );
    
    console.log('[GENERATE_SUMMARY] Summary successful in', Date.now() - startTime, 'ms');
    return response.trim();
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error('[GENERATE_SUMMARY] Summary failed after', elapsed, 'ms:', error.message);
    
    // Return fallback summary if generation fails or times out
    return 'Research protocol step';
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
  if ((node.metadata as any).needs_verification) {
    confidence -= 0.2;
  }

  // Ensure confidence is between 0 and 1
  return Math.max(0, Math.min(1, confidence));
}