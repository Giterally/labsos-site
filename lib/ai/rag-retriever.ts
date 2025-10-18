/**
 * RAG (Retrieval-Augmented Generation) Retriever
 * 
 * Retrieves relevant context before synthesizing each node to provide:
 * - Related chunks via vector search
 * - Dependency context from prerequisites
 * - Already-created nodes to avoid duplication
 * - Cross-source context from multiple files
 */

import { supabaseServer } from '../supabase-server';
import { getAIProviderInstance } from './provider';
import { WorkflowSection } from './planning-agent';

export interface RetrievedContext {
  primaryChunks: ContextChunk[];
  relatedChunks: ContextChunk[];
  dependencyChunks: ContextChunk[];
  existingNodes: ExistingNode[];
  totalChunksRetrieved: number;
}

export interface ContextChunk {
  id: string;
  text: string;
  sourceType: string;
  sourceName?: string;
  similarity?: number;
  metadata: any;
}

export interface ExistingNode {
  id: string;
  title: string;
  shortSummary: string;
  nodeType: string;
  similarity?: number;
}

export interface RetrievalOptions {
  maxRelatedChunks?: number;
  maxDependencyChunks?: number;
  maxExistingNodes?: number;
  similarityThreshold?: number;
  includeCrossSource?: boolean;
}

const DEFAULT_OPTIONS: RetrievalOptions = {
  maxRelatedChunks: 10,
  maxDependencyChunks: 5,
  maxExistingNodes: 8,
  similarityThreshold: 0.4,
  includeCrossSource: true,
};

/**
 * Retrieve comprehensive context for node synthesis
 */
export async function retrieveContextForSynthesis(
  projectId: string,
  primaryChunkIds: string[],
  sectionInfo: {
    title: string;
    purpose: string;
    keyPoints: string[];
    dependencies: string[];
  },
  options: RetrievalOptions = {}
): Promise<RetrievedContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  console.log(`[RAG_RETRIEVER] Retrieving context for: "${sectionInfo.title}"`);
  
  // Get primary chunks
  const primaryChunks = await getPrimaryChunks(projectId, primaryChunkIds);
  console.log(`[RAG_RETRIEVER] Retrieved ${primaryChunks.length} primary chunks`);
  
  // Build search query from section info
  const searchQuery = buildSearchQuery(sectionInfo);
  
  // Retrieve related chunks via vector search
  const relatedChunks = await retrieveRelatedChunks(
    projectId,
    searchQuery,
    primaryChunkIds,
    opts.maxRelatedChunks!,
    opts.similarityThreshold!
  );
  console.log(`[RAG_RETRIEVER] Retrieved ${relatedChunks.length} related chunks via vector search`);
  
  // Retrieve dependency context
  const dependencyChunks = await retrieveDependencyContext(
    projectId,
    sectionInfo.dependencies,
    opts.maxDependencyChunks!
  );
  console.log(`[RAG_RETRIEVER] Retrieved ${dependencyChunks.length} dependency chunks`);
  
  // Retrieve existing nodes to avoid duplication
  const existingNodes = await retrieveExistingNodes(
    projectId,
    sectionInfo.title,
    opts.maxExistingNodes!,
    opts.similarityThreshold!
  );
  console.log(`[RAG_RETRIEVER] Retrieved ${existingNodes.length} existing nodes for deduplication`);
  
  const totalRetrieved = primaryChunks.length + relatedChunks.length + dependencyChunks.length;
  console.log(`[RAG_RETRIEVER] Total context retrieved: ${totalRetrieved} chunks + ${existingNodes.length} nodes`);
  
  return {
    primaryChunks,
    relatedChunks,
    dependencyChunks,
    existingNodes,
    totalChunksRetrieved: totalRetrieved,
  };
}

/**
 * Get primary chunks (the cluster chunks)
 */
async function getPrimaryChunks(projectId: string, chunkIds: string[]): Promise<ContextChunk[]> {
  const { data: chunks, error } = await supabaseServer
    .from('chunks')
    .select('id, text, source_type, source_ref, metadata')
    .eq('project_id', projectId)
    .in('id', chunkIds);
  
  if (error) {
    console.error('[RAG_RETRIEVER] Error fetching primary chunks:', error);
    return [];
  }
  
  return (chunks || []).map(chunk => ({
    id: chunk.id,
    text: chunk.text,
    sourceType: chunk.source_type,
    sourceName: chunk.source_ref?.sourceName,
    metadata: chunk.metadata,
  }));
}

/**
 * Build search query from section information
 */
