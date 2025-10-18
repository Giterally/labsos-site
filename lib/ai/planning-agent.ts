/**
 * Planning Agent
 * 
 * Analyzes the overall structure of uploaded documents before synthesis
 * to understand the complete workflow, identify phases, and map dependencies.
 */

import { getAIProviderInstance } from './provider';
import { supabaseServer } from '../supabase-server';

export interface WorkflowOutline {
  title: string;
  documentType: 'experiment' | 'protocol' | 'analysis' | 'mixed' | 'code' | 'documentation';
  phases: WorkflowPhase[];
  estimatedNodes: number;
  warnings: string[];
  metadata: {
    totalChunks: number;
    analyzedChunks: number;
    confidence: number;
  };
}

export interface WorkflowPhase {
  name: string;
  type: 'protocol' | 'data_creation' | 'analysis' | 'results' | 'software' | 'documentation';
  sections: WorkflowSection[];
  estimatedDuration?: string;
  dependencies: string[]; // Names of phases that must come before
}

export interface WorkflowSection {
  title: string;
  purpose: string;
  keyPoints: string[];
  dependencies: string[]; // Titles of other sections this depends on
  confidence: number;
  estimatedNodes: number;
  tags: string[];
}

/**
 * Generate a workflow outline by analyzing document samples
 */
export async function generateWorkflowOutline(projectId: string): Promise<WorkflowOutline> {
  console.log(`[PLANNING_AGENT] Starting workflow analysis for project: ${projectId}`);
  
  // Get all chunks for this project
  const { data: allChunks, error: chunksError } = await supabaseServer
    .from('chunks')
    .select('id, text, metadata')
    .eq('project_id', projectId)
    .order('metadata->chunkIndex', { ascending: true });
  
  if (chunksError || !allChunks || allChunks.length === 0) {
    throw new Error(`Failed to fetch chunks for planning: ${chunksError?.message || 'No chunks found'}`);
  }
  
  console.log(`[PLANNING_AGENT] Found ${allChunks.length} chunks to analyze`);
  
  // Sample chunks strategically
  const sampledChunks = sampleChunksStrategically(allChunks);
  console.log(`[PLANNING_AGENT] Sampled ${sampledChunks.length} chunks for analysis`);
  
  // Get project context
  const { data: project } = await supabaseServer
    .from('projects')
    .select('name, description')
    .eq('id', projectId)
    .single();
  
  // Generate outline using AI
  const outline = await analyzeWorkflowStructure(
    sampledChunks,
    allChunks.length,
    project
  );
  
  console.log(`[PLANNING_AGENT] Generated outline: "${outline.title}" with ${outline.phases.length} phases and ${outline.estimatedNodes} estimated nodes`);
  
  // Validate and enhance outline
  const validatedOutline = validateOutline(outline, allChunks.length);
  
  return validatedOutline;
}

/**
 * Sample chunks strategically for analysis
 */
function sampleChunksStrategically(chunks: any[]): any[] {
  const sampled: any[] = [];
  
  // Always include first 5 chunks (usually intro/background)
  const firstChunks = chunks.slice(0, Math.min(5, chunks.length));
  sampled.push(...firstChunks);
  
  // Always include last 5 chunks (usually conclusions/results)
  if (chunks.length > 10) {
    const lastChunks = chunks.slice(Math.max(0, chunks.length - 5));
    sampled.push(...lastChunks);
  }
  
  // Sample 20 evenly-spaced chunks from the middle
  if (chunks.length > 15) {
    const middleStart = 5;
    const middleEnd = chunks.length - 5;
    const middleRange = middleEnd - middleStart;
    const samplesNeeded = Math.min(20, middleRange);
    
    if (samplesNeeded > 0) {
      const interval = Math.floor(middleRange / samplesNeeded);
      
      for (let i = 0; i < samplesNeeded; i++) {
        const index = middleStart + (i * interval);
        if (index < middleEnd && index >= 0) {
          sampled.push(chunks[index]);
        }
      }
    }
  }
  
  // Remove duplicates
  const uniqueSampled = Array.from(new Map(sampled.map(c => [c.id, c])).values());
  
  return uniqueSampled;
}

