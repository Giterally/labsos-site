import OpenAI from 'openai';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-load OpenAI client to allow env vars to be loaded first
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

export interface NodeContentData {
  id: string;
  name: string;
  description?: string;
  content?: string;
  attachments?: Array<{ name: string; description?: string }>;
  links?: Array<{ name: string; url: string; description?: string }>;
}

/**
 * Combine all node content into a single text string for embedding
 */
export function combineNodeContent(node: NodeContentData): string {
  const parts: string[] = [];

  // Add node title (weighted heavily)
  if (node.name) {
    parts.push(`Title: ${node.name}`);
  }

  // Add description
  if (node.description) {
    parts.push(`Description: ${node.description}`);
  }

  // Add main content
  if (node.content) {
    parts.push(`Content: ${node.content}`);
  }

  // Add attachment information
  if (node.attachments && node.attachments.length > 0) {
    const attachmentText = node.attachments
      .map(a => `${a.name}${a.description ? `: ${a.description}` : ''}`)
      .join('; ');
    parts.push(`Attachments: ${attachmentText}`);
  }

  // Add link information
  if (node.links && node.links.length > 0) {
    const linkText = node.links
      .map(l => `${l.name} (${l.url})${l.description ? `: ${l.description}` : ''}`)
      .join('; ');
    parts.push(`Links: ${linkText}`);
  }

  return parts.join('\n\n');
}

/**
 * Generate SHA-256 hash of content to detect changes
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate embedding for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const openai = getOpenAIClient();
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding data returned from OpenAI');
    }

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Update or create embedding for a node
 * Returns true if embedding was updated, false if skipped (no change)
 */
