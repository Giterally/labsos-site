import { WorkflowExtractionResult, ExtractedBlock, ExtractedNode } from '@/lib/ai/schemas/workflow-extraction-schema';

interface ConsolidationOptions {
  targetBlockCount?: number; // Default: 5
  minNodesPerBlock?: number; // Default: 2
  mergeSimilarBlocks?: boolean; // Default: true
  similarityThreshold?: number; // Default: 0.6
}

export interface ConsolidationLog {
  originalBlockCount: number;
  finalBlockCount: number;
  mergedBlocks: Array<{
    merged: string[];
    into: string;
    reason: string;
  }>;
}

/**
 * Consolidate extracted blocks to reduce fragmentation
 * Merges single-node blocks, similar blocks, and over-fragmented results
 */
export function consolidateBlocks(
  extractionResult: WorkflowExtractionResult,
  options: ConsolidationOptions = {}
): { result: WorkflowExtractionResult; log: ConsolidationLog } {
  
  const {
    targetBlockCount = 5,
    minNodesPerBlock = 2,
    mergeSimilarBlocks = true,
    similarityThreshold = 0.6
  } = options;

  const blocks = [...extractionResult.blocks];
  const log: ConsolidationLog = {
    originalBlockCount: blocks.length,
    finalBlockCount: blocks.length,
    mergedBlocks: []
  };

  // Skip consolidation if already at target or below
  if (blocks.length <= targetBlockCount) {
    console.log(`[BLOCK_CONSOLIDATOR] Already at target count (${blocks.length} blocks)`);
    return { result: extractionResult, log };
  }

  console.log(`[BLOCK_CONSOLIDATOR] Starting consolidation: ${blocks.length} blocks → target ${targetBlockCount}`);

  // Rule 1: Merge single-node blocks into most similar block
  mergeSingleNodeBlocks(blocks, log);

  // Rule 2: Merge blocks with similar names (>60% similarity)
  if (mergeSimilarBlocks) {
    mergeSimilarNamedBlocks(blocks, similarityThreshold, log);
  }

  // Rule 3: Merge common fragmentation patterns (Results, Analysis, Setup blocks)
  mergeCommonPatterns(blocks, log);

  // Rule 4: If still over target, merge smallest blocks
  while (blocks.length > targetBlockCount * 1.5) {
    mergeSmallestBlocks(blocks, log);
  }

  // Renumber block positions
  blocks.forEach((block, index) => {
    block.position = index + 1;
  });

  log.finalBlockCount = blocks.length;
  
  console.log(`[BLOCK_CONSOLIDATOR] Consolidation complete: ${log.originalBlockCount} → ${log.finalBlockCount} blocks`);
  console.log(`[BLOCK_CONSOLIDATOR] Merged ${log.mergedBlocks.length} times`);

  return {
    result: { ...extractionResult, blocks },
    log
  };
}

/**
 * Rule 1: Merge single-node blocks into semantically similar neighbors
 */
function mergeSingleNodeBlocks(blocks: ExtractedBlock[], log: ConsolidationLog): void {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    
    if (block.nodes.length === 1) {
      // Find most similar block to merge into
      let bestMatch = -1;
      let bestScore = 0;
      
      for (let j = 0; j < blocks.length; j++) {
        if (i === j || blocks[j].nodes.length === 1) continue;
        
        const similarity = calculateBlockSimilarity(block, blocks[j]);
        if (similarity > bestScore) {
          bestScore = similarity;
          bestMatch = j;
        }
      }
      
      // Merge if found a reasonable match
      if (bestMatch !== -1 && bestScore > 0.3) {
        const target = blocks[bestMatch];
        target.nodes.push(...block.nodes);
        
        // Update block name if needed
        if (!target.blockName.includes('&') && bestScore < 0.7) {
          target.blockName = `${target.blockName} & ${block.blockName}`;
        }
        
        log.mergedBlocks.push({
          merged: [block.blockName],
          into: target.blockName,
          reason: `Single-node block merged (similarity: ${Math.round(bestScore * 100)}%)`
        });
        
        blocks.splice(i, 1);
        console.log(`[BLOCK_CONSOLIDATOR] Merged single-node "${block.blockName}" into "${target.blockName}"`);
      }
    }
  }
}

/**
 * Rule 2: Merge blocks with similar names
 */
function mergeSimilarNamedBlocks(
  blocks: ExtractedBlock[], 
  threshold: number, 
  log: ConsolidationLog
): void {
  for (let i = blocks.length - 1; i >= 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      const similarity = calculateNameSimilarity(
        blocks[i].blockName, 
        blocks[j].blockName
      );
      
      if (similarity > threshold) {
        // Merge i into j
        blocks[j].nodes.push(...blocks[i].nodes);
        
        // Create combined name
        const name1 = blocks[j].blockName;
        const name2 = blocks[i].blockName;
        blocks[j].blockName = createMergedName(name1, name2);
        
        log.mergedBlocks.push({
          merged: [blocks[i].blockName],
          into: blocks[j].blockName,
          reason: `Similar names (${Math.round(similarity * 100)}% match)`
        });
        
        blocks.splice(i, 1);
        console.log(`[BLOCK_CONSOLIDATOR] Merged similar blocks: "${name2}" + "${name1}" → "${blocks[j].blockName}"`);
        break;
      }
    }
  }
}