function buildSearchQuery(sectionInfo: {
  title: string;
  purpose: string;
  keyPoints: string[];
}): string {
  const parts = [
    sectionInfo.title,
    sectionInfo.purpose,
    ...sectionInfo.keyPoints.slice(0, 5), // Top 5 key points
  ];
  
  return parts.filter(p => p).join(' ');
}

/**
 * Retrieve related chunks via vector similarity search
 */
async function retrieveRelatedChunks(
  projectId: string,
  searchQuery: string,
  excludeChunkIds: string[],
  maxChunks: number,
  similarityThreshold: number
): Promise<ContextChunk[]> {
  try {
    // Generate embedding for search query
    const aiProvider = getAIProviderInstance();
    const queryEmbedding = await aiProvider.generateEmbedding(searchQuery);
    
    // Perform vector similarity search using pgvector
    const { data: similarChunks, error } = await supabaseServer.rpc(
      'match_chunks',
      {
        query_embedding: queryEmbedding,
        match_threshold: similarityThreshold,
        match_count: maxChunks * 2, // Get more to filter
        project_id_filter: projectId,
      }
    );
    
    if (error) {
      console.warn('[RAG_RETRIEVER] Vector search failed, falling back to keyword search:', error);
      return await retrieveByKeywords(projectId, searchQuery, excludeChunkIds, maxChunks);
    }
    
    // Filter out primary chunks and limit results
    const filtered = (similarChunks || [])
      .filter((chunk: any) => !excludeChunkIds.includes(chunk.id))
      .slice(0, maxChunks)
      .map((chunk: any) => ({
        id: chunk.id,
        text: chunk.text,
        sourceType: chunk.source_type,
        sourceName: chunk.source_ref?.sourceName,
        similarity: chunk.similarity,
        metadata: chunk.metadata,
      }));
    
    // If vector search returned too few results, supplement with keyword search
    if (filtered.length < maxChunks / 2) {
      const keywordResults = await retrieveByKeywords(
        projectId,
        searchQuery,
        [...excludeChunkIds, ...filtered.map(c => c.id)],
        maxChunks - filtered.length
      );
      return [...filtered, ...keywordResults];
    }
    
    return filtered;
  } catch (error: any) {
    console.error('[RAG_RETRIEVER] Error in vector search:', error);
    // Fallback to keyword search
    return await retrieveByKeywords(projectId, searchQuery, excludeChunkIds, maxChunks);
  }
}

/**
 * Retrieve chunks by keyword matching (fallback)
 */
async function retrieveByKeywords(
  projectId: string,
  searchQuery: string,
  excludeChunkIds: string[],
  maxChunks: number
): Promise<ContextChunk[]> {
  // Extract key terms (words > 3 chars)
  const keywords = searchQuery
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 10); // Top 10 keywords
  
  if (keywords.length === 0) return [];
  
  // Build search pattern for PostgreSQL full-text search
  const searchPattern = keywords.join(' | ');
  
  const { data: chunks, error } = await supabaseServer
    .from('chunks')
    .select('id, text, source_type, source_ref, metadata')
    .eq('project_id', projectId)
    .not('id', 'in', `(${excludeChunkIds.join(',')})`)
    .textSearch('text', searchPattern)
    .limit(maxChunks);
  
  if (error) {
    console.error('[RAG_RETRIEVER] Keyword search error:', error);
    return [];
  }
  
  return (chunks || []).map(chunk => ({
    id: chunk.id,
    text: chunk.text,
    sourceType: chunk.source_type,
    sourceName: chunk.source_ref?.sourceName,
    metadata: chunk.metadata,
  }));
}

/**
 * Retrieve chunks related to dependency sections
 */
async function retrieveDependencyContext(
  projectId: string,
  dependencyTitles: string[],
  maxChunks: number
): Promise<ContextChunk[]> {
  if (dependencyTitles.length === 0) return [];
  
  const dependencyChunks: ContextChunk[] = [];
  const chunksPerDependency = Math.ceil(maxChunks / dependencyTitles.length);
  
  for (const depTitle of dependencyTitles) {
    // Search for chunks mentioning this dependency
    const { data: chunks, error } = await supabaseServer
      .from('chunks')
      .select('id, text, source_type, source_ref, metadata')
      .eq('project_id', projectId)
      .ilike('text', `%${depTitle}%`)
      .limit(chunksPerDependency);
    
    if (!error && chunks) {
      dependencyChunks.push(...chunks.map(chunk => ({
        id: chunk.id,
        text: chunk.text,
        sourceType: chunk.source_type,
        sourceName: chunk.source_ref?.sourceName,
        metadata: chunk.metadata,
      })));
    }
  }
  
  return dependencyChunks.slice(0, maxChunks);
}