export async function updateNodeEmbedding(
  supabase: SupabaseClient,
  nodeId: string,
  nodeData: NodeContentData
): Promise<boolean> {
  try {
    // Combine all node content
    const contentText = combineNodeContent(nodeData);
    
    // Skip if content is empty
    if (!contentText.trim()) {
      console.log(`Skipping embedding for node ${nodeId} - no content`);
      return false;
    }

    const contentHash = hashContent(contentText);

    // Check if embedding exists and content is unchanged
    const { data: existing, error: fetchError } = await supabase
      .from('node_embeddings')
      .select('content_hash')
      .eq('node_id', nodeId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error checking existing embedding:', fetchError);
      throw fetchError;
    }

    if (existing && existing.content_hash === contentHash) {
      console.log(`Skipping embedding for node ${nodeId} - content unchanged`);
      return false;
    }

    // Generate new embedding
    console.log(`Generating embedding for node ${nodeId}`);
    const embedding = await generateEmbedding(contentText);

    // Store embedding using service role client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { error: upsertError } = await serviceClient
      .from('node_embeddings')
      .upsert({
        node_id: nodeId,
        content_hash: contentHash,
        embedding,
        metadata: {
          token_count: Math.ceil(contentText.length / 4), // Rough estimate
          model: EMBEDDING_MODEL,
          generated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'node_id'
      });

    if (upsertError) {
      console.error('Error storing embedding:', upsertError);
      throw upsertError;
    }

    console.log(`Successfully updated embedding for node ${nodeId}`);
    return true;
  } catch (error) {
    console.error(`Error updating embedding for node ${nodeId}:`, error);
    throw error;
  }
}

/**
 * Update or create embedding for a node with retry queue support
 * Returns success status and whether it was queued
 */
export async function updateNodeEmbeddingWithQueue(
  supabase: SupabaseClient,
  nodeId: string,
  nodeData: NodeContentData
): Promise<{ success: boolean; queued: boolean }> {
  try {
    const updated = await updateNodeEmbedding(supabase, nodeId, nodeData);
    
    // Remove from queue if it was there (successful update)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    await serviceClient
      .from('embedding_queue')
      .delete()
      .eq('node_id', nodeId);
    
    return { success: true, queued: false };
  } catch (error) {
    console.error(`Failed to update embedding for node ${nodeId}, queueing:`, error);
    
    // Add to retry queue
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    await serviceClient
      .from('embedding_queue')
      .upsert({
        node_id: nodeId,
        last_error: error instanceof Error ? error.message : 'Unknown error',
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // Retry in 5 minutes
        retry_count: 0,
      }, {
        onConflict: 'node_id'
      });
    
    return { success: false, queued: true };
  }
}

import { TreeContext, formatTreeContextForLLM } from './tree-context';

/**
 * Generate answer using GPT based on complete tree context with optional conversation history
 */
export async function generateAnswer(
  query: string,
  treeContext: TreeContext,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const openai = getOpenAIClient();
    const formattedContext = formatTreeContextForLLM(treeContext);

    // Build messages array with system prompt, conversation history, and current query
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `You are an intelligent AI assistant helping researchers understand and work with their experiment trees. You have complete access to the experiment tree structure and all its content.

EXPERIMENT TREE STRUCTURE:
- An experiment tree is organized into BLOCKS (workflow sections) that contain NODES (individual steps/components)
- Blocks organize nodes into logical groups (e.g., "Setup", "Data Collection", "Analysis")
- Nodes are individual steps/components within blocks, each with a position indicating order
- Each node can have: content, attachments, links, dependencies on other nodes, and references to nested trees

TREE HIERARCHY:
- Blocks contain nodes: Each block has multiple nodes arranged by position
- Node dependencies: Nodes can depend on other nodes, creating workflow chains (e.g., Node A → Node B → Node C)
- Dependency chains show the flow of work through the experiment
- When discussing hierarchy, explain which blocks contain which nodes and how dependencies connect them

NESTING HIERARCHY:
- Parent trees: Trees that reference this tree via their nodes' referenced_tree_ids
- Child trees: Trees that are referenced by nodes in this tree
- Nesting allows reusable sub-procedures to be referenced across multiple trees
- When discussing nesting, explain which trees are above (parents) or below (children) this tree in the hierarchy
- Include which specific nodes reference or are referenced by nested trees

ATTACHMENTS AND LINKS:
- Each node can have attachments (files, videos, documents) and links (URLs, papers, tools)
- Attachments have names, file types, URLs, and descriptions
- Links have names, URLs, link types, and descriptions
- When referencing attachments or links in your response, mention them by name naturally
- The system will automatically render clickable links and embedded videos (YouTube) in the chat
- You can reference attachments/links by their exact names as they appear in the tree context

YOUR CAPABILITIES:
- Answer questions about the tree structure, organization, and workflow
- Explain specific nodes, blocks, and their relationships
- Help analyze dependencies and workflow flow
- Explain tree hierarchy (blocks → nodes, dependency chains)
- Explain nesting hierarchy (parent/child trees and their positions)
- Answer questions about content, attachments, and links
- Reference attachments and links naturally by name (they will be rendered automatically)
- Provide general assistance and have natural conversations
- Reference specific nodes and blocks by name when relevant

INSTRUCTIONS:
- Be direct, concise, and to the point - avoid unnecessary elaboration
- Answer questions directly without preamble or filler phrases
- Use bullet points or numbered lists when listing multiple items
- Reference specific nodes, blocks, or relationships when relevant
- When discussing hierarchy, explain block→node structure and dependency chains clearly but briefly
- When discussing nesting, explain parent/child tree relationships and positions concisely
- Reference attachments and links by their exact names - they will be automatically rendered
- If asked about something not in the tree, say so clearly and briefly
- Maintain conversation context from previous messages
- Prioritize clarity and brevity over verbosity - get to the point quickly`,
      },
    ];

    // Add conversation history (limit to last 10 messages to avoid token limits)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current context and query
    messages.push({
      role: 'user',
      content: `Here is the complete experiment tree structure:\n\n${formattedContext}\n\nUser question: ${query}`,
    });

    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 2000, // Increased for more detailed responses
    });

    return response.choices[0]?.message?.content || 'Unable to generate answer.';
  } catch (error) {
    console.error('Error generating answer:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate answer: ${error.message}`);
    }
    throw new Error('Failed to generate answer');
  }
}