/**
 * Analyze workflow structure using AI
 */
async function analyzeWorkflowStructure(
  sampledChunks: any[],
  totalChunkCount: number,
  project: any
): Promise<WorkflowOutline> {
  const aiProvider = getAIProviderInstance();
  
  // Build analysis prompt
  const systemPrompt = `You are an expert research workflow analyst. Your task is to analyze experimental documentation and create a structured outline of the complete workflow.

You will receive samples from a larger document. Based on these samples, identify:
1. The overall purpose and type of this documentation
2. Major phases of the workflow (e.g., Sample Preparation, Data Generation, Analysis, Results)
3. Key sections within each phase (e.g., RNA Extraction, Quality Control)
4. Dependencies between sections (what must happen before what)
5. Estimated number of nodes needed to represent this workflow
6. Any warnings about missing information or unclear sections

Be specific and concrete. Extract actual process names, not generic placeholders.`;

  const userPrompt = `Project: ${project?.name || 'Unknown'}
${project?.description ? `Description: ${project.description}\n` : ''}
Total chunks in document: ${totalChunkCount}
Samples provided: ${sampledChunks.length}

Document samples:
${sampledChunks.map((chunk, i) => {
  const position = i < 5 ? 'BEGINNING' : i >= sampledChunks.length - 5 ? 'END' : 'MIDDLE';
  return `[${position} - Chunk ${chunk.metadata?.chunkIndex || i}]\n${chunk.text.substring(0, 500)}${chunk.text.length > 500 ? '...' : ''}`;
}).join('\n\n---\n\n')}

Based on these samples, create a comprehensive workflow outline. Return your analysis as JSON with this exact structure:
{
  "title": "Descriptive workflow name (max 80 chars)",
  "documentType": "experiment|protocol|analysis|mixed|code|documentation",
  "phases": [
    {
      "name": "Phase name",
      "type": "protocol|data_creation|analysis|results|software|documentation",
      "sections": [
        {
          "title": "Section title",
          "purpose": "What this section achieves",
          "keyPoints": ["Key concept 1", "Key concept 2", "Key concept 3"],
          "dependencies": ["Title of prerequisite section"],
          "confidence": 0.85,
          "estimatedNodes": 2,
          "tags": ["tag1", "tag2"]
        }
      ],
      "estimatedDuration": "2 hours",
      "dependencies": ["Previous phase name"]
    }
  ],
  "estimatedNodes": 45,
  "warnings": ["Warning text"]
}

Important:
- Be specific: Use actual names from the text, not generic terms
- Dependencies: Only list dependencies that are explicitly needed
- Confidence: 0-1 score based on how clear the section is
- EstimatedNodes: Based on content complexity (1-3 nodes per section typically)
- Warnings: Flag missing info, unclear sections, or data quality issues`;

  try {
    const result = await aiProvider.generateJSON(systemPrompt + '\n\n' + userPrompt);
    
    // Add metadata
    return {
      ...result,
      metadata: {
        totalChunks: totalChunkCount,
        analyzedChunks: sampledChunks.length,
        confidence: calculateOverallConfidence(result),
      },
    };
  } catch (error: any) {
    console.error('[PLANNING_AGENT] Failed to generate workflow outline:', error);
    throw new Error(`Failed to analyze workflow structure: ${error.message}`);
  }
}

/**
 * Calculate overall confidence from sections
 */
function calculateOverallConfidence(outline: any): number {
  if (!outline.phases || outline.phases.length === 0) return 0;
  
  let totalConfidence = 0;
  let sectionCount = 0;
  
  for (const phase of outline.phases) {
    if (phase.sections) {
      for (const section of phase.sections) {
        totalConfidence += section.confidence || 0.5;
        sectionCount++;
      }
    }
  }
  
  return sectionCount > 0 ? totalConfidence / sectionCount : 0.5;
}