/**
 * Rule 3: Merge common fragmentation patterns
 */
function mergeCommonPatterns(blocks: ExtractedBlock[], log: ConsolidationLog): void {
  const patterns = [
    {
      keywords: ['result', 'evaluation', 'performance', 'analysis', 'assessment', 'comparison'],
      targetName: 'Performance Evaluation & Results Analysis'
    },
    {
      keywords: ['setup', 'configuration', 'implementation', 'development'],
      targetName: 'Model Development & Implementation'
    },
    {
      keywords: ['data', 'collection', 'preprocessing', 'preparation', 'feature', 'engineering'],
      targetName: 'Data Collection & Feature Engineering'
    },
    {
      keywords: ['sentiment', 'analysis', 'ensemble', 'integration'],
      targetName: 'Sentiment Analysis Ensemble & Integration'
    }
  ];

  for (const pattern of patterns) {
    const matchingBlocks: number[] = [];
    
    for (let i = 0; i < blocks.length; i++) {
      const blockNameLower = blocks[i].blockName.toLowerCase();
      const matchCount = pattern.keywords.filter(kw => blockNameLower.includes(kw)).length;
      
      if (matchCount >= 2) {
        matchingBlocks.push(i);
      }
    }
    
    // Merge if found 2+ matching blocks
    if (matchingBlocks.length >= 2) {
      const targetIndex = matchingBlocks[0];
      const mergedNames: string[] = [];
      
      for (let i = matchingBlocks.length - 1; i >= 1; i--) {
        const sourceIndex = matchingBlocks[i];
        blocks[targetIndex].nodes.push(...blocks[sourceIndex].nodes);
        mergedNames.push(blocks[sourceIndex].blockName);
        blocks.splice(sourceIndex, 1);
      }
      
      blocks[targetIndex].blockName = pattern.targetName;
      
      log.mergedBlocks.push({
        merged: mergedNames,
        into: pattern.targetName,
        reason: `Pattern-based consolidation (${pattern.keywords.slice(0, 2).join(', ')}...)`
      });
      
      console.log(`[BLOCK_CONSOLIDATOR] Pattern merge: ${mergedNames.join(' + ')} → "${pattern.targetName}"`);
    }
  }
}

/**
 * Rule 4: Merge smallest blocks if still over target
 */
function mergeSmallestBlocks(blocks: ExtractedBlock[], log: ConsolidationLog): void {
  // Find two smallest blocks
  const sorted = blocks
    .map((block, index) => ({ block, index, size: block.nodes.length }))
    .sort((a, b) => a.size - b.size);
  
  if (sorted.length < 2) return;
  
  const smallest = sorted[0];
  const secondSmallest = sorted[1];
  
  // Merge smallest into second smallest
  secondSmallest.block.nodes.push(...smallest.block.nodes);
  secondSmallest.block.blockName = createMergedName(
    secondSmallest.block.blockName,
    smallest.block.blockName
  );
  
  log.mergedBlocks.push({
    merged: [smallest.block.blockName],
    into: secondSmallest.block.blockName,
    reason: `Size-based merge (${smallest.size} + ${secondSmallest.size} nodes)`
  });
  
  blocks.splice(smallest.index, 1);
  console.log(`[BLOCK_CONSOLIDATOR] Size merge: "${smallest.block.blockName}" → "${secondSmallest.block.blockName}"`);
}

/**
 * Calculate similarity between two block names (word overlap)
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const words1 = new Set(name1.toLowerCase().split(/[\s&]+/).filter(w => w.length > 3));
  const words2 = new Set(name2.toLowerCase().split(/[\s&]+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Calculate semantic similarity between blocks (name + node content)
 */
function calculateBlockSimilarity(block1: ExtractedBlock, block2: ExtractedBlock): number {
  const nameSim = calculateNameSimilarity(block1.blockName, block2.blockName);
  
  // Check if blocks have same blockType
  const typeSim = block1.blockType === block2.blockType ? 0.3 : 0;
  
  return Math.min(nameSim + typeSim, 1.0);
}

/**
 * Create a merged name from two block names
 */
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

/**
 * Extract key term from block name (first 2-3 words)
 */
function extractKeyTerm(name: string): string {
  const words = name.split(/[\s&]+/).filter(w => w.length > 3);
  return words.slice(0, Math.min(3, words.length)).join(' ');
}

