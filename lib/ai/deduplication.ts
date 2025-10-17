import { aiProvider } from './provider';

/**
 * Calculate Levenshtein distance between two strings
 * Used for simple text-based similarity detection
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings (0-100)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 100;
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return ((maxLen - distance) / maxLen) * 100;
}

/**
 * Simple text-based duplicate detection
 * Returns similarity percentage (0-100)
 */
export function simpleTextSimilarity(node1: any, node2: any): number {
  // Compare titles
  const title1 = node1.title || '';
  const title2 = node2.title || '';
  const titleSimilarity = calculateSimilarity(title1, title2);

  // Compare first 200 chars of content
  const content1 = (node1.content?.text || '').substring(0, 200);
  const content2 = (node2.content?.text || '').substring(0, 200);
  const contentSimilarity = calculateSimilarity(content1, content2);

  // Weighted average (title is more important)
  return (titleSimilarity * 0.6) + (contentSimilarity * 0.4);
}

/**
 * AI-based semantic duplicate detection
 * Uses AI to determine if two nodes are semantically similar
 */
export async function aiSemanticSimilarity(node1: any, node2: any): Promise<{
  isDuplicate: boolean;
  similarity: number;
  reasoning: string;
}> {
  try {
    const prompt = `You are a scientific research assistant helping to detect duplicate experiment nodes.

Compare these two experiment nodes and determine if they are duplicates or semantically very similar:

NODE 1:
Title: ${node1.title}
Summary: ${node1.short_summary || node1.description || 'N/A'}
Content: ${(node1.content?.text || '').substring(0, 500)}

NODE 2:
Title: ${node2.title}
Summary: ${node2.short_summary || node2.description || 'N/A'}
Content: ${(node2.content?.text || '').substring(0, 500)}

Analyze if these nodes describe:
1. The exact same protocol/procedure
2. Very similar procedures with minor variations
3. Different procedures that happen to share some terminology

Respond in JSON format:
{
  "isDuplicate": boolean,
  "similarity": number (0-100),
  "reasoning": "Brief explanation of why they are or aren't duplicates"
}`;

    const response = await aiProvider.generateText({
      prompt,
      maxTokens: 300,
      temperature: 0.3, // Lower temperature for more consistent detection
    });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const result = JSON.parse(jsonMatch[0]);
    
    console.log(`[DEDUPLICATION] AI similarity for "${node1.title}" vs "${node2.title}": ${result.similarity}%`);
    
    return {
      isDuplicate: result.isDuplicate || false,
      similarity: result.similarity || 0,
      reasoning: result.reasoning || 'No reasoning provided',
    };
  } catch (error) {
    console.error('[DEDUPLICATION] AI semantic similarity failed:', error);
    // Fallback to simple text similarity on error
    const similarity = simpleTextSimilarity(node1, node2);
    return {
      isDuplicate: similarity > 85,
      similarity,
      reasoning: 'Fallback to text-based similarity due to AI error',
    };
  }
}

/**
 * Detect duplicates in a list of nodes
 * Returns pairs of duplicate nodes
 */
export async function detectDuplicates(nodes: any[]): Promise<Array<{
  node1Id: string;
  node2Id: string;
  similarity: number;
  method: 'simple' | 'ai';
  reasoning?: string;
}>> {
  const duplicates: Array<{
    node1Id: string;
    node2Id: string;
    similarity: number;
    method: 'simple' | 'ai';
    reasoning?: string;
  }> = [];

  console.log(`[DEDUPLICATION] Checking ${nodes.length} nodes for duplicates...`);

  // Compare each pair of nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const node1 = nodes[i];
      const node2 = nodes[j];

      // First pass: simple text-based similarity
      const simpleSimilarity = simpleTextSimilarity(
        node1.node_json,
        node2.node_json
      );

      console.log(`[DEDUPLICATION] Simple similarity: "${node1.node_json.title}" vs "${node2.node_json.title}": ${simpleSimilarity.toFixed(1)}%`);

      // If very similar (>85%), mark as duplicate
      if (simpleSimilarity > 85) {
        duplicates.push({
          node1Id: node1.id,
          node2Id: node2.id,
          similarity: simpleSimilarity,
          method: 'simple',
        });
        console.log(`[DEDUPLICATION] ✓ Found duplicate (simple): ${simpleSimilarity.toFixed(1)}%`);
      }
      // If moderately similar (70-85%), use AI for confirmation
      else if (simpleSimilarity > 70 && simpleSimilarity <= 85) {
        console.log(`[DEDUPLICATION] Running AI semantic check for edge case...`);
        try {
          const aiResult = await aiSemanticSimilarity(
            node1.node_json,
            node2.node_json
          );

          if (aiResult.isDuplicate || aiResult.similarity > 80) {
            duplicates.push({
              node1Id: node1.id,
              node2Id: node2.id,
              similarity: aiResult.similarity,
              method: 'ai',
              reasoning: aiResult.reasoning,
            });
            console.log(`[DEDUPLICATION] ✓ Found duplicate (AI): ${aiResult.similarity}% - ${aiResult.reasoning}`);
          }
        } catch (error) {
          console.error(`[DEDUPLICATION] AI check failed for pair, skipping:`, error);
        }
      }
    }
  }

  console.log(`[DEDUPLICATION] Found ${duplicates.length} duplicate pairs`);
  return duplicates;
}

/**
 * Merge duplicate nodes by combining their information
 * Keeps the node with higher confidence and merges unique information
 */
export function mergeNodes(node1: any, node2: any): any {
  // Keep the node with higher confidence
  const primary = node1.confidence >= node2.confidence ? node1 : node2;
  const secondary = node1.confidence >= node2.confidence ? node2 : node1;

  console.log(`[DEDUPLICATION] Merging "${secondary.node_json.title}" into "${primary.node_json.title}"`);

  // Merge provenance sources
  const mergedSources = [
    ...(primary.node_json.provenance?.sources || []),
    ...(secondary.node_json.provenance?.sources || []),
  ];

  // Merge tags (unique)
  const mergedTags = Array.from(new Set([
    ...(primary.node_json.metadata?.tags || []),
    ...(secondary.node_json.metadata?.tags || []),
  ]));

  // Merge links (unique by URL)
  const linkMap = new Map();
  [...(primary.node_json.links || []), ...(secondary.node_json.links || [])].forEach(link => {
    if (!linkMap.has(link.url)) {
      linkMap.set(link.url, link);
    }
  });
  const mergedLinks = Array.from(linkMap.values());

  // Merge attachments (unique by name)
  const attachmentMap = new Map();
  [...(primary.node_json.attachments || []), ...(secondary.node_json.attachments || [])].forEach(att => {
    if (!attachmentMap.has(att.name)) {
      attachmentMap.set(att.name, att);
    }
  });
  const mergedAttachments = Array.from(attachmentMap.values());

  // Create merged node
  return {
    ...primary,
    node_json: {
      ...primary.node_json,
      provenance: {
        ...primary.node_json.provenance,
        sources: mergedSources,
      },
      metadata: {
        ...primary.node_json.metadata,
        tags: mergedTags,
        mergedFrom: secondary.id,
      },
      links: mergedLinks,
      attachments: mergedAttachments,
    },
    confidence: Math.max(primary.confidence, secondary.confidence),
  };
}