/**
 * Validate and enhance the generated outline
 */
function validateOutline(outline: WorkflowOutline, totalChunks: number): WorkflowOutline {
  const warnings = [...(outline.warnings || [])];
  
  // Sanity check on node count
  const estimatedNodesPerChunk = outline.estimatedNodes / totalChunks;
  if (estimatedNodesPerChunk > 2) {
    warnings.push('⚠️ Estimated node count seems high. May generate many small nodes.');
  } else if (estimatedNodesPerChunk < 0.1) {
    warnings.push('⚠️ Estimated node count seems low. May miss important details.');
  }
  
  // Check for missing critical phases in experiments
  if (outline.documentType === 'experiment') {
    const phaseTypes = new Set(outline.phases.map(p => p.type));
    
    if (!phaseTypes.has('results')) {
      warnings.push('⚠️ No results phase detected. This may be incomplete documentation.');
    }
  }
  
  // Check for orphaned sections (no dependencies and no dependents)
  const allSectionTitles = new Set<string>();
  const referencedTitles = new Set<string>();
  
  outline.phases.forEach(phase => {
    phase.sections.forEach(section => {
      allSectionTitles.add(section.title);
      section.dependencies.forEach(dep => referencedTitles.add(dep));
    });
  });
  
  const orphanedSections = [...allSectionTitles].filter(title => {
    const isReferenced = referencedTitles.has(title);
    const section = outline.phases
      .flatMap(p => p.sections)
      .find(s => s.title === title);
    const hasNoDependencies = !section || section.dependencies.length === 0;
    
    return hasNoDependencies && !isReferenced;
  });
  
  if (orphanedSections.length > outline.estimatedNodes * 0.3) {
    warnings.push(`⚠️ Many orphaned sections detected (${orphanedSections.length}). Workflow structure may be unclear.`);
  }
  
  // Check overall confidence
  if (outline.metadata.confidence < 0.5) {
    warnings.push('⚠️ Low confidence in outline. Source documents may be unclear or incomplete.');
  }
  
  return {
    ...outline,
    warnings,
  };
}

/**
 * Get section by title from outline
 */
export function findSectionInOutline(outline: WorkflowOutline, sectionTitle: string): WorkflowSection | null {
  for (const phase of outline.phases) {
    const section = phase.sections.find(s => 
      s.title.toLowerCase() === sectionTitle.toLowerCase() ||
      s.title.toLowerCase().includes(sectionTitle.toLowerCase()) ||
      sectionTitle.toLowerCase().includes(s.title.toLowerCase())
    );
    if (section) return section;
  }
  return null;
}

/**
 * Get dependency sections for a given section
 */
export function getDependencySections(outline: WorkflowOutline, section: WorkflowSection): WorkflowSection[] {
  const dependencies: WorkflowSection[] = [];
  
  for (const depTitle of section.dependencies) {
    const depSection = findSectionInOutline(outline, depTitle);
    if (depSection) {
      dependencies.push(depSection);
    }
  }
  
  return dependencies;
}

/**
 * Generate human-readable summary of outline
 */
export function summarizeOutline(outline: WorkflowOutline): string {
  const phaseSummaries = outline.phases.map(phase => 
    `  • ${phase.name}: ${phase.sections.length} section(s), ~${phase.sections.reduce((sum, s) => sum + s.estimatedNodes, 0)} nodes`
  ).join('\n');
  
  const warningsSummary = outline.warnings.length > 0
    ? `\n\nWarnings:\n${outline.warnings.map(w => `  ${w}`).join('\n')}`
    : '';
  
  return `Workflow Analysis: "${outline.title}"
Type: ${outline.documentType}
Phases: ${outline.phases.length}
Estimated Nodes: ${outline.estimatedNodes}
Confidence: ${(outline.metadata.confidence * 100).toFixed(0)}%

Phase Breakdown:
${phaseSummaries}${warningsSummary}`;
}

