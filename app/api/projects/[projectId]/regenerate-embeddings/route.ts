import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { generateBatchEmbeddings } from '@/lib/ai/embeddings';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  let resolvedProjectId: string;
  
  try {
    const { projectId } = await params;

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID
    resolvedProjectId = projectId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      const { data: project, error: projectError } = await supabaseServer
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    // Check project access
    const { data: projectMember } = await supabaseServer
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    console.log(`[REGENERATE_EMBEDDINGS] Starting embedding regeneration for project: ${resolvedProjectId}`);

    // Get all chunks for this project
    const { data: chunks, error: chunksError } = await supabaseServer
      .from('chunks')
      .select('id, text, source_type, source_ref, metadata')
      .eq('project_id', resolvedProjectId);

    if (chunksError) {
      console.error('Error fetching chunks:', chunksError);
      return NextResponse.json({ error: 'Failed to fetch chunks' }, { status: 500 });
    }

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ error: 'No chunks found for this project' }, { status: 404 });
    }

    console.log(`[REGENERATE_EMBEDDINGS] Found ${chunks.length} chunks to regenerate`);

    // Delete existing chunks
    const { error: deleteError } = await supabaseServer
      .from('chunks')
      .delete()
      .eq('project_id', resolvedProjectId);

    if (deleteError) {
      console.error('Error deleting existing chunks:', deleteError);
      return NextResponse.json({ error: 'Failed to delete existing chunks' }, { status: 500 });
    }

    console.log(`[REGENERATE_EMBEDDINGS] Deleted ${chunks.length} existing chunks`);

    // Generate new embeddings with OpenAI
    const texts = chunks.map(chunk => chunk.text);
    const { embeddings, totalTokens } = await generateBatchEmbeddings(texts);

    console.log(`[REGENERATE_EMBEDDINGS] Generated ${embeddings.length} new embeddings`);

    // Prepare data for database insertion
    const chunkData = chunks.map((chunk, index) => ({
      id: chunk.id,
      project_id: resolvedProjectId,
      source_type: chunk.source_type,
      source_ref: chunk.source_ref,
      text: chunk.text,
      embedding: embeddings[index].embedding,
      metadata: {
        ...chunk.metadata,
        tokenCount: embeddings[index].tokenCount,
        embeddingModel: 'text-embedding-3-small', // Always use OpenAI
        regeneratedAt: new Date().toISOString(),
      },
    }));

    // Insert chunks with new embeddings
    const { error: insertError } = await supabaseServer
      .from('chunks')
      .insert(chunkData);

    if (insertError) {
      console.error('Error inserting regenerated chunks:', insertError);
      return NextResponse.json({ error: 'Failed to insert regenerated chunks' }, { status: 500 });
    }

    console.log(`[REGENERATE_EMBEDDINGS] Successfully regenerated embeddings for ${chunks.length} chunks`);

    return NextResponse.json({
      success: true,
      chunksRegenerated: chunks.length,
      totalTokens,
      message: `Successfully regenerated embeddings for ${chunks.length} chunks using OpenAI`
    });

  } catch (error) {
    console.error('[REGENERATE_EMBEDDINGS] Error occurred:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({ 
      error: 'Failed to regenerate embeddings',
      details: errorMessage,
      projectId: resolvedProjectId,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