/**
 * Retrieve existing nodes to check for duplicates
 */
async function retrieveExistingNodes(
  projectId: string,
  sectionTitle: string,
  maxNodes: number,
  similarityThreshold: number
): Promise<ExistingNode[]> {
  // Get all proposed and accepted nodes for this project
  const { data: nodes, error } = await supabaseServer
    .from('proposed_nodes')
    .select('id, node_json, confidence')
    .eq('project_id', projectId)
    .in('status', ['proposed', 'accepted'])
    .limit(100); // Get up to 100 to check
  
  if (error || !nodes) {
    console.error('[RAG_RETRIEVER] Error fetching existing nodes:', error);
    return [];
  }
  
  // Calculate similarity to section title
  const nodesWithSimilarity = nodes.map(node => {
    const nodeTitle = node.node_json?.title || '';
    const titleSimilarity = calculateTextSimilarity(sectionTitle.toLowerCase(), nodeTitle.toLowerCase());
    
    return {
      id: node.id,
      title: nodeTitle,
      shortSummary: node.node_json?.short_summary || '',
      nodeType: node.node_json?.metadata?.node_type || 'unknown',
      similarity: titleSimilarity,
    };
  });
  
  // Filter by similarity and sort
  return nodesWithSimilarity
    .filter(node => node.similarity >= similarityThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxNodes);
}

/**
 * Simple text similarity calculation (Jaccard similarity)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Check if a node is a duplicate of existing nodes
 */
export function checkDuplication(
  sectionTitle: string,
  existingNodes: ExistingNode[]
): { isDuplicate: boolean; duplicateOf?: ExistingNode; similarity: number } {
  if (existingNodes.length === 0) {
    return { isDuplicate: false, similarity: 0 };
  }
  
  // Find the most similar existing node
  const mostSimilar = existingNodes.reduce((max, node) => 
    (node.similarity || 0) > (max.similarity || 0) ? node : max
  );
  
  // Consider duplicate if similarity > 85%
  if ((mostSimilar.similarity || 0) > 0.85) {
    return {
      isDuplicate: true,
      duplicateOf: mostSimilar,
      similarity: mostSimilar.similarity || 0,
    };
  }
  
  // Consider highly similar if similarity > 50%
  if ((mostSimilar.similarity || 0) > 0.5) {
    return {
      isDuplicate: false,
      similarity: mostSimilar.similarity || 0,
    };
  }
  
  return { isDuplicate: false, similarity: 0 };
}

/**
 * Format retrieved context for synthesis prompt
 */
export function formatContextForPrompt(context: RetrievedContext): string {
  let formatted = '';
  
  // Primary content section
  formatted += '## Primary Content (Main Source)\n';
  context.primaryChunks.forEach((chunk, i) => {
    formatted += `\n[Primary Chunk ${i + 1}]\n${chunk.text}\n`;
  });
  
  // Related content section
  if (context.relatedChunks.length > 0) {
    formatted += '\n## Related Content (Additional Context)\n';
    formatted += 'The following chunks provide related information that may be relevant:\n';
    context.relatedChunks.slice(0, 5).forEach((chunk, i) => {
      formatted += `\n[Related Chunk ${i + 1}${chunk.similarity ? ` - ${(chunk.similarity * 100).toFixed(0)}% similar` : ''}]\n${chunk.text.substring(0, 500)}${chunk.text.length > 500 ? '...' : ''}\n`;
    });
  }
  
  // Dependency context section
  if (context.dependencyChunks.length > 0) {
    formatted += '\n## Prerequisites and Dependencies\n';
    formatted += 'Information about prerequisite steps:\n';
    context.dependencyChunks.forEach((chunk, i) => {
      formatted += `\n[Dependency Context ${i + 1}]\n${chunk.text.substring(0, 400)}${chunk.text.length > 400 ? '...' : ''}\n`;
    });
  }
  
  // Existing nodes section
  if (context.existingNodes.length > 0) {
    formatted += '\n## Already Created Nodes (Avoid Duplication)\n';
    formatted += 'These nodes have already been created. Reference them rather than duplicating:\n';
    context.existingNodes.forEach((node, i) => {
      formatted += `\n[Existing Node ${i + 1}] "${node.title}" (${node.nodeType})${node.similarity ? ` - ${(node.similarity * 100).toFixed(0)}% similar` : ''}\nSummary: ${node.shortSummary}\n`;
    });
  }
  
  return formatted;
}

