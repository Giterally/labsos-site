import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

// Helper function to resolve project ID from slug
async function resolveProjectId(projectId: string): Promise<string> {
  // Check if it's already a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(projectId)) {
    return projectId;
  }

  // If it's a slug, look up the UUID
  const { data: project, error } = await supabaseServer
    .from('projects')
    .select('id')
    .eq('slug', projectId)
    .single();

  if (error || !project) {
    throw new Error('Project not found');
  }

  return project.id;
}

// GET - Fetch all sources for a project
export async function GET(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { projectId } = params;
    const resolvedProjectId = await resolveProjectId(projectId);

    // Get ingestion sources for project
    const { data: sources, error } = await supabaseServer
      .from('ingestion_sources')
      .select(`
        id,
        source_type,
        source_name,
        file_size,
        mime_type,
        status,
        error_message,
        created_at,
        updated_at,
        storage_path
      `)
      .eq('project_id', resolvedProjectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sources:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch sources' 
      }, { status: 500 });
    }

    return NextResponse.json({ sources });

  } catch (error) {
    console.error('Get sources error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// DELETE - Delete specific sources or clear all sources
export async function DELETE(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const { projectId } = params;
    const resolvedProjectId = await resolveProjectId(projectId);
    
    const body = await request.json();
    const { sourceIds, clearAll } = body;

    if (clearAll) {
      // Get all sources for this project to clean up storage
      const { data: allSources, error: fetchError } = await supabaseServer
        .from('ingestion_sources')
        .select('id, storage_path')
        .eq('project_id', resolvedProjectId);

      if (fetchError) {
        console.error('Error fetching sources for cleanup:', fetchError);
        return NextResponse.json({ 
          error: 'Failed to fetch sources for cleanup' 
        }, { status: 500 });
      }

      // Delete files from storage
      if (allSources && allSources.length > 0) {
        const storagePaths = allSources
          .map(source => source.storage_path)
          .filter(path => path); // Only include non-null paths

        if (storagePaths.length > 0) {
          const { error: storageError } = await supabaseServer.storage
            .from('project-uploads')
            .remove(storagePaths);

          if (storageError) {
            console.error('Error deleting files from storage:', storageError);
            // Continue with database cleanup even if storage cleanup fails
          }
        }
      }

      // Delete all sources from database
      const { error: deleteError } = await supabaseServer
        .from('ingestion_sources')
        .delete()
        .eq('project_id', resolvedProjectId);

      if (deleteError) {
        console.error('Error deleting all sources:', deleteError);
        return NextResponse.json({ 
          error: 'Failed to delete sources' 
        }, { status: 500 });
      }

      // Also clean up related data (chunks, proposed nodes, etc.)
      await supabaseServer
        .from('chunks')
        .delete()
        .eq('project_id', resolvedProjectId);

      await supabaseServer
        .from('proposed_nodes')
        .delete()
        .eq('project_id', resolvedProjectId);

      console.log(`Cleared all sources for project ${resolvedProjectId}`);
      return NextResponse.json({ 
        success: true, 
        message: 'All sources cleared successfully',
        deletedCount: allSources?.length || 0
      });

    } else if (sourceIds && Array.isArray(sourceIds) && sourceIds.length > 0) {
      // Delete specific sources
      const { data: sourcesToDelete, error: fetchError } = await supabaseServer
        .from('ingestion_sources')
        .select('id, storage_path')
        .eq('project_id', resolvedProjectId)
        .in('id', sourceIds);

      if (fetchError) {
        console.error('Error fetching sources to delete:', fetchError);
        return NextResponse.json({ 
          error: 'Failed to fetch sources to delete' 
        }, { status: 500 });
      }

      // Delete files from storage
      if (sourcesToDelete && sourcesToDelete.length > 0) {
        const storagePaths = sourcesToDelete
          .map(source => source.storage_path)
          .filter(path => path);

        if (storagePaths.length > 0) {
          const { error: storageError } = await supabaseServer.storage
            .from('project-uploads')
            .remove(storagePaths);

          if (storageError) {
            console.error('Error deleting files from storage:', storageError);
          }
        }
      }

      // Delete sources from database
      const { error: deleteError } = await supabaseServer
        .from('ingestion_sources')
        .delete()
        .eq('project_id', resolvedProjectId)
        .in('id', sourceIds);

      if (deleteError) {
        console.error('Error deleting sources:', deleteError);
        return NextResponse.json({ 
          error: 'Failed to delete sources' 
        }, { status: 500 });
      }

      console.log(`Deleted ${sourceIds.length} sources for project ${resolvedProjectId}`);
      return NextResponse.json({ 
        success: true, 
        message: 'Sources deleted successfully',
        deletedCount: sourceIds.length
      });

    } else {
      return NextResponse.json({ 
        error: 'No source IDs provided or clearAll not specified' 
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Delete sources error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
